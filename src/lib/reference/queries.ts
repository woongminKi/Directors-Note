import "server-only";
import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { referenceVideos } from "@/lib/db/schema";

// Scoped to the academy (multi-tenant safety — same pattern as listStudents).
export async function listReferenceVideos(academyId: string) {
	return db
		.select({
			id: referenceVideos.id,
			level: referenceVideos.level,
			sceneType: referenceVideos.sceneType,
			techniqueTag: referenceVideos.techniqueTag,
			createdAt: referenceVideos.createdAt,
		})
		.from(referenceVideos)
		.where(eq(referenceVideos.academyId, academyId))
		.orderBy(desc(referenceVideos.createdAt));
}
