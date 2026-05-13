import { expect, test } from "@playwright/test";

// These tests assume Playwright auth setup seeds an owner role at storageState
// `tests/.auth/owner.json` and a coach role at `tests/.auth/coach.json`.
// If that setup is not yet wired, these tests may need test.skip() guards.

test.describe("Students CRUD", () => {
	test.skip(!process.env.E2E_AUTH_READY, "E2E auth setup not yet wired");
	// Default storage for the describe — owner has the role required by
	// /students/new (requireRole(['owner','admin'])). S2 overrides per-test.
	test.use({ storageState: "tests/.auth/owner.json" });

	test("E2E-S1: owner adds student, toggles consent, sees enabled CTA", async ({
		page,
	}) => {
		// Use a unique name per run so the row created here doesn't conflict
		// with prior runs (especially the archived 보관테스트 from S3).
		const uniqueName = `테스트학생-${Date.now()}`;
		await page.goto("/students/new");
		await page.fill('input[name="name"]', uniqueName);
		await page.fill('input[name="year"]', "1년차");
		await page.click('[role="switch"]');
		await page.click('button[type="submit"]');
		await page.waitForURL("**/students/*", { timeout: 5_000 });
		await expect(page.locator("h1")).toContainText(uniqueName);
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
		// year is `optional` in the zod schema but its default is "" which fails
		// `.min(1)` — fill explicitly to dodge the schema-default trap.
		await page.fill('input[name="year"]', "1년차");
		await page.click('[role="switch"]');
		await page.click('button[type="submit"]');
		await page.waitForURL("**/students/*", { timeout: 5_000 });
		await page.click('button:has-text("보관 (archive)")');
		// confirm modal: click the destructive 보관 button (not the trigger)
		await page.locator('[role="dialog"] button:has-text("보관")').click();
		await page.waitForURL("**/students?filter=archived");
		// Archive action wipes student name to `STUDENT_DELETED_<id>` for PIPA
		// (see archiveStudent in src/lib/students/actions.ts), so the archived
		// list shows that prefix, not the original name.
		await expect(
			page.locator("li", { hasText: "STUDENT_DELETED" }).first(),
		).toBeVisible({ timeout: 5_000 });
	});
});
