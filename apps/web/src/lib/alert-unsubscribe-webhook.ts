import dns from 'node:dns';
import { isIP } from 'node:net';
import { BoundedSlidingWindowRateLimiter } from '@/server/rate/api-handler';

export const MAX_UNSUBSCRIBE_BODY_BYTES = 4_096;
export const WEBHOOK_DNS_TIMEOUT_MS = 3_000;
const UNSUBSCRIBE_RATE_LIMIT_WINDOW_MS = 60_000;
const UNSUBSCRIBE_RATE_LIMIT_MAX_REQUESTS = 20;

export const unsubscribePostRateLimiter = new BoundedSlidingWindowRateLimiter({
  windowMs: UNSUBSCRIBE_RATE_LIMIT_WINDOW_MS,
  maxRequests: UNSUBSCRIBE_RATE_LIMIT_MAX_REQUESTS,
  maxBuckets: 5_000,
});

const DNS_LABEL_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const ALPHA_TLD_RE = /^[a-z]{2,63}$/;

const DISALLOWED_WEBHOOK_HOST_SUFFIXES = [
  '.localhost',
  '.local',
  '.internal',
  '.arpa',
  '.lan',
  '.corp',
  '.home',
  '.intranet',
  '.nip.io',
  '.sslip.io',
  '.xip.io',
  '.lvh.me',
  '.localtest.me',
] as const;

function isPrivateOrReservedIpv4Octets(
  a: number,
  b: number,
  c: number,
  d: number
): boolean {
  if (
    !Number.isInteger(a) ||
    !Number.isInteger(b) ||
    !Number.isInteger(c) ||
    !Number.isInteger(d) ||
    a < 0 ||
    a > 255 ||
    b < 0 ||
    b > 255 ||
    c < 0 ||
    c > 255 ||
    d < 0 ||
    d > 255
  ) {
    return true;
  }
  if (a === 0) return true; // 0.0.0.0/8
  if (a === 10) return true; // 10.0.0.0/8 RFC 1918
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 CGNAT
  if (a === 127) return true; // 127.0.0.0/8 Loopback
  if (a === 169 && b === 254) return true; // 169.254.0.0/16 Link-local & IMDS
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12 RFC 1918
  if (a === 192 && b === 0 && (c === 0 || c === 2)) return true; // 192.0.0.0/24, 192.0.2.0/24
  if (a === 192 && b === 88 && c === 99) return true; // 192.88.99.0/24 6to4 relay
  if (a === 192 && b === 168) return true; // 192.168.0.0/16 RFC 1918
  if (a === 198 && (b === 18 || b === 19)) return true; // 198.18.0.0/15 Benchmarking
  if (a === 198 && b === 51 && c === 100) return true; // 198.51.100.0/24 TEST-NET-2
  if (a === 203 && b === 0 && c === 113) return true; // 203.0.113.0/24 TEST-NET-3
  if (a >= 224) return true; // 224.0.0.0/4 Multicast & 240.0.0.0/4 Reserved/Broadcast
  return false;
}

function parseIpv4Octets(ip: string): [number, number, number, number] | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  const nums = parts.map((p) =>
    /^(?:0|[1-9]\d{0,2})$/.test(p) ? Number(p) : Number.NaN
  );
  if (nums.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null;
  return [nums[0]!, nums[1]!, nums[2]!, nums[3]!];
}

function expandIpv6Groups(rawIp: string): number[] | null {
  let ip = rawIp.toLowerCase();
  const lastColon = ip.lastIndexOf(':');
  if (lastColon !== -1 && ip.indexOf('.', lastColon + 1) !== -1) {
    const tailV4 = parseIpv4Octets(ip.slice(lastColon + 1));
    if (!tailV4) return null;
    const hi = ((tailV4[0] << 8) | tailV4[1]).toString(16);
    const lo = ((tailV4[2] << 8) | tailV4[3]).toString(16);
    ip = `${ip.slice(0, lastColon)}:${hi}:${lo}`;
  }

  const dblParts = ip.split('::');
  if (dblParts.length > 2) return null;
  const parseSide = (side: string): number[] | null => {
    if (!side) return [];
    const tokens = side.split(':');
    const out: number[] = [];
    for (const tok of tokens) {
      if (!/^[0-9a-f]{1,4}$/.test(tok)) return null;
      out.push(Number.parseInt(tok, 16));
    }
    return out;
  };

  if (dblParts.length === 1) {
    const full = parseSide(dblParts[0]!);
    return full && full.length === 8 ? full : null;
  }

  const left = parseSide(dblParts[0]!);
  const right = parseSide(dblParts[1]!);
  if (!left || !right || left.length + right.length >= 8) return null;
  const zeros = Array.from({ length: 8 - left.length - right.length }, () => 0);
  return [...left, ...zeros, ...right];
}

/**
 * Returns `true` if `rawAddress` is private, loopback, link-local, CGNAT,
 * multicast, documentation, NAT64, IPv4-mapped private, or not a valid global
 * unicast IP literal. Fails closed (`true`) on malformed or scoped literals.
 */
export function isPrivateOrLocalIpLiteral(rawAddress: unknown): boolean {
  if (typeof rawAddress !== 'string') return true;
  const trimmed = rawAddress.trim();
  if (!trimmed || trimmed.includes('%')) return true;
  const unbracketed =
    trimmed.startsWith('[') && trimmed.endsWith(']')
      ? trimmed.slice(1, -1)
      : trimmed;
  const ipVersion = isIP(unbracketed);
  if (ipVersion === 4) {
    const octets = parseIpv4Octets(unbracketed);
    if (!octets) return true;
    return isPrivateOrReservedIpv4Octets(
      octets[0],
      octets[1],
      octets[2],
      octets[3]
    );
  }
  if (ipVersion === 6) {
    const g = expandIpv6Groups(unbracketed);
    if (!g || g.length !== 8) return true;
    const [g0, g1, g2, g3, g4, g5, g6, g7] = g as [
      number,
      number,
      number,
      number,
      number,
      number,
      number,
      number,
    ];
    if (g.every((x) => x === 0)) return true; // ::/128
    if (
      g0 === 0 &&
      g1 === 0 &&
      g2 === 0 &&
      g3 === 0 &&
      g4 === 0 &&
      g5 === 0 &&
      g6 === 0 &&
      g7 === 1
    ) {
      return true; // ::1/128
    }
    // IPv4-mapped ::ffff:0:0/96 delegates to the embedded IPv4 check
    if (
      g0 === 0 &&
      g1 === 0 &&
      g2 === 0 &&
      g3 === 0 &&
      g4 === 0 &&
      g5 === 0xffff
    ) {
      return isPrivateOrReservedIpv4Octets(
        (g6 >> 8) & 0xff,
        g6 & 0xff,
        (g7 >> 8) & 0xff,
        g7 & 0xff
      );
    }
    // Outside IPv4-mapped space, only IANA Global Unicast 2000::/3 is public
    if ((g0 & 0xe000) !== 0x2000) return true;
    if (g0 === 0x2001 && g1 <= 0x01ff) return true; // 2001::/23 IETF protocol (Teredo, benchmarking, ORCHID)
    if (g0 === 0x2001 && g1 === 0x0db8) return true; // 2001:db8::/32 Documentation
    if (g0 === 0x3fff && (g1 & 0xf000) === 0x0000) return true; // 3fff::/20 Documentation
    if (g0 === 0x2002) {
      // 6to4 2002::/16 embeds IPv4 in g1..g2
      return isPrivateOrReservedIpv4Octets(
        (g1 >> 8) & 0xff,
        g1 & 0xff,
        (g2 >> 8) & 0xff,
        g2 & 0xff
      );
    }
    return false;
  }
  return true;
}

export function isSafeUnsubscribeWebhookUrl(rawUrl: unknown): boolean {
  if (typeof rawUrl !== 'string') return false;
  const trimmed = rawUrl.trim();
  if (!trimmed || trimmed.length > 1024 || /[\s\p{Cc}]/u.test(trimmed)) {
    return false;
  }
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'https:') return false;
  if (parsed.username || parsed.password || parsed.hash) return false;
  if (parsed.port !== '' && parsed.port !== '443') return false;

  const host = parsed.hostname.toLowerCase();
  if (
    !host ||
    host.length > 253 ||
    !host.includes('.') ||
    host.startsWith('.') ||
    host.endsWith('.') ||
    host.includes('..') ||
    host.startsWith('[') ||
    host.includes(':') ||
    host === 'localhost' ||
    isIP(host) !== 0 ||
    /^\d+(?:\.\d+){3}$/.test(host) ||
    /^\d+$/.test(host)
  ) {
    return false;
  }
  if (
    DISALLOWED_WEBHOOK_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix))
  ) {
    return false;
  }
  const labels = host.split('.');
  const tld = labels[labels.length - 1] ?? '';
  if (!ALPHA_TLD_RE.test(tld)) return false;
  return labels.every((label) => DNS_LABEL_RE.test(label));
}

export type WebhookDnsLookupAllFn = (
  hostname: string
) => Promise<ReadonlyArray<{ address: string; family?: number }>>;

export type ValidatedWebhookUrlResult =
  | { ok: true; url: string; hostname: string }
  | {
      ok: false;
      reason: 'invalid_url' | 'private_ip' | 'dns_error';
      error: string;
    };

const defaultDnsLookupAll: WebhookDnsLookupAllFn = (hostname) =>
  dns.promises.lookup(hostname, { all: true, verbatim: true });

/**
 * Validates syntax, HTTPS scheme, public domain format, and pre-flight DNS
 * resolution (`dns.promises.lookup(hostname, { all: true })`), ensuring at
 * least one global unicast record exists and ZERO returned A/AAAA records
 * resolve to private, loopback, link-local, or reserved IP space.
 */
export async function validatePublicWebhookUrl(
  rawUrl: unknown,
  options?: {
    lookup?: WebhookDnsLookupAllFn;
    timeoutMs?: number;
  }
): Promise<ValidatedWebhookUrlResult> {
  if (!isSafeUnsubscribeWebhookUrl(rawUrl)) {
    return {
      ok: false,
      reason: 'invalid_url',
      error: 'Unsubscribe webhook URL must be a public https:// endpoint',
    };
  }
  const parsed = new URL((rawUrl as string).trim());
  const hostname = parsed.hostname.toLowerCase();
  const lookupFn = options?.lookup ?? defaultDnsLookupAll;
  const timeoutMs =
    typeof options?.timeoutMs === 'number' &&
    Number.isFinite(options.timeoutMs) &&
    options.timeoutMs >= 100
      ? Math.min(10_000, Math.floor(options.timeoutMs))
      : WEBHOOK_DNS_TIMEOUT_MS;

  let timerId: ReturnType<typeof setTimeout> | undefined;
  let timedOut = false;
  const timeoutPromise = new Promise<null>((resolve) => {
    timerId = setTimeout(() => {
      timedOut = true;
      resolve(null);
    }, timeoutMs);
  });

  let records: ReadonlyArray<{ address: string; family?: number }> | null;
  try {
    records = await Promise.race([lookupFn(hostname), timeoutPromise]);
  } catch {
    return {
      ok: false,
      reason: 'dns_error',
      error: 'Could not resolve unsubscribe webhook hostname',
    };
  } finally {
    if (timerId !== undefined) clearTimeout(timerId);
  }

  if (timedOut || !Array.isArray(records) || records.length === 0) {
    return {
      ok: false,
      reason: 'dns_error',
      error: 'Could not resolve unsubscribe webhook hostname',
    };
  }

  for (const record of records) {
    if (
      !record ||
      typeof record.address !== 'string' ||
      isPrivateOrLocalIpLiteral(record.address)
    ) {
      return {
        ok: false,
        reason: 'private_ip',
        error:
          'Unsubscribe webhook hostname resolved to a non-public IP address',
      };
    }
  }

  return {
    ok: true,
    url: parsed.toString(),
    hostname,
  };
}
