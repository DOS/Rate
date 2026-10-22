'use client';
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';

import { FiArrowUp } from 'react-icons/fi';

export default function BackToTop() {
  const t = useTranslations('rate.nav');
  const [scroll, setScroll] = useState<boolean>(false);

  const scrollToTop = () => {
    const reduceMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)'
    ).matches;
    window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
  };

  useEffect(() => {
    // Only the visibility flips, so most scroll events change no state.
    const handlerScroll = () => setScroll(window.scrollY > 50);
    handlerScroll();
    window.addEventListener('scroll', handlerScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', handlerScroll);
    };
  }, []);

  return (
    <button
      type="button"
      onClick={scrollToTop}
      className={`top-scroll ${scroll ? 'd-flex' : 'd-none'}`}
      title={t('backToTop')}
      aria-label={t('backToTop')}
    >
      <FiArrowUp className="ti-arrow-up backIcon" aria-hidden="true" />
    </button>
  );
}
