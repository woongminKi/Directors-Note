import type {
	AIAnalysis,
	AxisScores,
	ProgressEvent,
	ReferenceMatch,
	VideoAnalysisRequest,
	VideoAnalysisService,
} from "./types";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * StubVideoAnalysisService — Vertex 게이트 풀리기 전 작동.
 * 결정론적 fake 데이터 (evaluationId hash 기반) → 테스트 reproducible.
 * 실제 API 호출 X — 비용 0.
 */
export class StubVideoAnalysisService implements VideoAnalysisService {
	async analyzeStreaming(
		req: VideoAnalysisRequest,
		onProgress: (event: ProgressEvent) => void,
	): Promise<AIAnalysis> {
		const seed = this.hashSeed(req.evaluationId);

		// 실제 Vertex 호출 latency 흉내 (D7 streaming UI 검증용)
		onProgress({ step: "frames_extracted", frameCount: 30, durationMs: 1800 });
		await sleep(1500);

		onProgress({
			step: "embedding_generated",
			vectorPreview: this.fakeVectorPreview(seed),
		});
		await sleep(2500);

		const matches = this.fakeMatches(seed, req.academyId);
		onProgress({ step: "matches_computed", matches });
		await sleep(500);

		onProgress({ step: "letter_drafting" });
		await sleep(4000);

		const analysis: AIAnalysis = {
			axes: this.fakeAxes(seed),
			internalGrade: this.fakeGrade(seed),
			calibrationMatchScore: matches[0]?.cosineScore ?? 0,
			evaluatorUsed: "cosine",
			cosineConfidence: matches[0]?.cosineScore ?? 0,
			topMatches: matches,
			rawResponseJson: { stub: true, seed },
		};

		onProgress({ step: "complete", analysis, letterDraft: "" });

		return analysis;
	}

	private hashSeed(input: string): number {
		let h = 5381;
		for (let i = 0; i < input.length; i++) {
			h = (h << 5) + h + input.charCodeAt(i);
		}
		return Math.abs(h) % 10000;
	}

	private fakeAxes(seed: number): AxisScores {
		const rand = (offset: number) => 4 + ((seed + offset * 31) % 60) / 10;
		return {
			vocal: rand(1),
			expression: rand(2),
			examReadiness: rand(3),
		};
	}

	private fakeGrade(seed: number): "A" | "B" | "C" | "D" {
		const grades = ["A", "B", "C", "D"] as const;
		return grades[seed % 4];
	}

	private fakeMatches(seed: number, academyId: string): ReferenceMatch[] {
		const tiers = ["A", "B", "C", "D"] as const;
		const sceneTypes = [
			"classical_monologue",
			"modern_monologue",
			"improv",
		] as const;
		// UUID-shaped fake IDs (RFC4122 v4 형식 준수)
		const baseHex = (n: number) =>
			((n * 0xdeadbeef) >>> 0).toString(16).padStart(8, "0");
		const fakeUuid = (i: number) =>
			`${baseHex(seed + i)}-0000-4000-8000-000000000${(seed + i)
				.toString(16)
				.padStart(3, "0")
				.slice(-3)}`;
		return [0, 1, 2].map((i) => ({
			referenceVideoId: fakeUuid(i + Math.abs(this.hashAcademy(academyId))),
			tier: tiers[(seed + i) % 4],
			sceneType: sceneTypes[i % 3],
			cosineScore: Math.max(
				0,
				Math.min(1, 0.95 - i * 0.07 - (seed % 5) * 0.01),
			),
		}));
	}

	private hashAcademy(academyId: string): number {
		let h = 0;
		for (let i = 0; i < academyId.length; i++) {
			h = (h * 31 + academyId.charCodeAt(i)) | 0;
		}
		return h;
	}

	private fakeVectorPreview(seed: number): number[] {
		return Array.from({ length: 10 }, (_, i) =>
			Number(Math.sin((seed + i * 17) / 100).toFixed(4)),
		);
	}
}
