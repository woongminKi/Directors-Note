import { expect, test } from "@playwright/test";

test.describe("Dashboard (코치 view)", () => {
	test.skip(!process.env.E2E_AUTH_READY, "E2E auth setup not yet wired");
	test.use({ storageState: "tests/.auth/coach.json" });

	test("E2E-D1: 코치 login → dashboard 정상, owner row 안 보임", async ({
		page,
	}) => {
		await page.goto("/dashboard");
		await expect(
			page.getByRole("heading", { name: /안녕하세요/ }),
		).toBeVisible();
		await expect(page.getByLabel("학원 코치 진행률")).not.toBeVisible();
	});

	test("E2E-D3: 평가 시작 큐 row click → /students/:id", async ({ page }) => {
		await page.goto("/dashboard");
		// Eval-todo queue rows link directly to /students/<uuid>. The nav has
		// /students (no trailing slash), so the `/` after students disambiguates.
		const firstRow = page.locator("a[href^='/students/']").first();
		if (await firstRow.isVisible({ timeout: 2_000 }).catch(() => false)) {
			await firstRow.click();
			await expect(page).toHaveURL(/\/students\/[0-9a-f-]+/);
		}
	});

	test("E2E-D4: 검토 대기 row click → /evaluation/:id/review", async ({
		page,
	}) => {
		await page.goto("/dashboard");
		const reviewSection = page
			.getByText("검토 대기")
			.locator("..")
			.locator("..");
		const reviewLink = reviewSection
			.getByRole("link")
			.filter({ hasText: /^[가-힣]/ })
			.first();
		if (await reviewLink.isVisible({ timeout: 2_000 }).catch(() => false)) {
			await reviewLink.click();
			await expect(page).toHaveURL(/\/evaluation\/[0-9a-f-]+\/review/);
		}
	});
});

test.describe("Dashboard (Owner view)", () => {
	test.skip(!process.env.E2E_AUTH_READY, "E2E auth setup not yet wired");
	test.use({ storageState: "tests/.auth/owner.json" });

	test("E2E-D2: Owner login → owner row 표시, 코치 progress bars 존재", async ({
		page,
	}) => {
		await page.goto("/dashboard");
		await expect(page.getByLabel("학원 코치 진행률")).toBeVisible();
	});

	test("E2E-D5: RLS — 다른 학원 데이터 absent", async ({ page }) => {
		await page.goto("/dashboard");
		await expect(page.getByText("foreign-academy@bbb.kr")).not.toBeVisible();
	});
});
