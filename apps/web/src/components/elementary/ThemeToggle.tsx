'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { BsCircleHalf, BsMoonStarsFill, BsSunFill } from 'react-icons/bs';

import {
  applyThemeChoice,
  followSystemTheme,
  readThemeChoice,
  resolveTheme,
  THEME_ATTRIBUTE,
  THEME_CHANGE_EVENT,
  THEME_STORAGE_KEY,
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
  // The choice as this page knows it, also when storage is blocked.
  const current = useRef<ThemeChoice>('system');
  useEffect(() => {
    current.current = readThemeChoice();
    setChoice(current.current);
    // A 404 is served as Next's error shell and its <head> script, inserted
    // by React, never runs: set the theme here, after the first paint.
    const root = document.documentElement;
    if (!root.hasAttribute(THEME_ATTRIBUTE)) {
      root.setAttribute(THEME_ATTRIBUTE, resolveTheme(current.current));
    }
    // The desktop and phone controls are both mounted, and another tab may
    // choose too: each control follows every change.
    const onChange = (event: Event) => {
      current.current = (event as CustomEvent<ThemeChoice>).detail;
      setChoice(current.current);
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === THEME_STORAGE_KEY) applyThemeChoice(readThemeChoice());
    };
    window.addEventListener(THEME_CHANGE_EVENT, onChange);
    window.addEventListener('storage', onStorage);
    const stopFollowing = followSystemTheme(() => current.current);
    return () => {
      window.removeEventListener(THEME_CHANGE_EVENT, onChange);
      window.removeEventListener('storage', onStorage);
      stopFollowing();
    };
  }, []);
  const choose = (next: ThemeChoice) => applyThemeChoice(next);
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
 * One icon button for the desktop navbar, which has no room for three. From
 * "system" a click goes to the theme not on screen, then light, dark and
 * back to system. Its name says the current choice.
 */
export function ThemeCycleButton({ className = '' }: { className?: string }) {
  const t = useTranslations('rate.nav');
  const [choice, choose] = useThemeChoice();
  const index = OPTIONS.findIndex((o) => o.choice === (choice ?? 'system'));
  const current = OPTIONS[index]!;
  // Worked out on click: the server has no window to resolve "system".
  const nextChoice = (): ThemeChoice =>
    current.choice === 'system'
      ? resolveTheme('system') === 'dark'
        ? 'light'
        : 'dark'
      : current.choice === 'light'
        ? 'dark'
        : 'system';
  const Icon = current.Icon;

  return (
    <button
      type="button"
      className={`rate-theme-cycle ${className}`}
      aria-label={t('themeCycleAria', { theme: t(current.labelKey) })}
      title={t('themeCycleAria', { theme: t(current.labelKey) })}
      data-testid="theme-cycle"
      data-theme-choice={choice ?? undefined}
      onClick={() => choose(nextChoice())}
    >
      <Icon aria-hidden="true" />
    </button>
  );
}
