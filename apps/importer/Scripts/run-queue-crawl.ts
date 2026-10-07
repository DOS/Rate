#!/usr/bin/env node
/**
 * Queue-driven Shopee crawl driver (plan v7 §4.1 recipe):
 *   1. Launch cloned-Chrome-Stable via CDP + optional 4G proxy (home IP is the
 *      proven default for Shopee - pass USE_4G=1 to route through mproxy).
 *   2. Warm up the store page (cold PDP jumps are what Shopee risk control flags).
 *   3. Run the queue worker until the queue drains, then finish the run and
 *      tear the browser down.
 *
 * Usage: tsx Scripts/run-queue-crawl.ts [--max-jobs N]
 * Enqueue jobs first with Scripts/enqueue-shopee.ts.
 */
import fs from 'node:fs';
import { execSync } from 'node:child_process';
import dotenv from 'dotenv';
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { ProxyManager } from '../src/shopee/proxy-manager.js';
import { ShopeeScraper } from '../src/shopee/shopee-scraper.js';
import { ShopeeIngestionPipeline } from '../src/shopee/shopee-to-supabase.js';
import { QueueDrivenShopeeCrawler } from '../src/shopee/queue-worker.js';

dotenv.config();

const CDP = 'http://127.0.0.1:9222';
const WORKER_ID = `worker-${process.pid}-${new Date().toISOString().slice(0, 16)}`;
// Proven-safe cloned profile (Chrome refuses CDP on the default User Data dir).
const PROFILE_DIR = process.env.CRAWL_PROFILE_DIR || 'C:\\chrome_cdp_profiles\\stable';

function killCdpBrowser(): void {
  try {
    execSync(
      `powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \\"Name='chrome.exe'\\" | Where-Object { $_.CommandLine -like '*remote-debugging-port=9222*' -and $_.CommandLine -notlike '*--type=*' } | ForEach-Object { taskkill /PID $_.ProcessId /T /F 2>&1 | Out-Null }"`,
      { stdio: 'ignore' }
    );
  } catch {}
}

async function main() {
  const maxJobsArg = process.argv.indexOf('--max-jobs');
  const maxJobs = maxJobsArg > -1 ? parseInt(process.argv[maxJobsArg + 1], 10) : undefined;
  const use4g = process.env.USE_4G === '1';

  const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const db = (admin as any).schema('rate');

  const pm = new ProxyManager();
  if (use4g) {
    const ip = await pm.getCurrentIp();
    console.log(`[Run] 4G proxy IP: ${ip}`);
  } else {
    console.log('[Run] Direct home IP (proven recipe for Shopee).');
  }

  killCdpBrowser();

  let chromeUp = false;
  try {
    if (use4g) {
      chromeUp = await pm.launchChromeWithProxy(9222, PROFILE_DIR);
    } else {
      const { spawn } = await import('node:child_process');
      const http = await import('node:http');
      const proc = spawn(
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        ['--remote-debugging-port=9222', `--user-data-dir=${PROFILE_DIR}`, '--no-first-run', '--no-default-browser-check'],
        { detached: true, stdio: 'ignore' }
      );
      proc.unref();
      for (let i = 0; i < 20; i++) {
        await new Promise((r) => setTimeout(r, 500));
        chromeUp = await new Promise<boolean>((resolve) => {
          http.get(`${CDP}/json/version`, (res) => resolve(res.statusCode === 200)).on('error', () => resolve(false));
        });
        if (chromeUp) break;
      }
    }
  } catch (e: any) {
    console.error(`[Run] Chrome launch failed: ${e.message}`);
  }
  if (!chromeUp) {
    console.error('[Run] CDP Chrome did not come up; aborting.');
    await pm.stopLocalForwarder().catch(() => {});
    process.exit(1);
  }
  console.log('[Run] CDP Chrome is up.');

  const { data: runId, error: runErr } = await db.rpc('start_crawl_run', {
    p_source: 'queue-worker',
    p_params: { worker: WORKER_ID, use4g, maxJobs: maxJobs ?? null },
  });
  if (runErr) {
    console.error(`[Run] start_crawl_run failed: ${runErr.message}`);
    killCdpBrowser();
    await pm.stopLocalForwarder().catch(() => {});
    process.exit(1);
  }
  console.log(`[Run] crawl run=${runId}`);

  const b = await chromium.connectOverCDP(CDP);
  const ctx = b.contexts()[0];
  const scraper = new ShopeeScraper({ cdpEndpoint: CDP, maxReviews: 10, timeoutMs: 90000, proxy: use4g, autoRotateOnBlock: true });
  const pipeline = new ShopeeIngestionPipeline();
  await pipeline.init();

  const worker = new QueueDrivenShopeeCrawler({
    supabase: db,
    pipeline,
    workerId: WORKER_ID,
    platform: 'shopee',
    getRunId: () => runId,
    maxJobs,
    idlePollMs: 15000,
    maxIdlePolls: 2,
    scrape: async (job) => {
      const url = job.target_url;
      if (!url) throw new Error('job has no target_url');
      // Human-like warm-up FIRST (cold PDP jump is what risk control flags).
      const probe = await ctx.newPage();
      try {
        await probe.goto('https://shopee.vn/samsung_official_store', { waitUntil: 'domcontentloaded', timeout: 60000 });
        await probe.waitForTimeout(3000);
        await probe.evaluate(() => window.scrollBy({ top: 800, behavior: 'smooth' }));
        await probe.waitForTimeout(1000);
      } catch (e: any) {
        console.warn(`[Run] store warm-up skipped: ${e.message.split('\n')[0]}`);
      } finally {
        await probe.close().catch(() => {});
      }
      return scraper.scrapeProduct(url);
    },
  });

  let processed = 0;
  try {
    processed = await worker.run();
    console.log(`[Run] worker finished, processed=${processed}`);
  } finally {
    await db.rpc('finish_crawl_run', { p_run_id: runId, p_stats: { processed } }).catch(() => {});
    killCdpBrowser(); // only our CDP instance
    await pm.stopLocalForwarder().catch(() => {});
    console.log('[Run] Chrome closed, forwarder stopped.');
  }
  process.exit(0);
}

main().catch((e) => {
  console.error('[Run] FATAL:', e.message);
  process.exit(1);
});
