import { test, expect } from "@playwright/test"

const BASE_URL = process.env.UI_BASE_URL || "http://localhost:3000"

test.describe("Radiant parity - smoke", () => {
  test("homepage sections and CTAs match expected structure", async ({ page }) => {
    await page.goto(BASE_URL + "/")

    // Hero
    await expect(
      page.getByRole("heading", { level: 1, name: "Close every deal." })
    ).toBeVisible()
    await expect(
      page.getByText("Radiant helps you sell more", { exact: false })
    ).toBeVisible()
    // CTA presence (disambiguate multiple matches via href)
    await expect(page.locator('a[href*="/submit"]').first()).toBeVisible()
    await expect(page.locator('a[href*="/pricing"]').first()).toBeVisible()

    // Logo cloud
    await expect(page.getByRole("img", { name: /SavvyCal/i })).toBeVisible()
    await expect(page.getByRole("img", { name: /Tuple/i })).toBeVisible()
    await expect(page.getByRole("img", { name: /Transistor/i })).toBeVisible()
    await expect(page.getByRole("img", { name: /Statamic/i })).toBeVisible()

    // First feature section
    await expect(
      page.getByRole("heading", { level: 2, name: "A snapshot of your entire sales pipeline." })
    ).toBeVisible()
    await expect(page.getByRole("heading", { name: "Sales", exact: true })).toBeVisible()
    await expect(
      page.getByRole("heading", { name: "Know more about your customers than they do." })
    ).toBeVisible()

    // Bento cards
    for (const title of ["Insight", "Analysis", "Speed", "Source", "Limitless"]) {
      await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible()
    }

    // Dark bento section
    const outreachHeading = page.getByRole("heading", { name: "Outreach", exact: true }).first()
    await outreachHeading.scrollIntoViewIfNeeded()
    await expect(outreachHeading).toBeVisible()
    const outreachSubtitle = page.getByRole("heading", { name: "Customer outreach has never been easier." })
    await expect(outreachSubtitle).toBeVisible()

    // Testimonials
    await expect(
      page.getByRole("heading", { name: "What everyone is saying" })
    ).toBeVisible()
    await expect(
      page.getByRole("heading", { name: "Trusted by professionals." })
    ).toBeVisible()

    // Footer links (scope to contentinfo to avoid duplicates)
    const footer = page.getByRole("contentinfo")
    await expect(footer.getByRole("link", { name: /Pricing/i }).first()).toBeVisible()
    await expect(footer.getByRole("link", { name: /Blog/i }).first()).toBeVisible()
    await expect(footer.getByRole("link", { name: /Company/i }).first()).toBeVisible()

    // Do not click CTAs yet; pricing/company pages pending
  })
})


