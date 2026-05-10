"use server";
import { and, eq } from "drizzle-orm";
import { requireAuth } from "@/lib/auth/require-auth";
import { db } from "@/lib/db/client";
import { evaluations } from "@/lib/db/schema";
import { env } from "@/lib/env";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export async function createSignedUploadUrl(
	evaluationId: string,
): Promise<
	{ ok: true; signedUrl: string; path: string } | { ok: false; error: string }
> {
	const { academyId } = await requireAuth();
	const evaluation = await db.query.evaluations.findFirst({
		where: and(
			eq(evaluations.id, evaluationId),
			eq(evaluations.academyId, academyId),
		),
	});
	if (!evaluation) return { ok: false, error: "not_found" };

	const path = `${academyId}/${evaluationId}.mp4`;
	const supabase = createServiceRoleClient();
	const { data, error } = await supabase.storage
		.from("student-videos")
		.createSignedUploadUrl(path);

	if (error || !data)
		return { ok: false, error: error?.message ?? "upload_url_failed" };
	return { ok: true, signedUrl: data.signedUrl, path };
}

export async function attachVideoToEvaluation(
	evaluationId: string,
	path: string,
): Promise<{ ok: boolean }> {
	const { academyId } = await requireAuth();
	const url = `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/student-videos/${path}`;
	await db
		.update(evaluations)
		.set({
			videoStorageUrl: url,
			updatedAt: new Date(),
		})
		.where(
			and(
				eq(evaluations.id, evaluationId),
				eq(evaluations.academyId, academyId),
			),
		);
	return { ok: true };
}
