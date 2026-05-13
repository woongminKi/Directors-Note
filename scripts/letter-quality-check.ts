/**
 * Letter quality spot-check — feed 5 sample coach-bullet inputs through
 * gpt-4o-mini and dump the resulting letters for eyeball review of:
 *   - Korean tone B (따뜻한 정중체)
 *   - prompt v2 rules (no prohibited terms, ≤350 chars, starts with greeting)
 *   - register consistency across different student profiles
 *
 * Used while OAuth handoff blocks UI dogfooding. Catches letter-generation
 * issues before friend onboarding.
 *
 * Run: bun run letter-quality-check
 */

import { GPT4oMiniLetterService } from "../src/lib/evaluation/gpt-4o-mini-letter";
import { validateLetter } from "../src/lib/evaluations/validate-letter";
import type { CoachBullets } from "../src/lib/evaluation/types";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
if (!OPENAI_API_KEY) {
	console.error("Missing OPENAI_API_KEY in env.");
	process.exit(1);
}

interface Sample {
	id: string;
	label: string; // human-readable scenario
	student: { studentName: string; year: string; evaluationDate: string };
	bullets: CoachBullets;
}

const SAMPLES: Sample[] = [
	{
		id: "S1",
		label: "1년차 안정적 성장 — 발성+표현 둘 다 양호",
		student: {
			studentName: "김민지",
			year: "1년차",
			evaluationDate: "2026-05-14",
		},
		bullets: {
			vocal: "복부 호흡 안정, 고음 구간 떨림 약간",
			expression: "독백 도입부 감정 빌드업 자연스러움",
			examReadiness: "현재 페이스 유지 시 7월 모의 안정권",
		},
	},
	{
		id: "S2",
		label: "재수생 정체 구간 — 발성은 좋지만 표현 보완 필요",
		student: {
			studentName: "박지우",
			year: "재수생",
			evaluationDate: "2026-05-14",
		},
		bullets: {
			vocal: "딕션 또렷, 호흡 분배 안정",
			expression: "감정의 진폭이 좁아짐, 클라이맥스 직전 톤 단조로움",
			diction: "자음 명확",
			examReadiness: "현 상태로는 본방 70%, 표현 폭 넓혀야 80% 도달",
		},
	},
	{
		id: "S3",
		label: "2년차 기복 — 일부 보완 + 격려 톤 필요",
		student: {
			studentName: "정하은",
			year: "2년차",
			evaluationDate: "2026-05-14",
		},
		bullets: {
			vocal: "호흡 지지 약함, 긴 호흡 구간에서 흔들림",
			expression: "감정 진정성 좋음, 청중 시선 처리 자연스러움",
			movement: "무대 동선 가벼움, 의도 전달 일관됨",
			freeNote: "지난 평가 대비 호흡 부분 살짝 후퇴, 컨디션 영향 가능성",
		},
	},
	{
		id: "S4",
		label: "1년차 기초 다지기 — 격려 위주 + 구체 다음 단계",
		student: {
			studentName: "최도윤",
			year: "1년차",
			evaluationDate: "2026-05-14",
		},
		bullets: {
			vocal: "기초 발성 다지는 중, 음정 흔들림 잦음",
			expression: "감정 표현 시도 적극적, 진정성 보임",
			examReadiness: "기초 단계, 매주 일관된 연습 필요",
		},
	},
	{
		id: "S5",
		label: "재수생 본방 직전 — 압축적 평가 + 강한 마무리",
		student: {
			studentName: "이서준",
			year: "재수생",
			evaluationDate: "2026-05-14",
		},
		bullets: {
			vocal: "본방 수준 안정 발성",
			diction: "또렷, 감정 실린 발화",
			expression: "독백 흐름 자연스러움, 절제와 폭발 균형 좋음",
			movement: "무대 사용 자신감 있음",
			examReadiness: "본방 가능 수준",
			freeNote: "지난 6개월 성장 가시적, 본 입시 자신감 부여 단계",
		},
	},
];

function charCount(text: string): number {
	return [...text.trim()].filter((c) => c.trim().length > 0).length;
}

async function main() {
	const service = new GPT4oMiniLetterService(OPENAI_API_KEY!);

	console.log("=== letter-quality-check ===");
	console.log(`Model: gpt-4o-mini`);
	console.log(`Samples: ${SAMPLES.length}`);
	console.log("");

	let totalPassed = 0;
	let totalFailed = 0;
	const results: Array<{
		id: string;
		ok: boolean;
		error?: string;
		text?: string;
		chars?: number;
	}> = [];

	for (const s of SAMPLES) {
		console.log(`─── ${s.id}: ${s.label} ───`);
		console.log(`Student: ${s.student.studentName} (${s.student.year})`);
		const bulletsList = Object.entries(s.bullets)
			.filter(([_, v]) => v)
			.map(([k, v]) => `  ${k}: ${v}`)
			.join("\n");
		console.log(`Bullets:\n${bulletsList}`);
		console.log("");

		const start = Date.now();
		try {
			const text = await service.generateLetter({
				type: "coach_bullets",
				bullets: s.bullets,
				student: s.student,
			});
			const elapsed = Date.now() - start;
			const chars = charCount(text);
			const v = validateLetter(text);
			console.log(`Letter (${chars}자, ${elapsed}ms, validate: ${v.ok ? "PASS" : `FAIL — ${v.error}`}):`);
			console.log(text);
			console.log("");
			results.push({ id: s.id, ok: v.ok, text, chars });
			if (v.ok) totalPassed++;
			else totalFailed++;
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			console.log(`✗ FAILED: ${msg}\n`);
			results.push({ id: s.id, ok: false, error: msg });
			totalFailed++;
		}
	}

	console.log("=== Summary ===");
	console.log(`Pass: ${totalPassed} / ${SAMPLES.length}`);
	console.log(`Fail: ${totalFailed} / ${SAMPLES.length}`);
	if (totalFailed > 0) {
		console.log("\nFailures:");
		for (const r of results.filter((x) => !x.ok)) {
			console.log(`  ${r.id}: ${r.error ?? "validation failed"}`);
		}
		process.exit(1);
	}
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
