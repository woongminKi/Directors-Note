import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { evaluations } from "@/lib/db/schema";

export async function getEvaluation(academyId: string, id: string) {
	return db.query.evaluations.findFirst({
		where: and(eq(evaluations.id, id), eq(evaluations.academyId, academyId)),
		with: { student: true, feedbackDraft: true, aiAnalysis: true },
	});
}
