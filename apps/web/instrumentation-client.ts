// This file configures the initialization of Sentry on the client.
// The config you add here will be used whenever a users loads a page in their browser.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import { env } from '@/env.mjs';

type SentryModule = typeof import('@sentry/nextjs');

let sentry: SentryModule | null = null;

const SENSITIVE_QUERY_KEYS = new Set(['unsubscribe', 'token']);

/**
 * Redacts signed bearer query parameters (`unsubscribe`, `token`) before any
 * client error, transaction, breadcrumb, or replay recording event leaves the
 * browser (#1875).
 */
export function scrubSensitiveTelemetryUrl(rawUrl: string): string {
  if (
    typeof rawUrl !== 'string' ||
    (!rawUrl.includes('unsubscribe=') && !rawUrl.includes('token='))
  ) {
    return rawUrl;
  }
  try {
    const isRelative = rawUrl.startsWith('/');
    const parsed = new URL(rawUrl, 'https://rate.vn');
    let mutated = false;
    for (const key of Array.from(parsed.searchParams.keys())) {
      if (SENSITIVE_QUERY_KEYS.has(key.toLowerCase())) {
        parsed.searchParams.set(key, '[REDACTED]');
        mutated = true;
      }
    }
    if (!mutated) return rawUrl;
    return isRelative
      ? `${parsed.pathname}${parsed.search}${parsed.hash}`
      : parsed.toString();
  } catch {
    return rawUrl.replace(
      /([?&](?:unsubscribe|token)=)[^&#\s]*/gi,
      '$1[REDACTED]'
    );
  }
}

function scrubEventUrls<
  T extends {
    request?: { url?: string; query_string?: unknown };
    breadcrumbs?: Array<{ data?: Record<string, unknown> }>;
  },
>(event: T): T {
  if (event.request) {
    if (typeof event.request.url === 'string') {
      event.request.url = scrubSensitiveTelemetryUrl(event.request.url);
    }
    if (typeof event.request.query_string === 'string') {
      event.request.query_string = scrubSensitiveTelemetryUrl(
        `?${event.request.query_string}`
      ).replace(/^\?/, '');
    } else if (
      event.request.query_string &&
      typeof event.request.query_string === 'object' &&
      !Array.isArray(event.request.query_string)
    ) {
      const qs = {
        ...(event.request.query_string as Record<string, unknown>),
      };
      for (const key of Object.keys(qs)) {
        if (SENSITIVE_QUERY_KEYS.has(key.toLowerCase())) {
          qs[key] = '[REDACTED]';
        }
      }
      event.request.query_string = qs;
    }
  }
  if (Array.isArray(event.breadcrumbs)) {
    for (const crumb of event.breadcrumbs) {
      if (crumb?.data) {
        for (const field of ['url', 'from', 'to'] as const) {
          if (typeof crumb.data[field] === 'string') {
            crumb.data[field] = scrubSensitiveTelemetryUrl(crumb.data[field]);
          }
        }
      }
    }
  }
  return event;
}

// Without a DSN there is nowhere to report to, so the browser does not load
// the SDK at all; next.config.mjs skips the Sentry build wrapper the same way
// (DOS/Rate#752). With a DSN the SDK loads after the page, not in front of it.
if (env.NEXT_PUBLIC_SENTRY_DSN) {
  void import('@sentry/nextjs').then((Sentry) => {
    Sentry.init({
      dsn: env.NEXT_PUBLIC_SENTRY_DSN,

      integrations: [
        Sentry.replayIntegration({
          maskAllText: true,
          blockAllMedia: true,
          beforeAddRecordingEvent(recordingEvent) {
            const data = recordingEvent.data as
              | { href?: unknown; payload?: { description?: unknown } }
              | undefined;
            if (data && typeof data.href === 'string') {
              data.href = scrubSensitiveTelemetryUrl(data.href);
            }
            if (data?.payload && typeof data.payload.description === 'string') {
              data.payload.description = scrubSensitiveTelemetryUrl(
                data.payload.description
              );
            }
            return recordingEvent;
          },
        }),
      ],

      beforeSend(event) {
        return scrubEventUrls(event);
      },

      beforeSendTransaction(event) {
        return scrubEventUrls(event);
      },

      beforeBreadcrumb(breadcrumb) {
        if (breadcrumb.data) {
          for (const field of ['url', 'from', 'to'] as const) {
            if (typeof breadcrumb.data[field] === 'string') {
              breadcrumb.data[field] = scrubSensitiveTelemetryUrl(
                breadcrumb.data[field]
              );
            }
          }
        }
        return breadcrumb;
      },

      tracesSampleRate: 0.3,
      replaysSessionSampleRate: 0,
      replaysOnErrorSampleRate: 1.0,
      debug: false,
    });
    sentry = Sentry;
  });
}

// Required for Next.js navigation instrumentation; a no-op until the SDK loads.
export const onRouterTransitionStart: SentryModule['captureRouterTransitionStart'] =
  (...args) => sentry?.captureRouterTransitionStart(...args);
