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
  const [internalRange, setInternalRange] = useState<[number, number]>(
    value ?? defaultValue
  );

  // Depend on the two numbers, not the array, so a new array with the same
  // bounds does not re-sync.
  const valueMin = value?.[0];
  const valueMax = value?.[1];
  useEffect(() => {
    if (valueMin !== undefined && valueMax !== undefined) {
      setInternalRange([valueMin, valueMax]);
    }
  }, [valueMin, valueMax]);

  const activeRange = value ?? internalRange;

  const handleRangeChange = (values: number | number[]) => {
    if (
      Array.isArray(values) &&
      typeof values[0] === 'number' &&
      typeof values[1] === 'number'
    ) {
      const next: [number, number] = [values[0], values[1]];
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
      onChangeComplete?.([values[0], values[1]]);
    }
  };

  return (
    <div className="searchBar-single-wrap mt-2">
      <Slider
        range
        min={min}
        max={max}
        step={step}
        value={activeRange}
        onChange={handleRangeChange}
        onChangeComplete={handleAfterChange}
        allowCross={false}
        // Each handle is a role="slider" and needs an accessible name.
        ariaLabelForHandle={[tSidebar('rangeFrom'), tSidebar('rangeTo')]}
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
