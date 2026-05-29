"use server";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/require-role";
import { db } from "@/lib/db/client";
import { referenceVideos } from "@/lib/db/schema";
import { STUDENT_VIDEOS_BUCKET } from "@/lib/evaluations/constants";
import { createReferenceFromStorage } from "@/lib/reference/embed";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

const TIERS = ["A", "B", "C", "D"];

export async function createReferenceUploadUrl(): Promise<
	| { ok: true; signedUrl: string; path: string; referenceId: string }
	| { ok: false; error: string }
> {
	const { academyId } = await requireRole(["owner", "admin"]);
	const referenceId = crypto.randomUUID();
	const path = `${academyId}/reference/${referenceId}.mp4`;
	const supabase = createServiceRoleClient();
	const { data, error } = await supabase.storage
		.from(STUDENT_VIDEOS_BUCKET)
		.createSignedUploadUrl(path);
	if (error || !data)
		return { ok: false, error: error?.message ?? "upload_url_failed" };
	return { ok: true, signedUrl: data.signedUrl, path, referenceId };
}

export async function processReferenceVideo(input: {
	referenceId: string;
	storagePath: string;
	tier: string;
	sceneType: string;
	techniqueTag: string | null;
}): Promise<{ ok: boolean; error?: string }> {
	const { academyId } = await requireRole(["owner", "admin"]);
	if (!TIERS.includes(input.tier)) return { ok: false, error: "invalid_tier" };
	if (!input.sceneType.trim())
		return { ok: false, error: "scene_type_required" };
	try {
		await createReferenceFromStorage({
			academyId,
			referenceId: input.referenceId,
			storagePath: input.storagePath,
			tier: input.tier,
			sceneType: input.sceneType.trim(),
			techniqueTag: input.techniqueTag?.trim() || null,
		});
	} catch (e) {
		return {
			ok: false,
			error: e instanceof Error ? e.message : "process_failed",
		};
	}
	revalidatePath("/reference");
	return { ok: true };
}

export async function deleteReferenceVideo(
	id: string,
): Promise<{ ok: boolean }> {
	const { academyId } = await requireRole(["owner", "admin"]);
	const row = await db.query.referenceVideos.findFirst({
		where: and(
			eq(referenceVideos.id, id),
			eq(referenceVideos.academyId, academyId),
		),
	});
	// embeddings.source_reference_video_id is ON DELETE CASCADE → its row goes too.
	await db
		.delete(referenceVideos)
		.where(
			and(eq(referenceVideos.id, id), eq(referenceVideos.academyId, academyId)),
		);
	if (row?.storageUrl) {
		const supabase = createServiceRoleClient();
		await supabase.storage.from(STUDENT_VIDEOS_BUCKET).remove([row.storageUrl]);
	}
	revalidatePath("/reference");
	return { ok: true };
}
