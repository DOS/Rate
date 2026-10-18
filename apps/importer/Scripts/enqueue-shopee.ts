#!/usr/bin/env node
/**
 * Enqueue Shopee product URLs as rate.crawl_jobs rows (via enqueue_crawl_job RPC).
 *
 * Usage:
 *   tsx Scripts/enqueue-shopee.ts <url1> [url2 ...]
 *   tsx Scripts/enqueue-shopee.ts --file targets.txt
 */
import fs from 'node:fs';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { createImporterLogger } from '../src/shopee/logger.js';
import { scopeSupabaseToRate } from '../src/shopee/types.js';

dotenv.config();

const logger = createImporterLogger('EnqueueShopee');
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const db = scopeSupabaseToRate(admin);

function parseItem(url: string): { itemId: string; shopId: string } | null {
  const m = url.match(/(?:a-)?i\.(\d+)\.(\d+)/);
  return m ? { shopId: m[1]!, itemId: m[2]! } : null;
}

async function main() {
  const args = process.argv.slice(2);
  let urls: string[] = [];
  if (args[0] === '--file') {
    urls = fs
      .readFileSync(args[1]!, 'utf-8')
      .split(/\r?\n/)
      .map(l => l.trim())
      .filter(l => l && !l.startsWith('#'));
  } else {
    urls = args.filter(a => a.startsWith('http'));
  }
  if (urls.length === 0) {
    logger.error(
      'enqueue.usage',
      'Usage: tsx Scripts/enqueue-shopee.ts <url1> [url2...] | --file targets.txt'
    );
    process.exit(1);
  }

  const { data: runId, error: runErr } = await db.rpc('start_crawl_run', {
    p_source: 'enqueue-cli',
    p_params: { count: urls.length },
  });
  if (runErr || !runId) {
    logger.error('enqueue.start_run_failed', `start_crawl_run failed: ${runErr?.message}`);
    process.exit(1);
  }
  logger.info('enqueue.run_started', `run=${runId}`, { runId: String(runId) });

  let failures = 0;
  for (const url of urls) {
    const ids = parseItem(url);
    if (!ids) {
      logger.error('enqueue.unparseable_url', `SKIP unparseable: ${url}`, { url });
      failures += 1;
      continue;
    }
    const { data, error } = await db.rpc('enqueue_crawl_job', {
      p_type: 'crawl_listing',
      p_platform: 'shopee',
      p_payload: { schema_version: 1, url },
      p_target_url: url,
      p_platform_item_id: ids.itemId,
      p_platform_shop_id: ids.shopId,
      p_priority: 0,
      p_run_id: runId,
    });
    if (error) {
      logger.error('enqueue.job_failed', `FAIL ${ids.itemId}: ${error.message}`, {
        itemId: ids.itemId,
      });
      failures += 1;
    } else {
      const row = Array.isArray(data)
        ? (data[0] as { job_id?: string; state?: string } | undefined)
        : (data as { job_id?: string; state?: string } | null);
      logger.info(
        'enqueue.job_created',
        `job=${row?.job_id} state=${row?.state} item=${ids.itemId}`,
        {
          jobId: row?.job_id ?? null,
          state: row?.state ?? null,
          itemId: ids.itemId,
        }
      );
    }
  }
  // Close the run: an enqueue-only run has no worker, so leaving it
  // 'running' would linger until the 6h timeout aborts it.
  await db.rpc('finish_crawl_run', {
    p_run_id: runId,
    p_stats: { enqueued: urls.length - failures, failed: failures },
  });

  // Non-zero exit when anything failed so automation cannot mistake a
  // partially-failed or fully-skipped enqueue for success (Codex SHOULD).
  process.exit(failures > 0 ? 1 : 0);
}

main().catch((e: unknown) => {
  logger.error('enqueue.fatal', e instanceof Error ? e.message : String(e));
  process.exit(1);
});
