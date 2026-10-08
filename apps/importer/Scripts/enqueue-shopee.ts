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

dotenv.config();

const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const db = (admin as any).schema('rate');

function parseItem(url: string): { itemId: string; shopId: string } | null {
  const m = url.match(/(?:a-)?i\.(\d+)\.(\d+)/);
  return m ? { shopId: m[1], itemId: m[2] } : null;
}

async function main() {
  const args = process.argv.slice(2);
  let urls: string[] = [];
  if (args[0] === '--file') {
    urls = fs.readFileSync(args[1], 'utf-8').split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
  } else {
    urls = args.filter((a) => a.startsWith('http'));
  }
  if (urls.length === 0) {
    console.error('Usage: tsx Scripts/enqueue-shopee.ts <url1> [url2...] | --file targets.txt');
    process.exit(1);
  }

  const { data: runId, error: runErr } = await db.rpc('start_crawl_run', { p_source: 'enqueue-cli', p_params: { count: urls.length } });
  if (runErr || !runId) {
    console.error(`[Enqueue] start_crawl_run failed: ${runErr?.message}`);
    process.exit(1);
  }
  console.log(`[Enqueue] run=${runId}`);

  let failures = 0;
  for (const url of urls) {
    const ids = parseItem(url);
    if (!ids) {
      console.error(`[Enqueue] SKIP unparseable: ${url}`);
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
      console.error(`[Enqueue] FAIL ${ids.itemId}: ${error.message}`);
      failures += 1;
    } else {
      console.log(`[Enqueue] job=${data[0]?.job_id ?? data?.job_id} state=${data[0]?.state ?? data?.state} item=${ids.itemId}`);
    }
  }
  // Close the run: an enqueue-only run has no worker, so leaving it
  // 'running' would linger until the 6h timeout aborts it.
  await db.rpc('finish_crawl_run', { p_run_id: runId, p_stats: { enqueued: urls.length - failures, failed: failures } });

  // Non-zero exit when anything failed so automation cannot mistake a
  // partially-failed or fully-skipped enqueue for success (Codex SHOULD).
  process.exit(failures > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
