import localFont from 'next/font/local';

// Inter and JetBrains Mono from the pinned @fontsource-variable packages
// (same Google Fonts sources, variable wght axis), so neither the build nor
// the browser contacts Google (DOS/Rate#447). next/font/local still hashes,
// self-hosts and preloads the files and generates the metric-matched fallback.
//
// Each subset is its own face with Google's unicode-range; a face downloads
// only when the page uses a character in its range. next/font names every
// call's family uniquely, so the font stacks in _custom.scss list the faces in
// the order below (Vietnamese, Latin Extended for cs, Greek, then Latin). Only
// the last Inter face carries the Arial-matched fallback: a fallback face has
// no unicode-range, so anywhere earlier it would cover every character before
// the faces after it.
//
// The weight ranges match the static weights the app loaded from Google (Inter
// 400-800, JetBrains Mono 500-700), so a requested 300 (.lead, .display-*)
// still renders at 400 as before.
//
// next/font needs literal option values, hence the repeated paths and ranges
// (copied from the packages' wght.css).

export const fontInterVietnamese = localFont({
  src: '../../node_modules/@fontsource-variable/inter/files/inter-vietnamese-wght-normal.woff2',
  weight: '400 800',
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

export const fontInterLatinExt = localFont({
  src: '../../node_modules/@fontsource-variable/inter/files/inter-latin-ext-wght-normal.woff2',
  weight: '400 800',
  style: 'normal',
  display: 'swap',
  preload: false,
  adjustFontFallback: false,
  declarations: [
    {
      prop: 'unicode-range',
      value:
        'U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF',
    },
  ],
  variable: '--font-inter-ext',
});

export const fontInterGreek = localFont({
  src: '../../node_modules/@fontsource-variable/inter/files/inter-greek-wght-normal.woff2',
  weight: '400 800',
  style: 'normal',
  display: 'swap',
  preload: false,
  adjustFontFallback: false,
  declarations: [
    {
      prop: 'unicode-range',
      value:
        'U+0370-0377, U+037A-037F, U+0384-038A, U+038C, U+038E-03A1, U+03A3-03FF',
    },
  ],
  variable: '--font-inter-greek',
});

export const fontInter = localFont({
  src: '../../node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2',
  weight: '400 800',
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

// JetBrains Mono: only .rate-mono uses it, so no preload; no Arial-matched
// fallback either (wrong for a monospace face), the stack goes on to real
// monospace fonts.
export const fontJetBrainsMonoVietnamese = localFont({
  src: '../../node_modules/@fontsource-variable/jetbrains-mono/files/jetbrains-mono-vietnamese-wght-normal.woff2',
  weight: '500 700',
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

export const fontJetBrainsMonoLatinExt = localFont({
  src: '../../node_modules/@fontsource-variable/jetbrains-mono/files/jetbrains-mono-latin-ext-wght-normal.woff2',
  weight: '500 700',
  style: 'normal',
  display: 'swap',
  preload: false,
  adjustFontFallback: false,
  declarations: [
    {
      prop: 'unicode-range',
      value:
        'U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF',
    },
  ],
  variable: '--font-jetbrains-mono-ext',
});

export const fontJetBrainsMono = localFont({
  src: '../../node_modules/@fontsource-variable/jetbrains-mono/files/jetbrains-mono-latin-wght-normal.woff2',
  weight: '500 700',
  style: 'normal',
  display: 'swap',
  preload: false,
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

/** Every font face above, in font-stack order; <html> gets all their variables. */
export const fontFaces = [
  fontInterVietnamese,
  fontInterLatinExt,
  fontInterGreek,
  fontInter,
  fontJetBrainsMonoVietnamese,
  fontJetBrainsMonoLatinExt,
  fontJetBrainsMono,
];
