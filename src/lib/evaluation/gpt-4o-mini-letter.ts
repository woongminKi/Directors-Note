import { SYSTEM_PROMPT_V2 } from "./prompts/parent-letter-v2";
import type {
	AIAnalysis,
	AxisScores,
	LetterGenerationInput,
	LetterGenerationService,
	ReferenceMatch,
} from "./types";
import { validateLetter } from "@/lib/korean-letter";

interface ChatCompletionResponse {
	choices?: Array<{ message?: { content?: string } }>;
	error?: { message?: string };
}

/**
 * GPT-4o-mini 직접 fetch — SDK 미사용.
 * v1 baseline 모델. 재시도 1회. 검증 실패 시 throw.
 */
export class GPT4oMiniLetterService implements LetterGenerationService {
	constructor(
		private readonly apiKey: string,
		private readonly model: string = "gpt-4o-mini",
	) {}

	async generateLetter(input: LetterGenerationInput): Promise<string> {
		let lastReason = "unknown";
		for (let attempt = 1; attempt <= 2; attempt++) {
			const userPrompt = this.buildUserPrompt(input, lastReason);
			const text = await this.callOpenAI(userPrompt);
			const v = validateLetter(text);
			if (v.ok) return v.text;
			lastReason = v.reason;
			if (attempt === 2) {
				throw new Error(`letter validation failed twice: ${v.reason}`);
			}
		}
		throw new Error("unreachable");
	}

	private async callOpenAI(userPrompt: string): Promise<string> {
		const response = await fetch(
			"https://api.openai.com/v1/chat/completions",
			{
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${this.apiKey}`,
				},
				body: JSON.stringify({
					model: this.model,
					messages: [
						{ role: "system", content: SYSTEM_PROMPT_V2 },
						{ role: "user", content: userPrompt },
					],
					max_tokens: 600,
					temperature: 0.7,
				}),
			},
		);

		if (!response.ok) {
			throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`);
		}

		const data = (await response.json()) as ChatCompletionResponse;
		if (data.error) {
			throw new Error(`OpenAI error: ${data.error.message ?? "unknown"}`);
		}
		const text = data.choices?.[0]?.message?.content;
		if (!text) throw new Error("OpenAI empty response");
		return text;
	}

	private buildUserPrompt(
		input: LetterGenerationInput,
		retryHint: string,
	): string {
		const retryNote =
			retryHint !== "unknown"
				? `\n\n주의: 직전 시도 실패 사유: ${retryHint}. 이번엔 반드시 규칙을 모두 지키세요.`
				: "";

		if (input.type === "ai_analysis") {
			const { analysis, student } = input;
			const notes = this.deriveNotesFromAxes(analysis);
			return `다음 평가 정보를 바탕으로 학부모 letter 를 작성해 주세요.

학생: ${student.studentName}
구분: ${student.year}
평가: ${student.evaluationDate}

코치 관찰 사항:
${notes.map((n) => `- ${n}`).join("\n")}

내부 등급 (letter 에 노출 금지): ${analysis.internalGrade}
요약 힌트: ${this.summaryHintForGrade(analysis.internalGrade)}

오직 letter 본문만 출력하세요.${retryNote}`;
		}

		const { bullets, student } = input;
		const notes = [
			bullets.vocal && `발성: ${bullets.vocal}`,
			bullets.diction && `발음: ${bullets.diction}`,
			bullets.expression && `표정: ${bullets.expression}`,
			bullets.movement && `움직임: ${bullets.movement}`,
			bullets.examReadiness && `입시 완성도: ${bullets.examReadiness}`,
			bullets.freeNote && `추가: ${bullets.freeNote}`,
		].filter(Boolean) as string[];

		return `다음 코치 메모를 바탕으로 학부모 letter 를 작성해 주세요.

학생: ${student.studentName}
구분: ${student.year}
평가: ${student.evaluationDate}

코치 관찰 사항:
${notes.map((n) => `- ${n}`).join("\n")}

오직 letter 본문만 출력하세요.${retryNote}`;
	}

	private deriveNotesFromAxes(analysis: AIAnalysis): string[] {
		const { axes, topMatches } = analysis;
		const notes: string[] = [];
		notes.push(...this.notesForAxis("발성", axes.vocal));
		notes.push(...this.notesForAxis("표정", axes.expression));
		notes.push(...this.notesForAxis("입시 완성도", axes.examReadiness));
		const top = topMatches[0];
		if (top) {
			notes.push(`기존 ${top.tier}-tier 시연과 비슷한 수준`);
		}
		return notes;
	}

	private notesForAxis(label: string, score: number): string[] {
		if (score >= 7.5) return [`${label} 안정적`];
		if (score >= 5.5) return [`${label} 양호`];
		if (score >= 4) return [`${label} 보완 권장`];
		return [`${label} 기초 다지기 필요`];
	}

	private summaryHintForGrade(g: "A" | "B" | "C" | "D"): string {
		return {
			A: "입시 본방 가능 수준",
			B: "안정적 발전 흐름, 본방 대비 70-80%",
			C: "기초 향상 시작, 본방 대비 50-60%",
			D: "기초 단계, 격려 + 구체 보완점",
		}[g];
	}
}

export function _testHelpers() {
	return { validateAxis: (a: AxisScores) => a, sample: null as ReferenceMatch | null };
}
