import localFont from 'next/font/local';

// Inter and JetBrains Mono from the pinned @fontsource-variable packages
// (same Google Fonts sources, variable wght axis), so neither the build nor
// the browser contacts Google (DOS/Rate#447). next/font/local still hashes,
// self-hosts and preloads the files and generates the metric-matched fallback.
//
// Each subset is its own face with Google's unicode-range. next/font names
// every call's family uniquely, so the font stacks in _custom.scss list the
// Vietnamese face first and then the Latin one: a Vietnamese letter matches the
// first face's range, everything else falls through to the second. Only the
// Latin Inter face carries the Arial-matched fallback; on the first face it
// would cover the Latin text before the Latin face could.
//
// next/font needs literal option values, hence the repeated paths and ranges
// (copied from the packages' wght.css).

export const fontInterVietnamese = localFont({
  src: '../../node_modules/@fontsource-variable/inter/files/inter-vietnamese-wght-normal.woff2',
  weight: '100 900',
  style: 'normal',
  display: 'swap',
  adjustFontFallback: false,
  declarations: [
    {
      prop: 'unicode-range',
      value:
        'U+0102-0103, U+0110-0111, U+0128-0129, U+0168-0169, U+01A0-01A1, U+01AF-01B0, U+0300-0301, U+0303-0304, U+0308-0309, U+0323, U+0329, U+1EA0-1EF9, U+20AB',
    },
  ],
  variable: '--font-inter-vi',
});

export const fontInter = localFont({
  src: '../../node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2',
  weight: '100 900',
  style: 'normal',
  display: 'swap',
  adjustFontFallback: 'Arial',
  declarations: [
    {
      prop: 'unicode-range',
      value:
        'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD',
    },
  ],
  variable: '--font-inter',
});

// Only .rate-mono uses it today; don't spend a preload on every page.
export const fontJetBrainsMonoVietnamese = localFont({
  src: '../../node_modules/@fontsource-variable/jetbrains-mono/files/jetbrains-mono-vietnamese-wght-normal.woff2',
  weight: '100 800',
  style: 'normal',
  display: 'swap',
  preload: false,
  adjustFontFallback: false,
  declarations: [
    {
      prop: 'unicode-range',
      value:
        'U+0102-0103, U+0110-0111, U+0128-0129, U+0168-0169, U+01A0-01A1, U+01AF-01B0, U+0300-0301, U+0303-0304, U+0308-0309, U+0323, U+0329, U+1EA0-1EF9, U+20AB',
    },
  ],
  variable: '--font-jetbrains-mono-vi',
});

export const fontJetBrainsMono = localFont({
  src: '../../node_modules/@fontsource-variable/jetbrains-mono/files/jetbrains-mono-latin-wght-normal.woff2',
  weight: '100 800',
  style: 'normal',
  display: 'swap',
  preload: false,
  // An Arial-matched fallback would be wrong for a monospace face; the stack
  // continues with real monospace fonts instead.
  adjustFontFallback: false,
  declarations: [
    {
      prop: 'unicode-range',
      value:
        'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD',
    },
  ],
  variable: '--font-jetbrains-mono',
});
