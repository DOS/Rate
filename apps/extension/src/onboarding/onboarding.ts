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
let consentMutationVersion = 0;
let storedOptIn = false;
let storedConsentVersion = 0;
let bufferedHydrationUpdate: {
  hasOptIn: boolean;
  optIn: boolean;
  hasVersion: boolean;
  consentVersion: number;
  sawBusy: boolean;
} | null = null;

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
  const mutationAtStart = consentMutationVersion;
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
    if (consentMutationVersion === mutationAtStart) {
      hydrated = true;
      bufferedHydrationUpdate = null;
      storedOptIn = optIn;
      storedConsentVersion = optIn ? OPT_IN_CONSENT_VERSION : 0;
      markChoice(optIn);
      if (status) {
        status.textContent = t(
          optIn ? 'onboardingSavedYes' : 'onboardingSavedNo'
        );
      }
    }
  } catch {
    if (hydrated) {
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
  const finishHydration = (stored: Record<string, unknown> | undefined) => {
    if (hydrated) return;
    const buffered = bufferedHydrationUpdate;
    bufferedHydrationUpdate = null;
    if (!stored && !buffered) {
      hydrated = true;
      return;
    }
    const baseOptIn = stored?.crowdContributeOptIn === true;
    const baseVersion =
      typeof stored?.crowdConsentVersion === 'number'
        ? stored.crowdConsentVersion
        : 0;
    const baseEffectiveOptIn =
      baseOptIn && baseVersion === OPT_IN_CONSENT_VERSION;
    storedOptIn = buffered?.hasOptIn ? buffered.optIn : baseOptIn;
    storedConsentVersion = buffered?.hasVersion
      ? buffered.consentVersion
      : baseVersion;
    hydrated = true;
    const nextOptIn = isEffectiveOptIn();
    if (buffered) {
      markChoice(nextOptIn);
      const status = document.getElementById('status');
      if (
        status &&
        (buffered.hasOptIn ||
          buffered.sawBusy ||
          busy ||
          nextOptIn !== baseEffectiveOptIn ||
          Boolean(status.textContent))
      ) {
        status.textContent = t(
          nextOptIn ? 'onboardingSavedYes' : 'onboardingSavedNo'
        );
      }
    } else if (!busy) {
      markChoice(nextOptIn);
    }
  };
  void Promise.resolve(
    chrome.storage?.local?.get(['crowdContributeOptIn', 'crowdConsentVersion'])
  )
    .then((stored) => {
      finishHydration(stored);
    })
    .catch(() => {
      finishHydration(undefined);
    });
  chrome.storage?.onChanged?.addListener((changes, areaName) => {
    if (areaName !== 'local') return;
    const hasOptIn = 'crowdContributeOptIn' in changes;
    const hasVersion = 'crowdConsentVersion' in changes;
    if (!hasOptIn && !hasVersion) {
      return;
    }
    consentMutationVersion += 1;
    const nextOptInValue = changes.crowdContributeOptIn?.newValue === true;
    const nextVersionValue =
      typeof changes.crowdConsentVersion?.newValue === 'number'
        ? changes.crowdConsentVersion.newValue
        : 0;
    if (!hydrated) {
      bufferedHydrationUpdate = {
        hasOptIn: hasOptIn || Boolean(bufferedHydrationUpdate?.hasOptIn),
        optIn: hasOptIn
          ? nextOptInValue
          : (bufferedHydrationUpdate?.optIn ?? false),
        hasVersion: hasVersion || Boolean(bufferedHydrationUpdate?.hasVersion),
        consentVersion: hasVersion
          ? nextVersionValue
          : (bufferedHydrationUpdate?.consentVersion ?? 0),
        sawBusy: busy || Boolean(bufferedHydrationUpdate?.sawBusy),
      };
      return;
    }
    const prevOptIn = isEffectiveOptIn();
    if (hasOptIn) {
      storedOptIn = nextOptInValue;
    }
    if (hasVersion) {
      storedConsentVersion = nextVersionValue;
    }
    const nextOptIn = isEffectiveOptIn();
    markChoice(nextOptIn);
    const status = document.getElementById('status');
    if (
      status &&
      (hasOptIn ||
        busy ||
        nextOptIn !== prevOptIn ||
        Boolean(status.textContent))
    ) {
      status.textContent = t(
        nextOptIn ? 'onboardingSavedYes' : 'onboardingSavedNo'
      );
    }
  });
});
