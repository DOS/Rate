'use client';
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import Slider from 'rc-slider';
import 'rc-slider/assets/index.css';

export interface RangeSliderProps {
  min?: number;
  max?: number;
  step?: number;
  value?: [number, number];
  defaultValue?: [number, number];
  unitSuffix?: string;
  onChange?: (values: [number, number]) => void;
  onChangeComplete?: (values: [number, number]) => void;
}

export function sanitizeSliderBounds(
  min?: unknown,
  max?: unknown,
  step?: unknown
): { min: number; max: number; step: number } {
  const rawMin = typeof min === 'number' ? min : Number(min);
  const rawMax = typeof max === 'number' ? max : Number(max);
  const rawStep = typeof step === 'number' ? step : Number(step);
  const safeMin = Number.isFinite(rawMin) ? rawMin : 0;
  const safeMax =
    Number.isFinite(rawMax) && rawMax >= safeMin ? rawMax : safeMin + 100;
  const safeStep = Number.isFinite(rawStep) && rawStep > 0 ? rawStep : 1;
  return { min: safeMin, max: safeMax, step: safeStep };
}

export function sanitizeSliderTuple(
  tuple: unknown,
  min: number,
  max: number
): [number, number] {
  const { min: safeMin, max: safeMax } = sanitizeSliderBounds(min, max, 1);
  if (!Array.isArray(tuple) || tuple.length < 2) {
    return [safeMin, safeMax];
  }
  const n0 = typeof tuple[0] === 'number' ? tuple[0] : Number(tuple[0]);
  const n1 = typeof tuple[1] === 'number' ? tuple[1] : Number(tuple[1]);
  const clamped0 = Number.isFinite(n0)
    ? Math.min(safeMax, Math.max(safeMin, n0))
    : safeMin;
  const clamped1 = Number.isFinite(n1)
    ? Math.min(safeMax, Math.max(safeMin, n1))
    : safeMax;
  return [Math.min(clamped0, clamped1), Math.max(clamped0, clamped1)];
}

export default function RangeSlider({
  min = 0,
  max = 100,
  step = 1,
  value,
  defaultValue = [20, 80],
  unitSuffix = '',
  onChange,
  onChangeComplete,
}: RangeSliderProps) {
  const tSidebar = useTranslations('catalog.sidebar');
  const {
    min: safeMin,
    max: safeMax,
    step: safeStep,
  } = sanitizeSliderBounds(min, max, step);
  const [internalRange, setInternalRange] = useState<[number, number]>(() =>
    sanitizeSliderTuple(value ?? defaultValue, safeMin, safeMax)
  );

  // Depend on the two numbers, not the array, so a new array with the same
  // bounds does not re-sync.
  const valueMin = value?.[0];
  const valueMax = value?.[1];
  useEffect(() => {
    if (valueMin !== undefined && valueMax !== undefined) {
      setInternalRange(
        sanitizeSliderTuple([valueMin, valueMax], safeMin, safeMax)
      );
    }
  }, [valueMin, valueMax, safeMin, safeMax]);

  const activeRange = value
    ? sanitizeSliderTuple(value, safeMin, safeMax)
    : internalRange;

  const handleRangeChange = (values: number | number[]) => {
    if (
      Array.isArray(values) &&
      typeof values[0] === 'number' &&
      typeof values[1] === 'number'
    ) {
      const next = sanitizeSliderTuple(
        [values[0], values[1]],
        safeMin,
        safeMax
      );
      setInternalRange(next);
      onChange?.(next);
    }
  };

  const handleAfterChange = (values: number | number[]) => {
    if (
      Array.isArray(values) &&
      typeof values[0] === 'number' &&
      typeof values[1] === 'number'
    ) {
      onChangeComplete?.(
        sanitizeSliderTuple([values[0], values[1]], safeMin, safeMax)
      );
    }
  };

  return (
    <div className="searchBar-single-wrap mt-2">
      <Slider
        range
        min={safeMin}
        max={safeMax}
        step={safeStep}
        value={activeRange}
        onChange={handleRangeChange}
        onChangeComplete={handleAfterChange}
        allowCross={false}
        // Each handle is a role="slider" and needs an accessible name.
        ariaLabelForHandle={[
          tSidebar('minPriceAria'),
          tSidebar('maxPriceAria'),
        ]}
      />
      <div
        className="d-flex justify-content-between align-items-center small fw-medium text-muted"
        style={{ marginTop: 10 }}
      >
        <span>
          {tSidebar('rangeFrom')}{' '}
          <strong className="text-dark">{activeRange[0]}</strong>
          {unitSuffix ? ` ${unitSuffix}` : ''}
        </span>
        <span>
          {tSidebar('rangeTo')}{' '}
          <strong className="text-dark">{activeRange[1]}</strong>
          {unitSuffix ? ` ${unitSuffix}` : ''}
        </span>
      </div>
    </div>
  );
}
