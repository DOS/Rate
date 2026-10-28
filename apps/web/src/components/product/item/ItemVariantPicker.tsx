'use client';

import { selectVariant, useSelectedVariant } from './selected-variant';

export interface ItemVariantOption {
  key: string;
  label: string;
  /** The size's "from" price, already formatted, or its no-price note. */
  priceLabel: string;
}

/** Size chips of an Item page; each shows its own "from" price (#1154). */
export default function ItemVariantPicker({
  options,
  defaultKey,
  label,
}: {
  options: readonly ItemVariantOption[];
  defaultKey: string;
  label: string;
}) {
  const selected = useSelectedVariant(
    options.map((o) => o.key),
    defaultKey
  );
  return (
    <div
      className="rate-pdv-variants d-flex mb-3 flex-wrap gap-2"
      role="group"
      aria-label={label}
      data-testid="pdv-variant-picker"
    >
      {options.map((option) => {
        const active = option.key === selected;
        return (
          <button
            key={option.key}
            type="button"
            className={`btn btn-sm rounded-pill d-flex flex-column align-items-start px-3 py-1 ${
              active ? 'btn-dark' : 'btn-outline-secondary'
            }`}
            aria-pressed={active}
            data-variant={option.key}
            onClick={() => selectVariant(option.key)}
          >
            <span className="fw-semibold">{option.label}</span>
            <span className="small rate-tabular">{option.priceLabel}</span>
          </button>
        );
      })}
    </div>
  );
}
