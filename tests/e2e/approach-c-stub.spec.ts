import { expect, test } from "@playwright/test";

test.skip(
	process.env.FEATURE_AI_VIDEO_ANALYSIS !== "true",
	"Flag OFF: Approach-C path not exercised",
);

test("E2E-E2: Approach-C stub flow → review", async ({ page }) => {
	await page.goto("/students");
	await page.locator("li a").first().click();
	await page.click("button:has-text('시작하기')");
	await page.waitForURL(/\/evaluation\/[^/]+$/);

	await page.setInputFiles('input[type="file"]', {
		name: "tiny.mp4",
		mimeType: "video/mp4",
		buffer: Buffer.from("00000020", "hex"),
	});
	await page.click("button:has-text('분석 시작')");

	// Stub takes ~8s (per StubVideoAnalysisService); wait for redirect
	await page.waitForURL("**/review", { timeout: 30000 });
	await expect(page.locator("textarea")).toBeVisible();
});
