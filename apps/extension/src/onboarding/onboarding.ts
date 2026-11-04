/**
 * The consent screen shown once at install (DOS/Rate#1603, JOY 2026-11-04:
 * ask at install and keep the side panel toggle, default off). The choice
 * goes to the same setting as the side panel toggle; closing the page leaves
 * the default, off, so nothing extra is sent.
 */
import { applyDocumentMessages, t } from '../i18n.js';

async function choose(optIn: boolean): Promise<void> {
  const status = document.getElementById('status');
  const buttons = document.querySelectorAll<HTMLButtonElement>('button');
  buttons.forEach((b) => (b.disabled = true));
  try {
    const res = (await chrome.runtime.sendMessage({
      type: 'RATE_UPDATE_SETTINGS',
      crowdContributeOptIn: optIn,
    })) as { ok?: boolean; settings?: { crowdContributeOptIn?: boolean } };
    if (!res?.ok || res.settings?.crowdContributeOptIn !== optIn) {
      throw new Error('not saved');
    }
    if (status) {
      status.textContent = t(
        optIn ? 'onboardingSavedYes' : 'onboardingSavedNo'
      );
    }
  } catch {
    if (status) status.textContent = t('onboardingSaveFailed');
  } finally {
    buttons.forEach((b) => (b.disabled = false));
  }
}

document.addEventListener('DOMContentLoaded', () => {
  applyDocumentMessages(document);
  document.title = t('onboardingTitle');
  document
    .getElementById('btn-no')
    ?.addEventListener('click', () => void choose(false));
  document
    .getElementById('btn-yes')
    ?.addEventListener('click', () => void choose(true));
});
