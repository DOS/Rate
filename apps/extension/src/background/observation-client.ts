/**
 * The opt-in observation client (DOS/Rate#1606): this install's
 * pseudonymous submitter id, ExtensionObservation v1 sends, and the erasure
 * that turning the opt-in off promises. Storage and fetch are injected so
 * the behaviour is tested without a browser.
 *
 * Every operation runs one after another on one chain, so an opt-out waits
 * for a send in flight, and two product pages never register two ids.
 */
import type { ExtensionObservationV1 } from '@repo/shared-data/rules';

export interface ObservationStorage {
  get(key: string): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(key: string): Promise<void>;
}

export interface ObservationClientDeps {
  storage: ObservationStorage;
  fetch: (url: string, init: RequestInit) => Promise<Response>;
  now: () => number;
  extensionVersion: string;
  /** Read at send time and again after a registration. */
  optedIn: () => Promise<boolean>;
  submitterPath: string;
  observationPath: string;
}

/** The stored id, with the server that issued it. */
export const SUBMITTER_KEY = 'observationSubmitter';
/** Ids whose erasure the server has not confirmed yet. */
export const PENDING_ERASURE_KEY = 'observationPendingErasure';
/** No register or observation before this time (ms). */
export const HOLD_UNTIL_KEY = 'observationHoldUntil';

/** How long to wait after a 429 without Retry-After, or while the routes are off. */
export const OBSERVATION_DEFAULT_HOLD_SECONDS = 60;
export const OBSERVATION_OFF_HOLD_SECONDS = 3600;
const MAX_HOLD_SECONDS = 3600;
const MAX_PENDING_ERASURES = 20;
const TIMEOUT_MS = 8_000;

const ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

interface SubmitterRecord {
  id: string;
  apiBaseUrl: string;
}

function asRecord(raw: unknown): SubmitterRecord | null {
  const r = raw as Partial<SubmitterRecord> | null;
  return r &&
    typeof r === 'object' &&
    typeof r.id === 'string' &&
    ID_RE.test(r.id) &&
    typeof r.apiBaseUrl === 'string' &&
    r.apiBaseUrl.length > 0
    ? { id: r.id, apiBaseUrl: r.apiBaseUrl }
    : null;
}

export class ObservationClient {
  private chain: Promise<unknown> = Promise.resolve();

  constructor(private readonly deps: ObservationClientDeps) {}

  private run<T>(task: () => Promise<T>): Promise<T> {
    const result = this.chain.then(task, task);
    this.chain = result.catch(() => undefined);
    return result;
  }

  private async read<T>(key: string, parse: (raw: unknown) => T): Promise<T> {
    const stored = await this.deps.storage.get(key);
    return parse(stored[key]);
  }

  private headers(json: boolean): Record<string, string> {
    return json
      ? {
          'Content-Type': 'application/json',
          'X-Rate-Extension-Version': this.deps.extensionVersion,
        }
      : { 'X-Rate-Extension-Version': this.deps.extensionVersion };
  }

  private async hold(seconds: number): Promise<void> {
    const ms = Math.min(Math.max(seconds, 1), MAX_HOLD_SECONDS) * 1000;
    await this.deps.storage.set({ [HOLD_UNTIL_KEY]: this.deps.now() + ms });
  }

  private async holdFor(res: Response): Promise<void> {
    if (res.status === 429) {
      const header = res.headers.get('Retry-After');
      const seconds =
        header && /^\d{1,6}$/.test(header.trim())
          ? Number(header.trim())
          : OBSERVATION_DEFAULT_HOLD_SECONDS;
      await this.hold(seconds);
    } else if (res.status === 503) {
      await this.hold(OBSERVATION_OFF_HOLD_SECONDS);
    }
  }

  private async held(): Promise<boolean> {
    const until = await this.read(HOLD_UNTIL_KEY, (v) =>
      typeof v === 'number' && Number.isFinite(v) ? v : 0
    );
    return until > this.deps.now();
  }

  private async code(res: Response): Promise<string | null> {
    const body = (await res.json().catch(() => null)) as {
      code?: unknown;
    } | null;
    return typeof body?.code === 'string' ? body.code : null;
  }

  private async pending(): Promise<SubmitterRecord[]> {
    return this.read(PENDING_ERASURE_KEY, (v) =>
      Array.isArray(v)
        ? v.map(asRecord).filter((r): r is SubmitterRecord => r !== null)
        : []
    );
  }

  private async queueErasure(record: SubmitterRecord): Promise<void> {
    const list = (await this.pending()).filter((r) => r.id !== record.id);
    list.push(record);
    await this.deps.storage.set({
      [PENDING_ERASURE_KEY]: list.slice(-MAX_PENDING_ERASURES),
    });
  }

  /**
   * Sends every queued erasure. One the server confirmed (200), or refused
   * as malformed (400), leaves the queue; any other answer or a network
   * error keeps it for the next try.
   */
  private async flushErasures(): Promise<void> {
    const list = await this.pending();
    if (list.length === 0) return;
    const left: SubmitterRecord[] = [];
    for (const record of list) {
      try {
        const res = await this.deps.fetch(
          `${record.apiBaseUrl}${this.deps.submitterPath}`,
          {
            method: 'DELETE',
            headers: this.headers(true),
            signal: AbortSignal.timeout(TIMEOUT_MS),
            body: JSON.stringify({ submitterId: record.id }),
          }
        );
        if (res.status !== 200 && res.status !== 400) left.push(record);
      } catch {
        left.push(record);
      }
    }
    if (left.length > 0) {
      await this.deps.storage.set({ [PENDING_ERASURE_KEY]: left });
    } else {
      await this.deps.storage.remove(PENDING_ERASURE_KEY);
    }
  }

  /** The stored id for this server; an id from another server is erased there. */
  private async currentId(apiBaseUrl: string): Promise<string | null> {
    const record = await this.read(SUBMITTER_KEY, asRecord);
    if (!record) return null;
    if (record.apiBaseUrl === apiBaseUrl) return record.id;
    await this.deps.storage.remove(SUBMITTER_KEY);
    await this.queueErasure(record);
    await this.flushErasures();
    return null;
  }

  private async register(apiBaseUrl: string): Promise<string | null> {
    const res = await this.deps.fetch(
      `${apiBaseUrl}${this.deps.submitterPath}`,
      {
        method: 'POST',
        headers: this.headers(false),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      }
    );
    if (!res.ok) {
      if (res.status === 404) {
        // NOT_ENABLED: the routes are off; ask again in an hour.
        await this.hold(OBSERVATION_OFF_HOLD_SECONDS);
      } else {
        await this.holdFor(res);
      }
      return null;
    }
    const body = (await res.json().catch(() => null)) as {
      submitterId?: unknown;
    } | null;
    const id = body?.submitterId;
    return typeof id === 'string' && ID_RE.test(id) ? id : null;
  }

  /** Sends one observation for an opted-in install; never throws. */
  send(apiBaseUrl: string, observation: ExtensionObservationV1): Promise<void> {
    return this.run(async () => {
      try {
        await this.flushErasures();
        if (!(await this.deps.optedIn()) || (await this.held())) return;
        let id = await this.currentId(apiBaseUrl);
        if (!id) {
          id = await this.register(apiBaseUrl);
          if (!id) return;
          // Turned off while the id was being issued: erase it at once.
          if (!(await this.deps.optedIn())) {
            await this.queueErasure({ id, apiBaseUrl });
            await this.flushErasures();
            return;
          }
          await this.deps.storage.set({ [SUBMITTER_KEY]: { id, apiBaseUrl } });
        }
        const res = await this.deps.fetch(
          `${apiBaseUrl}${this.deps.observationPath}`,
          {
            method: 'POST',
            headers: this.headers(true),
            signal: AbortSignal.timeout(TIMEOUT_MS),
            body: JSON.stringify({ submitterId: id, observation }),
          }
        );
        if (res.status === 404) {
          const code = await this.code(res);
          if (code === 'UNKNOWN_SUBMITTER') {
            // Deleted or purged on the server: get a new id next time.
            await this.deps.storage.remove(SUBMITTER_KEY);
          } else if (code === 'NOT_ENABLED') {
            await this.hold(OBSERVATION_OFF_HOLD_SECONDS);
          }
        } else {
          await this.holdFor(res);
        }
      } catch {
        // Non-blocking: a lost observation is fine, a lost erasure is queued.
      }
    });
  }

  /**
   * The opt-in was turned off: forget the id here and erase it on the server
   * that issued it, retrying until the server confirms.
   */
  forget(): Promise<void> {
    return this.run(async () => {
      try {
        const record = await this.read(SUBMITTER_KEY, asRecord);
        await this.deps.storage.remove(SUBMITTER_KEY);
        if (record) await this.queueErasure(record);
        await this.flushErasures();
      } catch {
        // The queued erasure is retried on the next start or send.
      }
    });
  }

  /** Retries queued erasures (at start-up). */
  retryErasures(): Promise<void> {
    return this.run(async () => {
      try {
        await this.flushErasures();
      } catch {
        // Kept for the next try.
      }
    });
  }
}
