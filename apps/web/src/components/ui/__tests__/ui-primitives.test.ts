import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { cn } from '@/lib/utils';
import { Badge, badgeVariants } from '../badge';
import { Button, buttonVariants } from '../button';
import { Card, CardContent, CardFooter, CardHeader } from '../card';
import { NavTabLink, NavTabs } from '../tabs';

function main() {
  console.warn('🧪 shadcn/ui primitives suite (DOS/Rate#1986)');

  // 1. cn() merges conflicting Tailwind classes cleanly while keeping arbitrary border width.
  assert.equal(
    cn('h-9 px-3.5 text-[13px]', 'h-10 px-[16px]'),
    'text-[13px] h-10 px-[16px]'
  );
  assert.equal(
    cn('border-[1px] border-solid border-border-strong', 'border-brand'),
    'border-[1px] border-solid border-brand'
  );

  // 2. Button enforces DESIGN.md Principle #5: var(--rate-radius-btn), never rounded-full.
  const variants = [
    'primary',
    'outline-primary',
    'outline',
    'ghost',
    'success',
  ] as const;
  const sizes = ['sm', 'default', 'icon'] as const;

  for (const variant of variants) {
    for (const size of sizes) {
      const classes = buttonVariants({ variant, size });
      assert.ok(
        classes.includes('rounded-[var(--rate-radius-btn)]'),
        `Button (${variant}/${size}) must enforce var(--rate-radius-btn)`
      );
      assert.equal(
        classes.includes('rounded-full'),
        false,
        `Button (${variant}/${size}) must never use rounded-full`
      );
      assert.equal(
        /(?:^|\s)(?:border|bg-transparent|p-0|p-1)(?:\s|$)/.test(classes),
        false,
        `Button (${variant}/${size}) must avoid colliding Bootstrap !important utilities (border, bg-transparent, p-0, p-1)`
      );
    }
  }

  const smBtnHtml = renderToStaticMarkup(
    React.createElement(
      Button,
      { variant: 'primary', size: 'sm' },
      'Canh gia that'
    )
  );
  assert.match(smBtnHtml, /<button\b/);
  assert.match(smBtnHtml, /data-slot="button"/);
  assert.match(smBtnHtml, /type="button"/);
  assert.match(smBtnHtml, /\bh-9\b/);
  assert.match(smBtnHtml, /rounded-\[var\(--rate-radius-btn\)\]/);

  const asChildHtml = renderToStaticMarkup(
    React.createElement(
      Button,
      { variant: 'outline', size: 'sm', asChild: true },
      React.createElement('a', { href: '#pdv-price-history' }, 'Price history')
    )
  );
  assert.match(asChildHtml, /^<a\b/);
  assert.match(asChildHtml, /data-slot="button"/);
  assert.match(asChildHtml, /href="#pdv-price-history"/);
  assert.match(asChildHtml, /\bh-9\b/);
  assert.doesNotMatch(asChildHtml, /\btype="button"/);

  // 3. Badge enforces unified 6px radius and semantic variants.
  for (const variant of [
    'default',
    'secondary',
    'success',
    'warning',
    'danger',
    'outline',
  ] as const) {
    const classes = badgeVariants({ variant });
    assert.ok(
      classes.includes('rounded-[6px]'),
      `Badge (${variant}) must use 6px radius`
    );
    assert.equal(
      /(?:^|\s)(?:border|bg-transparent|p-0|p-1)(?:\s|$)/.test(classes),
      false,
      `Badge (${variant}) must avoid colliding Bootstrap !important utilities (border, bg-transparent, p-0, p-1)`
    );
  }
  const badgeHtml = renderToStaticMarkup(
    React.createElement(Badge, { variant: 'warning' }, 'Chua du mau')
  );
  assert.match(badgeHtml, /data-slot="badge"/);
  assert.match(badgeHtml, /rounded-\[6px\]/);

  // 4. Card enforces unified 14px radius across surfaces.
  const cardHtml = renderToStaticMarkup(
    React.createElement(
      Card,
      null,
      React.createElement(CardHeader, null, 'Header'),
      React.createElement(CardContent, null, 'Body'),
      React.createElement(CardFooter, null, 'Footer')
    )
  );
  assert.match(cardHtml, /data-slot="card"/);
  assert.match(cardHtml, /rounded-\[14px\]/);
  assert.match(cardHtml, /data-slot="card-header"/);
  assert.match(cardHtml, /data-slot="card-content"/);
  assert.match(cardHtml, /data-slot="card-footer"/);

  // 5. NavTabs / NavTabLink replace giant 999px pills with compact segmented tabs.
  const tabsHtml = renderToStaticMarkup(
    React.createElement(
      NavTabs,
      {
        'aria-label': 'Jump nav',
        ...({ 'data-testid': 'pdv-jump-nav' } as Record<string, string>),
      },
      React.createElement(NavTabLink, { href: '#specs-section' }, 'Specs'),
      React.createElement(NavTabLink, { href: '#offers-table' }, 'Offers')
    )
  );
  assert.match(tabsHtml, /<nav\b/);
  assert.match(tabsHtml, /data-slot="nav-tabs"/);
  assert.match(tabsHtml, /rounded-\[10px\]/);
  assert.match(tabsHtml, /p-\[4px\]/);
  assert.doesNotMatch(tabsHtml, /class="[^"]*\bp-1\b/);
  assert.match(tabsHtml, /data-slot="nav-tab"/);
  assert.match(tabsHtml, /rounded-\[6px\]/);
  assert.match(tabsHtml, /\bh-9\b/);
  assert.doesNotMatch(tabsHtml, /rounded-full|999px/);

  // 6. Zero em-dashes or en-dashes across all new UI primitive files.
  for (const rel of [
    '../button.tsx',
    '../badge.tsx',
    '../card.tsx',
    '../tabs.tsx',
    '../../../lib/utils.ts',
    '../../../app/style/tailwind.css',
  ] as const) {
    const src = readFileSync(new URL(rel, import.meta.url), 'utf8');
    assert.equal(
      /[\u2013\u2014]/.test(src),
      false,
      `${rel} must contain zero em-dashes or en-dashes`
    );
  }

  console.warn('✅ shadcn/ui primitives suite passed');
}

main();
