import { test, expect } from "@playwright/test"

const BASE_URL = process.env.UI_BASE_URL || "http://localhost:3000"

test.describe("Radiant layout width", () => {
  test("container does not exceed template max width", async ({ page }) => {
    await page.goto(BASE_URL + "/")

    // Locate the inner container element that uses lg:max-w-7xl per template
    const container = page.locator("div.lg\\:max-w-7xl").first()
    await expect(container).toBeVisible()

    const width = await container.evaluate((el) => el.getBoundingClientRect().width)

    // 7xl = 80rem => 1280px (assume 16px root). Allow small tolerance for scrollbars/zoom.
    expect(width).toBeLessThanOrEqual(1296)
  })
})



