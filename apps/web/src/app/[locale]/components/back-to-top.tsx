'use client';
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';

import { FiArrowUp } from 'react-icons/fi';

export default function BackToTop() {
  const t = useTranslations('rate.nav');
  const [scroll, setScroll] = useState<boolean>(false);
  // More than a screen down: while hidden it stays in the Tab order and
  // shows on focus, so keyboard readers still reach it.
  const [deep, setDeep] = useState<boolean>(false);

  const scrollToTop = () => {
    const reduceMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)'
    ).matches;
    window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
  };

  useEffect(() => {
    // Shown only while the buyer scrolls back up from more than a screen
    // down, so it does not sit on the content they are reading on the way
    // down (DOS/Rate#1487). Only the visibility flips, so most scroll
    // events change no state.
    let lastY = window.scrollY;
    const handlerScroll = () => {
      const y = window.scrollY;
      // iOS bounces past the end and back; that is not a scroll up.
      const maxY = document.documentElement.scrollHeight - window.innerHeight;
      if (y > maxY) return;
      setDeep(y > window.innerHeight);
      if (y <= window.innerHeight) setScroll(false);
      else if (y < lastY) setScroll(true);
      else if (y > lastY) setScroll(false);
      lastY = y;
    };
    window.addEventListener('scroll', handlerScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', handlerScroll);
    };
  }, []);

  return (
    <button
      type="button"
      onClick={scrollToTop}
      className={`top-scroll ${
        scroll ? 'd-flex' : deep ? 'd-flex visually-hidden-focusable' : 'd-none'
      }`}
      title={t('backToTop')}
      aria-label={t('backToTop')}
    >
      <FiArrowUp className="ti-arrow-up backIcon" aria-hidden="true" />
    </button>
  );
}
