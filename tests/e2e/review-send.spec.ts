import { expect, test } from "@playwright/test";

test.skip(!process.env.E2E_AUTH_READY, "E2E auth setup not yet wired");

// Letter generation calls gpt-4o-mini (~5-10s per letter-quality-check); the
// full create→start→submit→generate→redirect→send cycle needs headroom.
test.setTimeout(90_000);

// This test is idempotent: it provisions its OWN consent-on student per run
// instead of reusing a shared seed student. The earlier flake was not a submit
// race — it was non-idempotency. The old test picked the first seed student and
// SENT that student's monthly evaluation; on re-run (or in parallel with other
// specs) the precondition "student has a startable 이번 달 평가" no longer held
// (already sent → duplicate → submit produced no nav; or no startable eval →
// /coach-form never reached). A fresh per-run student removes that coupling.
test("E2E-E1: Approach-A flow → review → send → share-link", async ({
	browser,
}) => {
	// --- Setup (owner): create a dedicated consent-on student. /students/new
	// is requireRole(['owner','admin']), so this part uses the owner fixture. ---
	const ownerCtx = await browser.newContext({
		storageState: "tests/.auth/owner.json",
	});
	const ownerPage = await ownerCtx.newPage();
	const studentName = `E2E평가학생-${Date.now()}`;
	await ownerPage.goto("/students/new");
	await ownerPage.fill('input[name="name"]', studentName);
	await ownerPage.fill('input[name="year"]', "1년차");
	await ownerPage.click('[role="switch"]'); // 부모 동의서 받음 → consent on
	await ownerPage.click('button[type="submit"]');
	// Wait for the detail page itself (heading = student name), NOT a URL glob:
	// "**/students/*" also matches the /students/new page we're still on, so it
	// would resolve before the post-submit redirect and capture the wrong URL.
	await expect(
		ownerPage.getByRole("heading", { name: studentName }),
	).toBeVisible({ timeout: 10_000 });
	const studentUrl = ownerPage.url();
	await ownerCtx.close();

	// --- The flow under test (coach): start eval → bullet form → AI letter →
	// review → send → parent share-link. Evaluation actions are requireAuth(),
	// so the coach can drive the whole flow on the owner-created student
	// (same academy → visible under RLS). ---
	const coachCtx = await browser.newContext({
		storageState: "tests/.auth/coach.json",
	});
	const page = await coachCtx.newPage();
	try {
		await page.goto(studentUrl);
		// Fresh student + consent + no eval yet → "시작하기 (이번 달 평가)".
		await page.getByRole("button", { name: /^시작하기/ }).click();
		await page.waitForURL("**/coach-form", { timeout: 15_000 });

		// Fill 3 of 5 axes (≥2 required by coachBulletFormSchema). getByLabel
		// targets the textarea without depending on the bracketed bullets.* name.
		await page.getByLabel(/발성/).fill("발성 좋음");
		await page.getByLabel(/표정/).fill("표정 자연스러움");
		await page.getByLabel(/입시 완성도/).fill("본방 70%");
		// These are react-hook-form controlled inputs (shadcn FormField →
		// Controller): DOM value is driven by form state. Wait until each value
		// is reflected back before submitting, otherwise handleSubmit can validate
		// stale state (form invalid → onSubmit never runs → no nav).
		await expect(page.getByLabel(/발성/)).toHaveValue("발성 좋음");
		await expect(page.getByLabel(/표정/)).toHaveValue("표정 자연스러움");
		await expect(page.getByLabel(/입시 완성도/)).toHaveValue("본방 70%");

		// Tie the nav wait to the click so a fast redirect can't fire before the
		// listener attaches. 60s covers real gpt-4o-mini letter generation.
		await Promise.all([
			page.waitForURL("**/review", { timeout: 60_000 }),
			page.getByRole("button", { name: "AI letter 작성 시작" }).click(),
		]);
		await expect(page.locator("textarea")).toBeVisible();

		// Send → parent share-link.
		await page.click("button:has-text('승인 및 공유 링크')");
		await expect(page.locator("text=발송 완료")).toBeVisible({
			timeout: 15_000,
		});
		await expect(
			page.locator("text=/^https?:\\/\\/.*\\/feedback\\//"),
		).toBeVisible();
	} finally {
		await coachCtx.close();
	}
});
