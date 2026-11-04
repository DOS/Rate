/**
 * The consent screen shown once at install (DOS/Rate#1603, JOY 2026-11-04:
 * ask at install and keep the side panel toggle, default off). The choice
 * goes to the same setting as the side panel toggle; closing the page leaves
 * the default, off, so nothing extra is sent.
 */
import { applyDocumentMessages, t } from '../i18n.js';

let busy = false;

/** Marks the stored choice on its button. */
function markChoice(optIn: boolean | null): void {
  for (const [id, value] of [
    ['btn-no', false],
    ['btn-yes', true],
  ] as const) {
    document
      .getElementById(id)
      ?.setAttribute('aria-pressed', String(optIn === value));
  }
}

async function choose(optIn: boolean): Promise<void> {
  // A flag, not disabled buttons, so keyboard focus stays where it was.
  if (busy) return;
  busy = true;
  const status = document.getElementById('status');
  // Cleared first, so the same choice made twice is announced again.
  if (status) status.textContent = '';
  try {
    const res = (await chrome.runtime.sendMessage({
      type: 'RATE_UPDATE_SETTINGS',
      crowdContributeOptIn: optIn,
    })) as { ok?: boolean; settings?: { crowdContributeOptIn?: boolean } };
    if (!res?.ok || res.settings?.crowdContributeOptIn !== optIn) {
      throw new Error('not saved');
    }
    markChoice(optIn);
    if (status) {
      status.textContent = t(
        optIn ? 'onboardingSavedYes' : 'onboardingSavedNo'
      );
    }
  } catch {
    if (status) status.textContent = t('onboardingSaveFailed');
  } finally {
    busy = false;
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
  // The status always shows the stored choice, also one changed in the side
  // panel after this page saved it.
  if (typeof chrome === 'undefined') return;
  chrome.storage.onChanged?.addListener((changes, areaName) => {
    const change = changes.crowdContributeOptIn;
    const status = document.getElementById('status');
    if (areaName === 'local' && change && status) {
      markChoice(change.newValue === true);
      status.textContent = t(
        change.newValue === true ? 'onboardingSavedYes' : 'onboardingSavedNo'
      );
    }
  });
});
