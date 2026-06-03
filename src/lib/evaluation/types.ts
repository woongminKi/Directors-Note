// Evaluation pipeline 타입 — evaluation-interface-v1.md §2 참조

export interface VideoAnalysisRequest {
	evaluationId: string;
	academyId: string;
	studentVideoUrl: string;
	metadata?: {
		durationMs?: number;
		sceneType?: string;
	};
}

export type LetterGenerationInput =
	| {
			type: "ai_analysis";
			analysis: AIAnalysis;
			student: StudentContext;
	  }
	| {
			type: "coach_bullets";
			bullets: CoachBullets;
			student: StudentContext;
	  };

export interface StudentContext {
	studentName: string;
	year: string;
	evaluationDate: string;
}

export interface CoachBullets {
	vocal?: string;
	diction?: string;
	expression?: string;
	movement?: string;
	examReadiness?: string;
	freeNote?: string;
}

export interface AxisScores {
	vocal: number;
	expression: number;
	examReadiness: number;
}

export type PartIndex = 1 | 2 | 3;

export interface ReferenceMatch {
	referenceVideoId: string;
	tier: "A" | "B" | "C" | "D";
	sceneType: string;
	cosineScore: number;
	partIndex?: PartIndex;
}

export interface PartAnalysis {
	partIndex: PartIndex;
	topMatch: ReferenceMatch;
	score: number;
	matches: ReferenceMatch[];
}

export interface AIAnalysis {
	axes: AxisScores;
	internalGrade: "A" | "B" | "C" | "D";
	calibrationMatchScore: number;
	evaluatorUsed: "cosine" | "llm_as_judge";
	cosineConfidence?: number;
	topMatches: ReferenceMatch[];
	perPartAnalysis?: PartAnalysis[];
	rawResponseJson: unknown;
}

// Streaming progress events (SSE) — D7 락
export type ProgressEvent =
	| { step: "frames_extracted"; frameCount: number; durationMs: number }
	| { step: "embedding_generated"; vectorPreview: number[] }
	| { step: "matches_computed"; matches: ReferenceMatch[] }
	| { step: "letter_drafting" }
	| { step: "complete"; analysis: AIAnalysis; letterDraft: string }
	| { step: "error"; message: string; degradeTo?: "approach_a" };

// Service interfaces
export interface VideoAnalysisService {
	analyzeStreaming(
		req: VideoAnalysisRequest,
		onProgress: (event: ProgressEvent) => void,
	): Promise<AIAnalysis>;
}

export interface LetterGenerationService {
	generateLetter(input: LetterGenerationInput): Promise<string>;
}
