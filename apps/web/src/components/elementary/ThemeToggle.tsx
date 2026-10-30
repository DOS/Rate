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
 * Light, dark or follow the system (DOS/Rate#1435). The server HTML marks no
 * option, since the choice lives in the browser; it is read after mount so
 * hydration matches. Each button names itself in a label that the phone menu
 * shows and the desktop navbar hides visually (_custom.scss).
 */
export default function ThemeToggle() {
  const t = useTranslations('rate.nav');
  const [choice, setChoice] = useState<ThemeChoice | null>(null);

  useEffect(() => {
    setChoice(readThemeChoice());
    // The stored choice is the source of truth: another tab may change it.
    return followSystemTheme(readThemeChoice);
  }, []);

  return (
    <div
      role="group"
      aria-label={t('themeGroupAria')}
      className="rate-theme-toggle"
      data-testid="theme-toggle"
    >
      {OPTIONS.map(({ choice: option, labelKey, Icon }) => (
        <button
          key={option}
          type="button"
          className={`rate-theme-toggle-btn${choice === option ? ' is-active' : ''}`}
          aria-pressed={choice === option}
          title={t(labelKey)}
          data-theme-choice={option}
          onClick={() => {
            applyThemeChoice(option);
            setChoice(option);
          }}
        >
          <Icon aria-hidden="true" />
          <span className="rate-theme-toggle-label">{t(labelKey)}</span>
        </button>
      ))}
    </div>
  );
}
