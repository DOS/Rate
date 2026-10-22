// This file configures the initialization of Sentry on the client.
// The config you add here will be used whenever a users loads a page in their browser.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import { env } from '@/env.mjs';

type SentryModule = typeof import('@sentry/nextjs');

let sentry: SentryModule | null = null;

// Without a DSN there is nowhere to report to, so the browser does not load
// the SDK at all; next.config.mjs skips the Sentry build wrapper the same way
// (DOS/Rate#752). With a DSN the SDK loads after the page, not in front of it.
if (env.NEXT_PUBLIC_SENTRY_DSN) {
  void import('@sentry/nextjs').then((Sentry) => {
    Sentry.init({
      dsn: env.NEXT_PUBLIC_SENTRY_DSN,

      // Add optional integrations for additional features
      integrations: [
        Sentry.replayIntegration({
          // Additional SDK configuration goes in here, for example:
          maskAllText: true,
          blockAllMedia: true,
        }),
      ],

      // Define how likely traces are sampled. Adjust this value in production, or use tracesSampler for greater control.
      tracesSampleRate: 0.3,

      // Define how likely Replay events are sampled.
      // This sets the sample rate to be 0%. You may want this to be 100% while
      // in development and sample at a lower rate in production
      replaysSessionSampleRate: 0,

      // Define how likely Replay events are sampled when an error occurs.
      replaysOnErrorSampleRate: 1.0,

      // Setting this option to true will print useful information to the console while you're setting up Sentry.
      debug: false,
    });
    sentry = Sentry;
  });
}

// Required for Next.js navigation instrumentation; a no-op until the SDK loads.
export const onRouterTransitionStart: SentryModule['captureRouterTransitionStart'] =
  (...args) => sentry?.captureRouterTransitionStart(...args);
