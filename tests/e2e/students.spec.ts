import { expect, test } from "@playwright/test";

// These tests assume Playwright auth setup seeds an owner role at storageState
// `tests/.auth/owner.json` and a coach role at `tests/.auth/coach.json`.
// If that setup is not yet wired, these tests may need test.skip() guards.

test.describe("Students CRUD", () => {
	test.skip(!process.env.E2E_AUTH_READY, "E2E auth setup not yet wired");

	test("E2E-S1: owner adds student, toggles consent, sees enabled CTA", async ({
		page,
	}) => {
		await page.goto("/students/new");
		await page.fill('input[name="name"]', "테스트 학생");
		await page.fill('input[name="year"]', "1년차");
		await page.click('[role="switch"]');
		await page.click('button[type="submit"]');
		await expect(page.locator("h1")).toContainText("테스트 학생");
		await expect(page.locator("button", { hasText: "시작하기" })).toBeEnabled();
	});

	test("E2E-S2: coach role hides edit/archive buttons", async ({ browser }) => {
		const ctx = await browser.newContext({
			storageState: "tests/.auth/coach.json",
		});
		const page = await ctx.newPage();
		await page.goto("/students");
		const first = page.locator("li a").first();
		await first.click();
		await expect(page.locator("a", { hasText: "학생 정보 수정" })).toHaveCount(
			0,
		);
		await expect(page.locator("button", { hasText: "보관" })).toHaveCount(0);
	});

	test("E2E-S3: archive moves student to 보관됨 filter", async ({ page }) => {
		await page.goto("/students/new");
		await page.fill('input[name="name"]', "보관테스트");
		await page.click('[role="switch"]');
		await page.click('button[type="submit"]');
		await page.click('button:has-text("보관 (archive)")');
		// confirm modal: click the destructive 보관 button (not the trigger)
		await page.locator('[role="dialog"] button:has-text("보관")').click();
		await page.waitForURL("**/students?filter=archived");
		await expect(
			page.locator("li", { hasText: "STUDENT_DELETED" }),
		).toHaveCount(1);
	});
});
