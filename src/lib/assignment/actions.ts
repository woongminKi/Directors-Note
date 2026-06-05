"use server";
// WS4 — 라우팅/배정 서버액션.
//
// 라우팅은 시스템 동작(소비자/평가자 행위가 아님)이므로 service-role 로 RLS 를
// 우회해 실행한다 (upload-action.ts 의 createServiceRoleClient 패턴 — 단, 여기서는
// Drizzle 트랜잭션의 원자성이 필요해 postgres-js 직결 `db` 를 쓴다. service-role
// 키와 동일하게 RLS 를 통과하는 DATABASE_URL 직결이며, assignments 는 명세 WS2.3 상
// service-role-only 라 RLS 정책상으로도 시스템 핸들러만 접근한다).
//
// 원자적 claim 은 **새 마이그레이션 없이** 기존 부분 유니크 인덱스
// `uq_active_primary_assignment` (status='assigned' AND is_redundant_label=false)
// 에 의존한다 (0014). insert(...).onConflictDoNothing 로 동일 제출에 대한 동시
// primary 배정 중 1개만 성공 → 패자는 다음 평가자로 재시도. SECURITY DEFINER
// claim_assignment() SQL 함수는 불필요 (no-migration 경로).

import { and, eq, inArray, lt, sql } from "drizzle-orm";
import {
	ASSIGNMENT_SLA_HOURS,
	REDUNDANT_LABEL_RATE,
} from "@/lib/assignment/constants";
import {
	type EvaluatorCandidate,
	type OpenAssignmentCounts,
	selectEvaluator,
	shouldCreateRedundantLabel,
} from "@/lib/assignment/select-evaluator";
import { db } from "@/lib/db/client";
import { evaluationAssignments, submissions, users } from "@/lib/db/schema";
import { notify } from "@/lib/notifications/actions";

export type AssignResult =
	| {
			ok: true;
			assigned: true;
			evaluatorId: string;
			redundantEvaluatorId?: string;
	  }
	| {
			ok: true;
			assigned: false;
			reason: "no_eligible_evaluator" | "not_queued";
	  }
	| { ok: false; error: string };

const dueAtFrom = (now: Date, slaHours = ASSIGNMENT_SLA_HOURS): Date =>
	new Date(now.getTime() + slaHours * 60 * 60 * 1000);

// 자격 평가자 풀 + 각자의 오픈(status='assigned') 배정 수를 조회한다.
// 풀: role='evaluator' AND evaluator_status='active' AND onboarded_at IS NOT NULL.
async function loadEligiblePool(conn: typeof db): Promise<{
	candidates: EvaluatorCandidate[];
	openCounts: OpenAssignmentCounts;
}> {
	const rows = await conn
		.select({ id: users.id, onboardedAt: users.onboardedAt })
		.from(users)
		.where(
			and(
				eq(users.role, "evaluator"),
				eq(users.evaluatorStatus, "active"),
				sql`${users.onboardedAt} IS NOT NULL`,
			),
		);

	const candidates: EvaluatorCandidate[] = rows.map((r) => ({
		evaluatorId: r.id,
		onboardedAt: r.onboardedAt,
	}));

	const openCounts: OpenAssignmentCounts = {};
	if (candidates.length > 0) {
		const ids = candidates.map((c) => c.evaluatorId);
		const counts = await conn
			.select({
				evaluatorId: evaluationAssignments.evaluatorUserId,
				n: sql<number>`count(*)::int`,
			})
			.from(evaluationAssignments)
			.where(
				and(
					inArray(evaluationAssignments.evaluatorUserId, ids),
					eq(evaluationAssignments.status, "assigned"),
				),
			)
			.groupBy(evaluationAssignments.evaluatorUserId);
		for (const c of counts) openCounts[c.evaluatorId] = c.n;
	}

	return { candidates, openCounts };
}

/**
 * 원자적 primary claim: 한 트랜잭션 안에서
 *   (1) status='assigned', is_redundant_label=false 배정을 onConflictDoNothing 로 insert
 *       — 충돌 타깃은 부분 유니크 `uq_active_primary_assignment` (submission_id WHERE ...).
 *   (2) insert 성공 시에만 submissions.status queued→assigned 로 갱신.
 * insert 가 0행이면 (다른 워커가 동시에 이김) false → 호출부가 다음 평가자 재시도.
 *
 * race-safety 는 전적으로 `uq_active_primary_assignment` 부분 유니크 인덱스에 의존한다.
 */
async function tryClaimPrimary(
	conn: typeof db,
	submissionId: string,
	evaluatorId: string,
	dueAt: Date,
): Promise<boolean> {
	return conn.transaction(async (tx) => {
		const inserted = await tx
			.insert(evaluationAssignments)
			.values({
				submissionId,
				evaluatorUserId: evaluatorId,
				dueAt,
				status: "assigned",
				isRedundantLabel: false,
			})
			.onConflictDoNothing({
				// 부분 유니크 인덱스 `uq_active_primary_assignment` 를 타깃.
				// Drizzle 은 `ON CONFLICT (submission_id) WHERE <where> DO NOTHING` 을
				// 생성하므로 where 가 곧 부분 인덱스 술어와 일치해야 한다.
				// (submission_id) WHERE status='assigned' AND is_redundant_label=false.
				target: evaluationAssignments.submissionId,
				where: sql`status = 'assigned' AND is_redundant_label = false`,
			})
			.returning({ id: evaluationAssignments.id });

		if (!inserted[0]) return false; // 다른 워커가 이미 활성 primary 를 claim.

		// queued 인 동안에만 assigned 로 전이 (멱등/안전).
		await tx
			.update(submissions)
			.set({ status: "assigned", updatedAt: new Date() })
			.where(
				and(eq(submissions.id, submissionId), eq(submissions.status, "queued")),
			);

		return true;
	});
}

// 이중라벨(QA) 2차 배정 — primary 와 다른 평가자에게 is_redundant_label=true 로 insert.
// primary 를 막지 않으며 실패해도 무시(best-effort). 부분 유니크 대상이 아니라
// (submission_id, evaluator_user_id) 유니크만 적용되므로 onConflictDoNothing 으로 안전.
async function tryCreateRedundant(
	conn: typeof db,
	submissionId: string,
	evaluatorId: string,
	dueAt: Date,
): Promise<boolean> {
	const inserted = await conn
		.insert(evaluationAssignments)
		.values({
			submissionId,
			evaluatorUserId: evaluatorId,
			dueAt,
			status: "assigned",
			isRedundantLabel: true,
		})
		.onConflictDoNothing({
			target: [
				evaluationAssignments.submissionId,
				evaluationAssignments.evaluatorUserId,
			],
		})
		.returning({ id: evaluationAssignments.id });
	return Boolean(inserted[0]);
}

/**
 * queued 제출 1건을 자격 평가자에게 배정한다.
 * @param submissionId 대상 제출
 * @param rng          이중라벨 샘플링용 난수 (테스트 주입). 기본 Math.random.
 */
export async function assignSubmission(
	submissionId: string,
	rng: () => number = Math.random,
	excludeEvaluators: ReadonlySet<string> = new Set(),
): Promise<AssignResult> {
	try {
		// 현재 queued 인지 확인 (이미 배정/채점/공개된 건 건너뜀).
		const submission = await db.query.submissions.findFirst({
			where: and(
				eq(submissions.id, submissionId),
				eq(submissions.status, "queued"),
			),
			columns: { id: true },
		});
		if (!submission) return { ok: true, assigned: false, reason: "not_queued" };

		const now = new Date();
		const dueAt = dueAtFrom(now);
		const { candidates, openCounts } = await loadEligiblePool(db);

		// 오픈 배정 최소 평가자부터 시도. claim 충돌(동시 워커 승리) 시 그 평가자를
		// 제외하고 다음 후보로 재시도 — 부분 유니크가 활성 primary 1개를 보장.
		// excludeEvaluators: 재배정 시 타임아웃 평가자 등 호출부가 미리 제외할 대상.
		const tried = new Set<string>(excludeEvaluators);
		while (true) {
			const evaluatorId = selectEvaluator(candidates, openCounts, tried);
			if (!evaluatorId) {
				// 자격 평가자 없음(또는 모두 시도해 실패) → queued 유지, sweep 이 픽업.
				return { ok: true, assigned: false, reason: "no_eligible_evaluator" };
			}
			tried.add(evaluatorId);

			const claimed = await tryClaimPrimary(
				db,
				submissionId,
				evaluatorId,
				dueAt,
			);
			if (!claimed) continue; // 다음 후보 재시도.

			// primary 배정 확정 → 평가자에게 알림(redundant 라벨은 알림 없음).
			await notify({
				userId: evaluatorId,
				type: "evaluator_assigned",
				submissionId,
			});

			// primary 확보. 이중라벨(QA) 샘플링 — 다른 평가자에게 비차단 2차 배정.
			let redundantEvaluatorId: string | undefined;
			if (shouldCreateRedundantLabel(REDUNDANT_LABEL_RATE, rng)) {
				const exclude = new Set([evaluatorId, ...excludeEvaluators]);
				const second = selectEvaluator(candidates, openCounts, exclude);
				if (second) {
					const ok = await tryCreateRedundant(db, submissionId, second, dueAt);
					if (ok) redundantEvaluatorId = second;
				}
			}

			return redundantEvaluatorId
				? { ok: true, assigned: true, evaluatorId, redundantEvaluatorId }
				: { ok: true, assigned: true, evaluatorId };
		}
	} catch (e) {
		return {
			ok: false,
			error: e instanceof Error ? e.message : "assign_failed",
		};
	}
}

// ── Sweeps (admin/manually-invokable; cron 배선은 Phase A 보류) ─────────────

export type SweepResult =
	| { ok: true; processed: number; assigned: number }
	| { ok: false; error: string };

/**
 * assignQueued — enqueue 시점에 자격 평가자가 없어 queued 로 남은 제출들을 일괄 배정.
 * cron 미배선; admin 수동 호출. (명세 WS4: Phase A 수동/admin sweep 으로 시작 가능.)
 */
export async function assignQueued(
	rng: () => number = Math.random,
): Promise<SweepResult> {
	try {
		const queued = await db
			.select({ id: submissions.id })
			.from(submissions)
			.where(eq(submissions.status, "queued"));

		let assigned = 0;
		for (const s of queued) {
			const r = await assignSubmission(s.id, rng);
			if (r.ok && r.assigned) assigned += 1;
		}
		return { ok: true, processed: queued.length, assigned };
	} catch (e) {
		return {
			ok: false,
			error: e instanceof Error ? e.message : "sweep_failed",
		};
	}
}

/**
 * expireOverdueAssignments — status='assigned' AND due_at < now() 인 배정을 'expired'
 * 로 표시하고, primary(비-redundant) 였다면 제출을 queued 로 되돌린 뒤 타임아웃
 * 평가자를 제외하고 재배정한다. cron 미배선; admin 수동 호출.
 */
export async function expireOverdueAssignments(
	rng: () => number = Math.random,
): Promise<SweepResult> {
	try {
		const now = new Date();
		const overdue = await db
			.select({
				id: evaluationAssignments.id,
				submissionId: evaluationAssignments.submissionId,
				evaluatorUserId: evaluationAssignments.evaluatorUserId,
				isRedundantLabel: evaluationAssignments.isRedundantLabel,
			})
			.from(evaluationAssignments)
			.where(
				and(
					eq(evaluationAssignments.status, "assigned"),
					lt(evaluationAssignments.dueAt, now),
				),
			);

		let reassigned = 0;
		for (const a of overdue) {
			// 1) 만료 표시 (부분 유니크에서 빠지므로 같은 제출 재배정 가능).
			await db
				.update(evaluationAssignments)
				.set({ status: "expired" })
				.where(eq(evaluationAssignments.id, a.id));

			// redundant(이중라벨) 만료는 비차단 — primary 가 살아있으면 재배정 불필요.
			if (a.isRedundantLabel) continue;

			// 2) primary 만료 → 제출을 queued 로 되돌린 뒤(assigned 인 경우만) 재배정.
			await db
				.update(submissions)
				.set({ status: "queued", updatedAt: new Date() })
				.where(
					and(
						eq(submissions.id, a.submissionId),
						eq(submissions.status, "assigned"),
					),
				);

			// 3) 타임아웃 평가자를 명시적으로 제외하고 재배정. assignSubmission 은
			//    queued 만 처리하므로 위에서 되돌린 제출이 대상이 된다. 만료 평가자를
			//    exclude 로 넘기지 않으면 그의 오픈 배정이 줄어 다시 선택될 수 있고,
			//    expired 행이 남아 (submission,evaluator) 유니크로 claim 이 에러난다.
			const r = await assignSubmission(
				a.submissionId,
				rng,
				new Set([a.evaluatorUserId]),
			);
			if (r.ok && r.assigned) reassigned += 1;
		}

		return { ok: true, processed: overdue.length, assigned: reassigned };
	} catch (e) {
		return {
			ok: false,
			error: e instanceof Error ? e.message : "sweep_failed",
		};
	}
}
