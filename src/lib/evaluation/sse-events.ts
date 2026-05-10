import { z } from "zod";

const referenceMatchSchema = z.object({
	referenceVideoId: z.string().uuid(),
	tier: z.enum(["A", "B", "C", "D"]),
	sceneType: z.string(),
	cosineScore: z.number().min(0).max(1),
});

const axisScoresSchema = z.object({
	vocal: z.number().min(0).max(10),
	expression: z.number().min(0).max(10),
	examReadiness: z.number().min(0).max(10),
});

const aiAnalysisSchema = z.object({
	axes: axisScoresSchema,
	internalGrade: z.enum(["A", "B", "C", "D"]),
	calibrationMatchScore: z.number().min(0).max(1),
	evaluatorUsed: z.enum(["cosine", "llm_as_judge"]),
	cosineConfidence: z.number().min(0).max(1).optional(),
	topMatches: z.array(referenceMatchSchema).max(5),
	rawResponseJson: z.unknown(),
});

export const progressEventSchema = z.discriminatedUnion("step", [
	z.object({
		step: z.literal("frames_extracted"),
		frameCount: z.number().int().positive(),
		durationMs: z.number().nonnegative(),
	}),
	z.object({
		step: z.literal("embedding_generated"),
		vectorPreview: z.array(z.number()),
	}),
	z.object({
		step: z.literal("matches_computed"),
		matches: z.array(referenceMatchSchema),
	}),
	z.object({ step: z.literal("letter_drafting") }),
	z.object({
		step: z.literal("complete"),
		analysis: aiAnalysisSchema,
		letterDraft: z.string(),
	}),
	z.object({
		step: z.literal("error"),
		message: z.string(),
		degradeTo: z.literal("approach_a").optional(),
	}),
]);

export type ProgressEventValidated = z.infer<typeof progressEventSchema>;
