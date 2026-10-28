'use client';

import { Fragment, type ReactNode } from 'react';
import { useSelectedVariant } from './selected-variant';

/**
 * Shows the server-rendered panel of the selected size. The server renders
 * every size's panel; the static HTML holds the default one (#1154).
 */
export default function ItemVariantPanels({
  panels,
  defaultKey,
}: {
  panels: readonly { key: string; node: ReactNode }[];
  defaultKey: string;
}) {
  const selected = useSelectedVariant(
    panels.map((p) => p.key),
    defaultKey
  );
  const panel =
    panels.find((p) => p.key === selected) ??
    panels.find((p) => p.key === defaultKey);
  // Keyed per size, so a panel's own state (a chosen offer, a filter) does
  // not carry over to another size's data.
  return panel ? <Fragment key={panel.key}>{panel.node}</Fragment> : null;
}
