import { chromium } from 'playwright';
import { ShopeeCaptchaSolver } from './shopee-captcha-solver.js';

async function main() {
  const cdpEndpoint = process.env.CHROME_CDP_URL || 'http://localhost:9222';
  console.log(`[TestCaptcha] Connecting to Chrome CDP at: ${cdpEndpoint}...`);

  let browser;
  try {
    browser = await chromium.connectOverCDP(cdpEndpoint);
  } catch (err: any) {
    console.error(`[TestCaptcha] Cannot connect to Chrome CDP: ${err.message}`);
    console.log('[TestCaptcha] Please ensure Chrome is running with --remote-debugging-port=9222');
    process.exit(1);
  }

  const contexts = browser.contexts();
  if (contexts.length === 0) {
    console.error('[TestCaptcha] No active contexts in Chrome.');
    process.exit(1);
  }

  const context = contexts[0];
  const solver = new ShopeeCaptchaSolver({ maxRetries: 3 });

  // Check all existing tabs to see if any currently has a captcha open
  console.log('[TestCaptcha] Checking active pages for existing Captchas...');
  const pages = context.pages();
  let captchaFound = false;

  for (let i = 0; i < pages.length; i++) {
    const p = pages[i];
    const url = p.url();
    console.log(`  [Tab ${i + 1}] ${url.slice(0, 80)}`);
    const isCaptcha = await solver.detect(p);
    if (isCaptcha) {
      console.log(`  >>> Captcha detected in Tab ${i + 1}! Attempting auto-solve...`);
      captchaFound = true;
      const result = await solver.solve(p);
      console.log(`  >>> Auto-solve result: ${result ? 'SUCCESS' : 'FAILED'}`);
      break;
    }
  }

  if (!captchaFound) {
    console.log('[TestCaptcha] No active Captcha found in existing tabs.');
    console.log('[TestCaptcha] Opening a test Shopee verification target to verify detector...');
    const testPage = await context.newPage();
    try {
      await testPage.goto('https://shopee.vn/verify/traffic?scene=crawler_item', {
        waitUntil: 'domcontentloaded',
        timeout: 15000,
      }).catch(() => {});

      const detected = await solver.waitForCaptcha(testPage, 5000);
      console.log(`[TestCaptcha] Verification page detection result: ${detected ? 'DETECTED' : 'NOT DETECTED'}`);

      if (detected) {
        console.log('[TestCaptcha] Executing solver sequence on test page...');
        const success = await solver.solve(testPage);
        console.log(`[TestCaptcha] Solve execution finished with result: ${success ? 'SOLVED' : 'UNSOLVED'}`);
      }
    } finally {
      await testPage.close().catch(() => {});
    }
  }

  console.log('[TestCaptcha] Done.');
}

main().catch(console.error);
