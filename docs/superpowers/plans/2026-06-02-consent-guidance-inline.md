# 학생 상세 인라인 부모동의 안내 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 학생 상세에서 부모 동의가 기록되지 않은 동안만 "다음 할 일 — 부모 동의서" 인라인 안내를 띄우고, owner/admin이 확인 다이얼로그를 거쳐 동의를 기록하면 안내가 사라지고 평가 시작이 활성화되게 한다.

**Architecture:** 신규 멱등 server action `recordParentConsent`(기존 `students/actions.ts`의 consent stamp 방식 재사용) + 신규 client 컴포넌트 `consent-guidance-card.tsx`(`ArchiveConfirm`의 shadcn Dialog 패턴 재사용)를, 기존 학생 상세 server component(`students/[id]/page.tsx`)에 조건부로 연결한다. 스키마 변경 없음.

**Tech Stack:** Next.js 15 App Router (server actions), React 19 client component, Drizzle ORM, shadcn/ui Dialog, sonner toast, Vitest (mock 기반 integration test), Bun.

**Spec:** `docs/superpowers/specs/2026-06-02-consent-guidance-inline-design.md`

---

## File Structure

- **Modify** `src/lib/students/actions.ts` — `recordParentConsent(id)` server action 추가 (기존 import/`ActionResult` 타입 그대로 사용).
- **Modify** `tests/integration/students/actions.test.ts` — `recordParentConsent` describe 블록 추가.
- **Create** `src/app/(coach)/students/[id]/consent-guidance-card.tsx` — 인라인 안내 카드 + 확인 다이얼로그 client 컴포넌트.
- **Modify** `src/app/(coach)/students/[id]/page.tsx` — `parentConsentOnFileAt` 미기록 시 카드 렌더.

---

## Task 1: `recordParentConsent` server action (TDD)

**Files:**
- Modify: `src/lib/students/actions.ts` (파일 끝, `archiveStudent` 다음에 추가)
- Test: `tests/integration/students/actions.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

`tests/integration/students/actions.test.ts` 상단의 action import 에 `recordParentConsent` 를 추가한다 (기존: `archiveStudent, createStudent, updateStudent`):

```ts
import {
	archiveStudent,
	createStudent,
	recordParentConsent,
	updateStudent,
} from "@/lib/students/actions";
```

파일 끝(마지막 `describe` 다음, 217행 부근)에 새 describe 블록을 추가한다:

```ts
describe("recordParentConsent", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(requireRole).mockResolvedValue(
			// biome-ignore lint/suspicious/noExplicitAny: partial mock
			{ academyId: "acad-1", role: "owner" } as any,
		);
		vi.mocked(db.query.students.findFirst).mockResolvedValue(
			// biome-ignore lint/suspicious/noExplicitAny: partial mock
			{ id: "stu-1", academyId: "acad-1", parentConsentOnFileAt: null } as any,
		);
	});

	it("stamps consent date + current version when not yet on file", async () => {
		const res = await recordParentConsent("stu-1");
		expect(res.ok).toBe(true);
		expect(db.update).toHaveBeenCalled();
		const args = (updateSet.mock.calls as unknown as unknown[][])[0]?.[0] as {
			parentConsentOnFileAt: Date | null;
			parentConsentVersion: string | null;
		};
		expect(args.parentConsentOnFileAt).toBeInstanceOf(Date);
		expect(args.parentConsentVersion).toBe(CURRENT_PARENT_CONSENT_VERSION);
	});

	it("is idempotent no-op when consent already on file", async () => {
		vi.mocked(db.query.students.findFirst).mockResolvedValue(
			// biome-ignore lint/suspicious/noExplicitAny: partial mock
			{
				id: "stu-1",
				academyId: "acad-1",
				parentConsentOnFileAt: new Date("2026-01-01"),
			} as any,
		);
		const res = await recordParentConsent("stu-1");
		expect(res.ok).toBe(true);
		expect(db.update).not.toHaveBeenCalled();
	});

	it("rejects when student not found in academy", async () => {
		vi.mocked(db.query.students.findFirst).mockResolvedValue(undefined);
		const res = await recordParentConsent("stu-missing");
		expect(res.ok).toBe(false);
		if (!res.ok) expect(res.error).toContain("찾을 수 없");
	});

	it("requires owner/admin (requireRole rejection propagates)", async () => {
		vi.mocked(requireRole).mockRejectedValue(new Error("REDIRECT:/students"));
		await expect(recordParentConsent("stu-1")).rejects.toThrow();
	});
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `bun run test:ci -- students/actions`
Expected: FAIL — `recordParentConsent is not a function` / `not exported` (아직 미구현).

- [ ] **Step 3: 최소 구현**

`src/lib/students/actions.ts` 끝(`archiveStudent` 함수 다음)에 추가한다. 필요한 import(`and`, `eq`, `revalidatePath`, `requireRole`, `CURRENT_PARENT_CONSENT_VERSION`, `db`, `students`, `ActionResult`)는 이미 파일 상단에 존재하므로 추가 import 불필요:

```ts
export async function recordParentConsent(id: string): Promise<ActionResult> {
	const { academyId } = await requireRole(["owner", "admin"]);

	const existing = await db.query.students.findFirst({
		where: and(eq(students.id, id), eq(students.academyId, academyId)),
	});
	if (!existing) return { ok: false, error: "학생을 찾을 수 없습니다" };

	// 이미 기록돼 있으면 멱등 no-op (중복 stamp 방지)
	if (existing.parentConsentOnFileAt) return { ok: true };

	await db
		.update(students)
		.set({
			parentConsentOnFileAt: new Date(),
			parentConsentVersion: CURRENT_PARENT_CONSENT_VERSION,
			updatedAt: new Date(),
		})
		.where(and(eq(students.id, id), eq(students.academyId, academyId)));

	revalidatePath("/students");
	revalidatePath(`/students/${id}`);
	return { ok: true };
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `bun run test:ci -- students/actions`
Expected: PASS (recordParentConsent 4개 + 기존 createStudent/updateStudent/archiveStudent 전부).

- [ ] **Step 5: 커밋**

```bash
git add src/lib/students/actions.ts tests/integration/students/actions.test.ts
git commit -m "feat(consent): recordParentConsent server action (idempotent, owner/admin)"
```

---

## Task 2: `consent-guidance-card.tsx` client 컴포넌트

**Files:**
- Create: `src/app/(coach)/students/[id]/consent-guidance-card.tsx`

> 컴포넌트 단위 테스트 하니스(RTL)가 이 프로젝트엔 없으므로, 검증은 typecheck + Task 4 수동 확인으로 한다. Dialog/Button/toast 사용 패턴은 같은 디렉터리 인접의 `../components/archive-confirm.tsx` 와 동일하게 맞춘다.

- [ ] **Step 1: 컴포넌트 작성**

`src/app/(coach)/students/[id]/consent-guidance-card.tsx` 생성:

```tsx
"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { recordParentConsent } from "@/lib/students/actions";

export function ConsentGuidanceCard({
	studentId,
	canRecordConsent,
}: {
	studentId: string;
	canRecordConsent: boolean;
}) {
	const [open, setOpen] = useState(false);
	const [pending, startTransition] = useTransition();
	const router = useRouter();

	const handleConfirm = () =>
		startTransition(async () => {
			const res = await recordParentConsent(studentId);
			if (res.ok) {
				setOpen(false);
				toast.success("부모 동의가 기록되었습니다");
				router.refresh();
			} else {
				toast.error(res.error);
			}
		});

	return (
		<div className="mb-3 rounded-lg border border-amber-300 bg-amber-50 p-3">
			<p className="text-sm font-semibold text-amber-900">
				다음 할 일 — 부모 동의서
			</p>
			<p className="mt-0.5 mb-2 text-xs text-amber-800">
				아직 동의서가 기록되지 않았어요. 부모 동의를 받은 뒤 표시하세요.
			</p>
			<div className="flex items-center gap-3">
				<Link
					href="/parent-consent"
					target="_blank"
					rel="noopener noreferrer"
					className="text-xs text-primary underline"
				>
					동의서 전문 보기
				</Link>
				{canRecordConsent && (
					<Dialog open={open} onOpenChange={setOpen}>
						<DialogTrigger
							render={
								<Button size="sm" className="ml-auto">
									동의 받음으로 표시
								</Button>
							}
						/>
						<DialogContent>
							<DialogHeader>
								<DialogTitle>부모 동의를 받으셨나요?</DialogTitle>
							</DialogHeader>
							<p className="text-sm text-muted-foreground">
								확인 시 동의 완료로 기록되며, 이번 달 평가를 시작할 수 있습니다.
							</p>
							<DialogFooter>
								<Button variant="ghost" onClick={() => setOpen(false)}>
									취소
								</Button>
								<Button disabled={pending} onClick={handleConfirm}>
									확인
								</Button>
							</DialogFooter>
						</DialogContent>
					</Dialog>
				)}
			</div>
		</div>
	);
}
```

- [ ] **Step 2: 타입/린트 확인**

Run: `bun run typecheck && bun run lint`
Expected: PASS (에러 없음). 만약 `Button` 에 `size` prop 이 없다는 타입 에러가 나면 `src/components/ui/button.tsx` 의 variant API 를 확인하고 `size="sm"` 를 지원 형태로 맞춘다(없으면 `className` 으로 대체).

- [ ] **Step 3: 커밋**

```bash
git add "src/app/(coach)/students/[id]/consent-guidance-card.tsx"
git commit -m "feat(consent): inline consent guidance card with confirm dialog"
```

---

## Task 3: 학생 상세 페이지에 연결

**Files:**
- Modify: `src/app/(coach)/students/[id]/page.tsx`

- [ ] **Step 1: import 추가**

`page.tsx` 상단 import 영역, `StartEvaluationButton` import(12행) 바로 아래에 추가:

```tsx
import { ConsentGuidanceCard } from "./consent-guidance-card";
```

- [ ] **Step 2: 카드 조건부 렌더**

`page.tsx` 의 `<StartEvaluationButton .../>` 줄(40행)을 아래로 교체한다(카드를 버튼 바로 위에 삽입). `canEvaluate`/`canManage` 는 이미 19~26행에 정의돼 있으므로 그대로 사용:

```tsx
				{!canEvaluate && (
					<ConsentGuidanceCard
						studentId={student.id}
						canRecordConsent={canManage}
					/>
				)}
				<StartEvaluationButton studentId={student.id} disabled={!canEvaluate} />
```

- [ ] **Step 3: 타입/린트 확인**

Run: `bun run typecheck && bun run lint`
Expected: PASS.

- [ ] **Step 4: 커밋**

```bash
git add "src/app/(coach)/students/[id]/page.tsx"
git commit -m "feat(consent): render consent guidance card on student detail when not on file"
```

---

## Task 4: 전체 검증 (회귀 + 수동)

**Files:** 없음 (검증 전용)

- [ ] **Step 1: 회귀 baseline 통과 확인**

Run: `bun run lint && bun run typecheck && bun run test:ci`
Expected: lint clean, typecheck clean, 테스트 PASS (기존 109 pass / 1 skip + 신규 recordParentConsent 4건).

- [ ] **Step 2: 수동 확인 (owner 계정)**

dev(`bun run dev`, 3000 비었을 때) 또는 prod(`directors-note.vercel.app`)에서 owner 로 로그인 후, 동의 미제출 학생 상세에서 spec §7 수용 기준을 확인:

1. 미동의 학생 상세 → "다음 할 일 — 부모 동의서" 카드 보임 + "평가 시작" 비활성("동의서 필요").
2. `[동의 받음으로 표시]` → 확인 다이얼로그 → `[확인]` → 카드 사라지고 "평가 시작" 활성. (`[동의서 전문 보기]` 는 새 탭으로 `/parent-consent`)
3. 다이얼로그에서 `[취소]` → 변화 없음.
4. 이미 동의된 학생 상세 → 카드 안 보임.
5. (가능 시) coach 계정 → 카드의 안내 문구/전문보기 링크만 보이고 `[동의 받음으로 표시]` 버튼 없음.

- [ ] **Step 3: 최종 커밋(있으면)**

검증 중 수정이 생겼다면 atomic 하게 커밋. 없으면 생략.

---

## Self-Review (작성자 체크 완료)

- **Spec coverage:** §3 동작규칙 1~6 → Task 3(조건부 렌더·버튼 위치) + Task 2(전문보기 링크/기록버튼/다이얼로그/권한분기) + Task 1(stamp/멱등/게이팅). §4 데이터/재사용 → Task 1(기존 컬럼·버전상수·import 재사용). §5 컴포넌트/인터페이스 → Task 1·2. §6 엣지(멱등·권한·academy격리·해제 범위밖) → Task 1 + 테스트. §7 테스트 → Task 1 단위테스트 + Task 4 수동. §8 YAGNI → 계획에 추가 기능 없음.
- **Placeholder scan:** 모든 코드 스텝에 실제 코드 포함, TBD/TODO 없음.
- **Type consistency:** `recordParentConsent(id: string): Promise<ActionResult>` 시그니처가 Task 1 구현·테스트·Task 2 호출(`recordParentConsent(studentId)`)에서 일치. `ConsentGuidanceCard({ studentId, canRecordConsent })` props 가 Task 2 정의·Task 3 호출에서 일치. `ActionResult` 반환 `{ok}` 분기 일치.
