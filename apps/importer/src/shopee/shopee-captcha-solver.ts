import { Page } from 'playwright';

export interface CaptchaSolverOptions {
  maxRetries?: number;
  timeoutMs?: number;
}

export class ShopeeCaptchaSolver {
  private maxRetries: number;
  private timeoutMs: number;

  constructor(options: CaptchaSolverOptions = {}) {
    this.maxRetries = options.maxRetries ?? 3;
    this.timeoutMs = options.timeoutMs ?? 15000;
  }

  /**
   * Detect whether a Shopee Captcha/Verification modal or page is present
   */
  public async detect(page: Page): Promise<boolean> {
    try {
      const url = page.url();
      if (url.includes('/verify/traffic') || url.includes('/verify/slider') || url.includes('scene=crawler_item')) {
        return true;
      }

      const captchaModal = await page.$(
        'aside[aria-modal="true"], #NEW_CAPTCHA, #captchaMask, #sliderContainer, .captcha_verify_slide'
      );
      return Boolean(captchaModal);
    } catch {
      return false;
    }
  }

  /**
   * Wait briefly to see if captcha appears after navigation or action
   */
  public async waitForCaptcha(page: Page, timeoutMs = 3000): Promise<boolean> {
    const startTime = Date.now();
    while (Date.now() - startTime < timeoutMs) {
      if (await this.detect(page)) {
        return true;
      }
      await page.waitForTimeout(300);
    }
    return false;
  }

  /**
   * Solve captcha if present on page
   */
  public async solveIfPresent(page: Page): Promise<boolean> {
    if (!(await this.detect(page))) {
      return true; // No captcha present
    }

    console.log('[ShopeeCaptchaSolver] Captcha detected! Initiating auto-solve sequence...');
    return this.solve(page);
  }

  /**
   * Run the full solve attempt with retries
   */
  public async solve(page: Page): Promise<boolean> {
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      console.log(`[ShopeeCaptchaSolver] Solve attempt ${attempt}/${this.maxRetries}...`);
      try {
        await page.waitForTimeout(1000); // Allow images and DOM to settle

        // 1. Locate the slider button
        const sliderBtn = await this.locateSliderButton(page);
        if (!sliderBtn) {
          console.warn('[ShopeeCaptchaSolver] Slider button not found, retrying...');
          await page.waitForTimeout(1000);
          continue;
        }

        // 2. Find target horizontal offset X using in-browser canvas template matching / edge detection
        const targetOffsetX = await this.calculateTargetDistance(page);
        if (!targetOffsetX || targetOffsetX <= 20) {
          console.warn(`[ShopeeCaptchaSolver] Invalid target offset detected (${targetOffsetX}px), retrying...`);
          await this.tryRefreshCaptcha(page);
          await page.waitForTimeout(1500);
          continue;
        }

        console.log(`[ShopeeCaptchaSolver] Calculated target slider offset: ${targetOffsetX}px`);

        // 3. Perform human-like drag & drop
        await this.humanDrag(page, sliderBtn, targetOffsetX);

        // 4. Wait for verification result
        await page.waitForTimeout(2000);

        // Check if captcha is still present
        const stillPresent = await this.detect(page);
        if (!stillPresent) {
          console.log('[ShopeeCaptchaSolver] Captcha solved successfully!');
          return true;
        } else {
          console.warn('[ShopeeCaptchaSolver] Captcha still present after drag. Attempting retry...');
          await page.waitForTimeout(1000);
        }
      } catch (err: any) {
        console.error(`[ShopeeCaptchaSolver] Error during attempt ${attempt}:`, err.message);
        await page.waitForTimeout(1000);
      }
    }

    console.error('[ShopeeCaptchaSolver] Failed to solve captcha after maximum retries.');
    return false;
  }

  /**
   * Locate the draggable button of the slider
   */
  private async locateSliderButton(page: Page) {
    const selectors = [
      'aside[aria-modal="true"] div[style*="width: 40px"]',
      'aside[aria-modal="true"] div[style*="width:40px"]',
      '#sliderContainer > div > div',
      '.captcha_verify_slide--slidebar div',
      'div[role="slider"]',
    ];

    for (const sel of selectors) {
      const el = await page.$(sel);
      if (el) {
        const box = await el.boundingBox();
        if (box && box.width > 0 && box.height > 0) {
          return { element: el, box };
        }
      }
    }
    return null;
  }

  /**
   * Calculate distance X from puzzle piece to the missing slot
   * Executes canvas image processing directly inside browser page context
   */
  private async calculateTargetDistance(page: Page): Promise<number> {
    return page.evaluate(async () => {
      // Find background image and piece image
      const bgImg = (document.querySelector(
        'aside[aria-modal="true"] div[aria-hidden="true"] img[draggable="false"], .DfwebI, #captcha-verify-image'
      ) ||
        document.querySelector('aside[aria-modal="true"] img:first-of-type') ||
        document.querySelector('#sliderContainer img')) as HTMLImageElement | null;

      const pieceImg = (document.querySelector(
        'aside[aria-modal="true"] div[aria-hidden="true"] img[draggable="true"], #puzzleImgComponent'
      ) || document.querySelector('aside[aria-modal="true"] img:last-of-type')) as HTMLImageElement | null;

      if (!bgImg) {
        return 0;
      }

      const bgRect = bgImg.getBoundingClientRect();
      const displayedWidth = bgRect.width || 340;

      // Draw background to offscreen canvas
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return 0;

      canvas.width = bgImg.naturalWidth || displayedWidth;
      canvas.height = bgImg.naturalHeight || bgRect.height || 180;
      const scale = displayedWidth / canvas.width;

      try {
        ctx.drawImage(bgImg, 0, 0, canvas.width, canvas.height);
        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const { data, width, height } = imgData;

        // Scan the image across vertical columns to detect the notch/gap
        // The gap has dark/shadow edges (high contrast gradients) and darker average luminance
        const startX = Math.floor(width * 0.22); // Target slot is never at the far left
        const endX = Math.floor(width * 0.92);
        const startY = Math.floor(height * 0.15);
        const endY = Math.floor(height * 0.85);

        let maxScore = -1;
        let bestX = 0;

        // Compute column edge gradient strength
        for (let x = startX; x < endX; x++) {
          let edgeScore = 0;
          let shadowScore = 0;

          for (let y = startY; y < endY; y++) {
            const idx = (y * width + x) * 4;
            const prevIdx = (y * width + (x - 2)) * 4;

            const r = data[idx], g = data[idx + 1], b = data[idx + 2];
            const pr = data[prevIdx], pg = data[prevIdx + 1], pb = data[prevIdx + 2];

            const lum = 0.299 * r + 0.587 * g + 0.114 * b;
            const plum = 0.299 * pr + 0.587 * pg + 0.114 * pb;

            // Difference between adjacent pixels
            const diff = Math.abs(lum - plum);
            if (diff > 45) {
              edgeScore += diff;
            }

            // Dark border characteristic of the cutout
            if (lum < 60) {
              shadowScore += 1;
            }
          }

          const totalScore = edgeScore + shadowScore * 10;
          if (totalScore > maxScore) {
            maxScore = totalScore;
            bestX = x;
          }
        }

        // Convert natural pixel X to CSS displayed pixel distance
        const calculatedDistance = Math.round(bestX * scale);

        // Adjust for piece initial left offset (usually around 10-15px)
        const pieceLeft = pieceImg ? pieceImg.getBoundingClientRect().left - bgRect.left : 0;
        const finalDistance = Math.max(20, calculatedDistance - (pieceLeft > 0 ? pieceLeft : 10));

        return finalDistance;
      } catch (err) {
        // Fallback estimate if canvas is cross-origin tainted
        return Math.round(displayedWidth * 0.48);
      }
    });
  }

  /**
   * Human-like slider dragging using cubic Bezier curve, acceleration, jitter & overshoot
   */
  private async humanDrag(
    page: Page,
    slider: { element: any; box: { x: number; y: number; width: number; height: number } },
    distanceX: number
  ): Promise<void> {
    const startX = slider.box.x + slider.box.width / 2;
    const startY = slider.box.y + slider.box.height / 2;

    // 1. Hover and press mouse down
    await page.mouse.move(startX, startY);
    await page.waitForTimeout(100 + Math.random() * 80);
    await page.mouse.down();
    await page.waitForTimeout(80 + Math.random() * 50);

    // 2. Generate smooth trajectory points
    // Add realistic overshoot (+2 to +5 pixels)
    const overshoot = Math.floor(Math.random() * 3) + 3;
    const totalDistance = distanceX + overshoot;

    const steps = 35 + Math.floor(Math.random() * 12);
    const points: Array<{ x: number; y: number; delay: number }> = [];

    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      // EaseInOut Quad / Cubic curve for human acceleration & deceleration
      const progress = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

      const currentX = startX + totalDistance * progress;
      // Small vertical jitter (-1.5px to +1.5px)
      const currentY = startY + (Math.random() - 0.5) * 2.5;

      // Variable speed (slower at start and end, faster in middle)
      const delay = t < 0.2 || t > 0.8 ? 12 + Math.random() * 10 : 5 + Math.random() * 6;

      points.push({ x: currentX, y: currentY, delay });
    }

    // Execute mouse movements along the curve
    for (const pt of points) {
      await page.mouse.move(pt.x, pt.y);
      await page.waitForTimeout(pt.delay);
    }

    // 3. Hold slightly at overshoot position
    await page.waitForTimeout(80 + Math.random() * 60);

    // 4. Micro-correct back from overshoot to exact target
    const finalTargetX = startX + distanceX;
    const correctionSteps = 6;
    for (let j = 1; j <= correctionSteps; j++) {
      const corrT = j / correctionSteps;
      const cx = (startX + totalDistance) - overshoot * corrT;
      const cy = startY + (Math.random() - 0.5) * 1.5;
      await page.mouse.move(cx, cy);
      await page.waitForTimeout(15 + Math.random() * 10);
    }

    await page.mouse.move(finalTargetX, startY);
    await page.waitForTimeout(120 + Math.random() * 90);

    // 5. Release mouse
    await page.mouse.up();
  }

  /**
   * Click the refresh captcha button if puzzle is ambiguous
   */
  private async tryRefreshCaptcha(page: Page): Promise<void> {
    try {
      const refreshBtn = await page.$(
        'aside[aria-modal="true"] button[aria-label*="refresh"], aside[aria-modal="true"] .icon-refresh, #reloadCaptcha'
      );
      if (refreshBtn) {
        await refreshBtn.click();
        await page.waitForTimeout(1000);
      }
    } catch {
      // Non-critical
    }
  }
}
