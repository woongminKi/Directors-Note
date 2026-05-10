import { expect, test } from "@playwright/test";

test.skip(!process.env.E2E_AUTH_READY, "E2E auth setup not yet wired");

test("E2E-E1: Approach-A flow → review → send → share-link", async ({
	page,
}) => {
	await page.goto("/students");
	await page.locator("li a").first().click();
	await page.click("button:has-text('시작하기')");
	await page.waitForURL("**/coach-form");

	// Fill 3 of 5 axes (≥2 required by coachBulletFormSchema)
	await page.fill('textarea[name="bullets.vocal"]', "발성 좋음");
	await page.fill('textarea[name="bullets.expression"]', "표정 자연스러움");
	await page.fill('textarea[name="bullets.examReadiness"]', "본방 70%");
	await page.click("button[type='submit']");

	await page.waitForURL("**/review");
	await expect(page.locator("textarea")).toBeVisible();

	// Send
	await page.click("button:has-text('승인 및 공유 링크')");
	await expect(page.locator("text=발송 완료")).toBeVisible({
		timeout: 10000,
	});
	await expect(
		page.locator("text=/^https?:\\/\\/.*\\/feedback\\//"),
	).toBeVisible();
});
