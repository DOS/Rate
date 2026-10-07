import type { ShopeeProduct } from './shopee-scraper.js';
import { ShopeeIngestionPipeline } from './shopee-to-supabase.js';

export interface QueueJobRow {
  id: string;
  type: string;
  platform: string;
  status: string;
  payload: Record<string, unknown>;
  target_url: string | null;
  platform_item_id: string | null;
  platform_shop_id: string | null;
  attempts: number;
  max_attempts: number;
  claim_token: string;
  worker_id: string | null;
  progress: Record<string, unknown>;
}

export interface QueueWorkerOptions {
  /** Supabase client already scoped to schema 'rate' (getRateClient-style). */
  supabase: any;
  /** The ingest pipeline (built once, reused across jobs). */
  pipeline: ShopeeIngestionPipeline;
  /** How a job's target URL is scraped. Returns the ShopeeProduct. */
  scrape: (job: QueueJobRow) => Promise<ShopeeProduct>;
  workerId: string;
  platform: string;
  /** Lease duration per claim (heartbeat extends it for long crawls). */
  leaseMinutes?: number;
  /** Heartbeat interval while scraping (must be < lease). */
  heartbeatSeconds?: number;
  /** Exit after this many processed jobs (default: run until queue empty). */
  maxJobs?: number;
  /** Sleep between polls when the queue is empty (ms). */
  idlePollMs?: number;
  /** Give up idle-waiting after this many consecutive empty polls. */
  maxIdlePolls?: number;
  /** Default run id for ack'd jobs (start_crawl_run once per worker session). */
  getRunId?: () => string | null;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Queue-driven crawler worker (plan v7 §4.1): claims rate.crawl_jobs through
 * the SECURITY DEFINER RPCs, heartbeats long scrapes, checkpoints section
 * completion, and acks/fails with the per-claim token fence. Direct DML on
 * crawl_jobs is revoked server-side, so these RPCs are the only interaction.
 */
export class QueueDrivenShopeeCrawler {
  constructor(private opts: QueueWorkerOptions) {}

  private db() {
    return this.opts.supabase;
  }

  /** Claim exactly one job. Returns null when the queue is empty. */
  public async dequeue(): Promise<QueueJobRow | null> {
    const { data, error } = await this.db().rpc('dequeue_crawl_job', {
      p_worker_id: this.opts.workerId,
      p_platform: this.opts.platform,
      p_lease: `${this.opts.leaseMinutes ?? 10} minutes`,
    });
    if (error) {
      throw new Error(`dequeue_crawl_job failed: ${error.message}`);
    }
    const row = Array.isArray(data) ? data[0] : data;
    return (row as QueueJobRow) ?? null;
  }

  public async heartbeat(job: QueueJobRow, extend = `${this.opts.leaseMinutes ?? 10} minutes`): Promise<boolean> {
    const { data, error } = await this.db().rpc('heartbeat_crawl_job', {
      p_id: job.id,
      p_claim_token: job.claim_token,
      p_extend: extend,
    });
    if (error) return false;
    return data === true;
  }

  public async checkpoint(job: QueueJobRow, progress: Record<string, unknown>): Promise<void> {
    const { error } = await this.db().rpc('checkpoint_crawl_job', {
      p_id: job.id,
      p_claim_token: job.claim_token,
      p_progress: { ...job.progress, ...progress },
    });
    if (error) {
      // A checkpoint failure must not kill the job - it only degrades resume
      // granularity. Surface loudly, keep going.
      console.warn(`[QueueWorker] checkpoint failed for job ${job.id}: ${error.message}`);
    }
  }

  public async ack(job: QueueJobRow, stats: Record<string, unknown>): Promise<boolean> {
    const { data, error } = await this.db().rpc('ack_crawl_job', {
      p_id: job.id,
      p_claim_token: job.claim_token,
      p_stats: stats,
    });
    if (error) throw new Error(`ack_crawl_job failed: ${error.message}`);
    return data === true;
  }

  public async fail(job: QueueJobRow, errorMessage: string): Promise<boolean> {
    const { data, error } = await this.db().rpc('fail_crawl_job', {
      p_id: job.id,
      p_claim_token: job.claim_token,
      p_error: errorMessage.slice(0, 2000),
    });
    if (error) throw new Error(`fail_crawl_job failed: ${error.message}`);
    return data === true;
  }

  /** Process one claimed job end-to-end: scrape -> ingest (checkpointed) -> ack. */
  public async processJob(job: QueueJobRow): Promise<void> {
    const sections: Record<string, unknown> = { started_at: new Date().toISOString() };
    await this.checkpoint(job, { started: true });

    // Heartbeat while scraping (long): independent interval, cleared on exit.
    const hbMs = (this.opts.heartbeatSeconds ?? 120) * 1000;
    const hb = setInterval(() => {
      this.heartbeat(job).then(
        (ok) => {
          if (!ok) console.warn(`[QueueWorker] heartbeat rejected for job ${job.id} (lease lost?)`);
        },
        (e) => console.warn(`[QueueWorker] heartbeat error: ${e.message}`)
      );
    }, hbMs);

    try {
      const product = await this.opts.scrape(job);
      sections.title = product.title;

      const result = await this.opts.pipeline.ingestProduct(product, async (section) => {
        sections[section] = new Date().toISOString();
        await this.checkpoint(job, { [`${section}_at`]: sections[section] });
      });

      sections.productId = result.productId;
      sections.masterId = result.masterId;
      await this.ack(job, sections);
      console.log(`[QueueWorker] job ${job.id} ACKED (product ${result.productId})`);
    } catch (err: any) {
      const message = err?.message || String(err);
      console.error(`[QueueWorker] job ${job.id} FAILED: ${message}`);
      await this.fail(job, message);
    } finally {
      clearInterval(hb);
    }
  }

  /**
   * Main loop: dequeue -> process, until maxJobs reached or the queue stays
   * empty for maxIdlePolls consecutive polls. Returns processed count.
   */
  public async run(): Promise<number> {
    let processed = 0;
    let idlePolls = 0;
    const maxJobs = this.opts.maxJobs ?? Number.POSITIVE_INFINITY;
    const idlePollMs = this.opts.idlePollMs ?? 15000;
    const maxIdlePolls = this.opts.maxIdlePolls ?? 2;

    while (processed < maxJobs) {
      let job: QueueJobRow | null = null;
      try {
        job = await this.dequeue();
      } catch (e: any) {
        console.error(`[QueueWorker] dequeue error: ${e.message}; retrying in ${idlePollMs}ms`);
        await sleep(idlePollMs);
        continue;
      }

      if (!job) {
        idlePolls += 1;
        if (idlePolls >= maxIdlePolls) {
          console.log('[QueueWorker] queue empty, exiting.');
          break;
        }
        console.log(`[QueueWorker] queue empty (${idlePolls}/${maxIdlePolls}), waiting...`);
        await sleep(idlePollMs);
        continue;
      }

      idlePolls = 0;
      console.log(`[QueueWorker] claimed job ${job.id} (type=${job.type}, attempt=${job.attempts}, url=${job.target_url?.slice(0, 60)})`);
      await this.processJob(job);
      processed += 1;
    }
    return processed;
  }
}
