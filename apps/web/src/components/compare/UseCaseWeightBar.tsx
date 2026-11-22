'use client';

import React, { useId } from 'react';
import { BsArrowCounterclockwise, BsSliders } from 'react-icons/bs';
import {
  getRatingCriteria,
  getRatingCriterionLabel,
  getRatingUseCasePresetLabel,
  type RatingCriterionKey,
  type UseCasePresetId,
} from '@repo/shared-data/rules';
import { formatPercent } from '@/lib/locale-format';
import {
  availableCategoryUseCasePresets,
  formatNormalizedWeightSummary,
  isDefaultCategoryWeights,
  normalizeCategoryWeights,
  type ActiveWeightMode,
  type CategoryCriterionWeights,
} from '@/lib/use-case-weights';

export interface UseCaseWeightBarCopy {
  readonly groupLabel: string;
  readonly customizeBtn: string;
  readonly customActiveBadge: string;
  readonly resetBtn: string;
  readonly normalizedSummaryPrefix: string;
  readonly officialKeepNote: string;
  readonly presetLabels?: Readonly<Partial<Record<UseCasePresetId, string>>>;
  readonly criterionLabels?: Readonly<
    Partial<Record<RatingCriterionKey, string>>
  >;
}

export interface UseCaseWeightBarProps {
  readonly categorySlug: string;
  readonly availableCriteria: readonly RatingCriterionKey[];
  readonly mode: ActiveWeightMode;
  readonly weights: CategoryCriterionWeights;
  readonly showSliders: boolean;
  readonly onToggleSliders: () => void;
  readonly onSelectPreset: (presetId: UseCasePresetId) => void;
  readonly onUpdateWeight: (key: RatingCriterionKey, value: number) => void;
  readonly onReset: () => void;
  readonly copy: UseCaseWeightBarCopy;
  readonly locale?: string;
  readonly variant?: 'light' | 'dark';
  readonly groupLabelId?: string;
  readonly slidersPanelId?: string;
  readonly trailingActions?: React.ReactNode;
  readonly testIdPrefix?: string;
}

export default function UseCaseWeightBar({
  categorySlug,
  availableCriteria,
  mode,
  weights,
  showSliders,
  onToggleSliders,
  onSelectPreset,
  onUpdateWeight,
  onReset,
  copy,
  locale = 'vi',
  variant = 'light',
  groupLabelId: groupLabelIdProp,
  slidersPanelId: slidersPanelIdProp,
  trailingActions,
  testIdPrefix = 'use-case-weights',
}: UseCaseWeightBarProps) {
  const reactId = useId();
  const groupLabelId = groupLabelIdProp || `${reactId}-group-label`;
  const slidersPanelId = slidersPanelIdProp || `${reactId}-sliders-panel`;
  const isDark = variant === 'dark';

  const presets = availableCategoryUseCasePresets(
    categorySlug,
    availableCriteria
  );
  const criteria = getRatingCriteria(categorySlug);
  const availableSet = new Set<RatingCriterionKey>(availableCriteria);
  const sliderCriteria = criteria.filter((c) => availableSet.has(c.key));
  if (presets.length === 0 || sliderCriteria.length === 0) {
    return trailingActions ? (
      <div className="d-flex justify-content-end align-items-center flex-wrap gap-2">
        {trailingActions}
      </div>
    ) : null;
  }

  const normalized = normalizeCategoryWeights(
    categorySlug,
    weights,
    availableCriteria
  );
  const isDefault = isDefaultCategoryWeights(
    categorySlug,
    mode,
    weights,
    availableCriteria
  );
  const weightSummary = formatNormalizedWeightSummary(
    categorySlug,
    normalized.normalizedPercent,
    locale,
    copy.criterionLabels,
    availableCriteria
  );

  const resolvePresetLabel = (
    presetId: UseCasePresetId,
    fallbackObj: { label: { vi: string; en: string; cs: string } }
  ) => {
    const customText =
      copy.presetLabels &&
      Object.prototype.hasOwnProperty.call(copy.presetLabels, presetId)
        ? copy.presetLabels[presetId]
        : undefined;
    return customText && customText.trim()
      ? customText
      : getRatingUseCasePresetLabel(fallbackObj, locale);
  };

  const resolveCriterionText = (
    criterionKey: RatingCriterionKey,
    fallbackObj: { label: { vi: string; en: string; cs: string } }
  ) => {
    const customText =
      copy.criterionLabels &&
      Object.prototype.hasOwnProperty.call(copy.criterionLabels, criterionKey)
        ? copy.criterionLabels[criterionKey]
        : undefined;
    return customText && customText.trim()
      ? customText
      : getRatingCriterionLabel(fallbackObj, locale);
  };

  return (
    <div data-testid={`${testIdPrefix}-bar`}>
      <div className="d-flex justify-content-between align-items-center flex-wrap gap-2">
        <div
          className="d-flex align-items-center flex-wrap gap-2"
          role="group"
          aria-labelledby={groupLabelId}
        >
          <span
            id={groupLabelId}
            className={
              isDark
                ? 'small text-white-50 fw-semibold me-1'
                : 'small text-muted fw-semibold me-1'
            }
          >
            {copy.groupLabel}
          </span>

          {presets.map((preset) => {
            const isSelected = mode === preset.id;
            const btnClass = isDark
              ? isSelected
                ? 'btn-primary fw-bold text-white'
                : 'btn-outline-light'
              : isSelected
                ? 'btn-primary fw-semibold text-white shadow-sm'
                : 'btn-outline-dark';
            return (
              <button
                key={preset.id}
                type="button"
                aria-pressed={isSelected}
                data-testid={`${testIdPrefix}-preset-${preset.id}`}
                onClick={() => onSelectPreset(preset.id)}
                className={`btn btn-sm rounded-pill px-3 py-1 ${btnClass}`}
                style={{ fontSize: '0.8125rem' }}
              >
                {resolvePresetLabel(preset.id, preset)}
              </button>
            );
          })}

          <button
            type="button"
            aria-expanded={showSliders}
            aria-controls={slidersPanelId}
            data-testid={`${testIdPrefix}-toggle-sliders`}
            onClick={onToggleSliders}
            className={`btn btn-sm rounded-pill px-3 py-1 ${
              isDark
                ? showSliders || mode === 'custom'
                  ? 'btn-warning text-dark fw-bold'
                  : 'btn-outline-secondary text-light'
                : showSliders || mode === 'custom'
                  ? 'btn-primary fw-semibold text-white'
                  : 'btn-outline-primary'
            }`}
            style={{ fontSize: '0.8125rem' }}
          >
            <BsSliders aria-hidden="true" className="me-1" />
            {copy.customizeBtn}
            {mode === 'custom' && (
              <span className="visually-hidden">
                {`: ${copy.customActiveBadge}`}
              </span>
            )}
          </button>

          {!isDefault && (
            <button
              type="button"
              data-testid={`${testIdPrefix}-reset`}
              onClick={onReset}
              className={`btn btn-sm rounded-pill px-3 py-1 ${
                isDark ? 'btn-outline-light' : 'btn-outline-dark'
              }`}
              style={{ fontSize: '0.8125rem' }}
            >
              <BsArrowCounterclockwise aria-hidden="true" className="me-1" />
              {copy.resetBtn}
            </button>
          )}
        </div>

        {trailingActions && (
          <div className="d-flex align-items-center flex-wrap gap-2">
            {trailingActions}
          </div>
        )}
      </div>

      {(!isDefault || showSliders) && weightSummary && (
        <div
          role="status"
          aria-live="polite"
          data-testid={`${testIdPrefix}-summary`}
          className={`small mt-2 ${isDark ? 'text-white-50' : 'text-muted'}`}
          style={{ fontSize: '0.8125rem' }}
        >
          <span className="fw-semibold">{copy.normalizedSummaryPrefix}</span>{' '}
          <span className="rate-tabular">{weightSummary}</span>
          {!isDefault && copy.officialKeepNote ? (
            <span>{` · ${copy.officialKeepNote}`}</span>
          ) : null}
        </div>
      )}

      {showSliders && sliderCriteria.length > 0 && (
        <div
          id={slidersPanelId}
          data-testid={`${testIdPrefix}-sliders-panel`}
          className={
            isDark
              ? 'rounded-3 border-secondary border-opacity-25 mt-3 border p-3'
              : 'rounded-3 bg-light mt-2 border p-3'
          }
          style={isDark ? { background: 'rgba(255,255,255,0.04)' } : undefined}
        >
          <div className="row g-3">
            {sliderCriteria.map((criterion) => {
              const sliderId = `${reactId}-slider-${criterion.key}`;
              const labelText = resolveCriterionText(criterion.key, criterion);
              const rawVal = normalized.sliderWeights[criterion.key] ?? 0;
              const normPct = normalized.normalizedPercent[criterion.key] ?? 0;
              return (
                <div key={criterion.key} className="col-lg-4 col-sm-6">
                  <div className="d-flex justify-content-between align-items-center small fw-semibold mb-1">
                    <label
                      htmlFor={sliderId}
                      className={isDark ? 'mb-0 text-white' : 'text-dark mb-0'}
                    >
                      {labelText}
                    </label>
                    <span
                      className={`rate-tabular fw-bold ${
                        isDark ? 'text-warning' : 'text-danger'
                      }`}
                    >
                      {formatPercent(normPct, locale)}
                    </span>
                  </div>
                  <input
                    id={sliderId}
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    value={rawVal}
                    aria-valuetext={`${rawVal} (${formatPercent(normPct, locale)})`}
                    onChange={(e) =>
                      onUpdateWeight(criterion.key, Number(e.target.value))
                    }
                    className="form-range"
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
