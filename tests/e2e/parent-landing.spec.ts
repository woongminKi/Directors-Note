import { expect, test } from "@playwright/test";

test("E2E-E5: invalid token shows expired-or-invalid page", async ({
	page,
}) => {
	await page.goto("/feedback/totally-fake-token-1234567890");
	await expect(page.locator("h1")).toContainText("만료");
});

test("E2E-E4: parent landing never exposes AI grade words (P2 hold)", async ({
	page,
}) => {
	await page.goto("/feedback/totally-fake-token-1234567890");
	for (const word of [
		"AI",
		"분석",
		"내부 등급",
		"vocal_score",
		"expression_score",
	]) {
		await expect(page.locator(`text=${word}`)).toHaveCount(0);
	}
});
