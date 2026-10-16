'use client';
import { useEffect, useState } from 'react';
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
  const [internalRange, setInternalRange] = useState<[number, number]>(
    value ?? defaultValue
  );

  useEffect(() => {
    if (value && Array.isArray(value) && value.length === 2) {
      setInternalRange([value[0], value[1]]);
    }
  }, [value?.[0], value?.[1]]);

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
      />
      <div
        className="d-flex justify-content-between align-items-center small fw-medium text-muted"
        style={{ marginTop: 10 }}
      >
        <span>
          Từ: <strong className="text-dark">{activeRange[0]}</strong>
          {unitSuffix ? ` ${unitSuffix}` : ''}
        </span>
        <span>
          Đến: <strong className="text-dark">{activeRange[1]}</strong>
          {unitSuffix ? ` ${unitSuffix}` : ''}
        </span>
      </div>
    </div>
  );
}
