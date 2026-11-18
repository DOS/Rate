/**
 * The consent screen shown once at install (DOS/Rate#1603, JOY 2026-11-04:
 * ask at install and keep the side panel toggle, default off). The choice
 * goes to the same setting as the side panel toggle; closing the page leaves
 * the default, off, so nothing extra is sent.
 */
import { applyDocumentMessages, t } from '../i18n.js';

const OPT_IN_CONSENT_VERSION = 2;

let busy = false;
let hydrated = false;
let seenOptInChange = false;
let seenVersionChange = false;
let storedOptIn = false;
let storedConsentVersion = 0;

function isEffectiveOptIn(): boolean {
  return storedOptIn && storedConsentVersion === OPT_IN_CONSENT_VERSION;
}

/** Marks the stored choice on its button. */
function markChoice(optIn: boolean | null): void {
  for (const [id, value] of [
    ['btn-no', false],
    ['btn-yes', true],
  ] as const) {
    const btn = document.getElementById(id);
    if (!btn) continue;
    const active = optIn === value;
    btn.setAttribute('aria-pressed', String(active));
    btn.classList?.toggle('primary', active);
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
    hydrated = true;
    seenOptInChange = true;
    seenVersionChange = true;
    storedOptIn = optIn;
    storedConsentVersion = optIn ? OPT_IN_CONSENT_VERSION : 0;
    markChoice(optIn);
    if (status) {
      status.textContent = t(
        optIn ? 'onboardingSavedYes' : 'onboardingSavedNo'
      );
    }
  } catch {
    if (hydrated || seenOptInChange || seenVersionChange) {
      markChoice(isEffectiveOptIn());
    }
    if (status) status.textContent = t('onboardingSaveFailed');
  } finally {
    busy = false;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  applyDocumentMessages(document);
  document.title = t('onboardingTitle');
  markChoice(false);
  document
    .getElementById('btn-no')
    ?.addEventListener('click', () => void choose(false));
  document
    .getElementById('btn-yes')
    ?.addEventListener('click', () => void choose(true));
  // The status always shows the stored choice, also one changed in the side
  // panel after this page saved it.
  if (typeof chrome === 'undefined') return;
  void Promise.resolve(
    chrome.storage?.local?.get(['crowdContributeOptIn', 'crowdConsentVersion'])
  )
    .then((stored) => {
      if (!stored) return;
      if (!seenOptInChange) {
        storedOptIn = stored.crowdContributeOptIn === true;
      }
      if (!seenVersionChange) {
        storedConsentVersion =
          typeof stored.crowdConsentVersion === 'number'
            ? stored.crowdConsentVersion
            : 0;
      }
      hydrated = true;
      if (!busy) {
        markChoice(isEffectiveOptIn());
      }
    })
    .catch(() => {
      // Default off state already applied above.
    });
  chrome.storage?.onChanged?.addListener((changes, areaName) => {
    if (areaName !== 'local') return;
    if (
      !('crowdContributeOptIn' in changes) &&
      !('crowdConsentVersion' in changes)
    ) {
      return;
    }
    const prevOptIn = isEffectiveOptIn();
    if ('crowdContributeOptIn' in changes) {
      seenOptInChange = true;
      storedOptIn = changes.crowdContributeOptIn?.newValue === true;
    }
    if ('crowdConsentVersion' in changes) {
      seenVersionChange = true;
      storedConsentVersion =
        typeof changes.crowdConsentVersion?.newValue === 'number'
          ? changes.crowdConsentVersion.newValue
          : 0;
    }
    const nextOptIn = isEffectiveOptIn();
    markChoice(nextOptIn);
    const status = document.getElementById('status');
    if (
      status &&
      ('crowdContributeOptIn' in changes ||
        nextOptIn !== prevOptIn ||
        Boolean(status.textContent))
    ) {
      status.textContent = t(
        nextOptIn ? 'onboardingSavedYes' : 'onboardingSavedNo'
      );
    }
  });
});
