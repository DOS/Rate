import { Inter, JetBrains_Mono } from 'next/font/google';

// Self-hosted at build time by next/font: no request to Google at runtime,
// preloaded, with a metric-matched fallback. The CSS variables feed
// --body-font-family, --heading-font-family and --rate-font-mono (_custom.scss).
export const fontInter = Inter({
  subsets: ['latin', 'vietnamese'],
  weight: ['400', '500', '600', '700', '800'],
  display: 'swap',
  variable: '--font-inter',
});

export const fontJetBrainsMono = JetBrains_Mono({
  subsets: ['latin', 'vietnamese'],
  weight: ['500', '600', '700'],
  display: 'swap',
  variable: '--font-jetbrains-mono',
});
