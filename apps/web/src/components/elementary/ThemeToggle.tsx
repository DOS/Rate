'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { BsCircleHalf, BsMoonStarsFill, BsSunFill } from 'react-icons/bs';

import {
  applyThemeChoice,
  followSystemTheme,
  readThemeChoice,
  type ThemeChoice,
} from '@/lib/theme';

const OPTIONS: {
  choice: ThemeChoice;
  labelKey: 'themeLight' | 'themeDark' | 'themeSystem';
  Icon: typeof BsSunFill;
}[] = [
  { choice: 'light', labelKey: 'themeLight', Icon: BsSunFill },
  { choice: 'dark', labelKey: 'themeDark', Icon: BsMoonStarsFill },
  { choice: 'system', labelKey: 'themeSystem', Icon: BsCircleHalf },
];

/**
 * The stored choice, read after mount: the server HTML knows no choice, so
 * the first client render must match it (DOS/Rate#1435). Also follows an OS
 * change while the choice is "system".
 */
function useThemeChoice() {
  const [choice, setChoice] = useState<ThemeChoice | null>(null);
  useEffect(() => {
    setChoice(readThemeChoice());
    return followSystemTheme(readThemeChoice);
  }, []);
  const choose = (next: ThemeChoice) => {
    applyThemeChoice(next);
    setChoice(next);
  };
  return [choice, choose] as const;
}

/**
 * Light, dark or follow the system, as three named buttons: the phone menu
 * (DOS/Rate#1435).
 */
export default function ThemeToggle({
  className = '',
}: {
  className?: string;
}) {
  const t = useTranslations('rate.nav');
  const [choice, choose] = useThemeChoice();

  return (
    <div
      role="group"
      aria-label={t('themeGroupAria')}
      className={`rate-theme-toggle ${className}`}
      data-testid="theme-toggle"
    >
      {OPTIONS.map(({ choice: option, labelKey, Icon }) => (
        <button
          key={option}
          type="button"
          className={`rate-theme-toggle-btn${choice === option ? ' is-active' : ''}`}
          aria-pressed={choice === option}
          data-theme-choice={option}
          onClick={() => choose(option)}
        >
          <Icon aria-hidden="true" />
          <span>{t(labelKey)}</span>
        </button>
      ))}
    </div>
  );
}

/**
 * One icon button for the desktop navbar, which has no room for three: each
 * click moves to the next choice (light, dark, system). Its name says the
 * current choice.
 */
export function ThemeCycleButton({ className = '' }: { className?: string }) {
  const t = useTranslations('rate.nav');
  const [choice, choose] = useThemeChoice();
  const index = OPTIONS.findIndex((o) => o.choice === (choice ?? 'system'));
  const current = OPTIONS[index]!;
  const next = OPTIONS[(index + 1) % OPTIONS.length]!;
  const Icon = current.Icon;

  return (
    <button
      type="button"
      className={`rate-theme-cycle ${className}`}
      aria-label={t('themeCycleAria', { theme: t(current.labelKey) })}
      title={t('themeCycleAria', { theme: t(current.labelKey) })}
      data-testid="theme-cycle"
      data-theme-choice={choice ?? undefined}
      onClick={() => choose(next.choice)}
    >
      <Icon aria-hidden="true" />
    </button>
  );
}
