"use server";
import { and, eq } from "drizzle-orm";
import { requireAuth } from "@/lib/auth/require-auth";
import { db } from "@/lib/db/client";
import { feedbackDrafts } from "@/lib/db/schema";
import { generateRawToken, hashToken } from "@/lib/evaluations/share-link";
import { validateLetter } from "@/lib/evaluations/validate-letter";

export type FinalizeResult =
	| { ok: true; shareUrl: string; expiresAt: Date }
	| { ok: false; error: string };

export async function finalizeAndSend(input: {
	draftId: string;
	editedText: string;
}): Promise<FinalizeResult> {
	const { academyId } = await requireAuth();

	const validation = validateLetter(input.editedText);
	if (!validation.ok) return { ok: false, error: validation.error };

	const pepper = process.env.SHARE_LINK_PEPPER;
	const appUrl = process.env.NEXT_PUBLIC_APP_URL;
	if (!pepper) return { ok: false, error: "missing_pepper" };
	if (!appUrl) return { ok: false, error: "missing_app_url" };

	const rawToken = generateRawToken();
	const tokenHash = hashToken(rawToken, pepper);
	const now = new Date();
	const expiresAt = new Date(now);
	expiresAt.setDate(expiresAt.getDate() + 30);

	await db
		.update(feedbackDrafts)
		.set({
			coachEditedText: input.editedText.trim(),
			status: "sent",
			approvedAt: now,
			sentAt: now,
			shareLinkTokenHash: tokenHash,
			shareLinkExpiresAt: expiresAt,
			updatedAt: now,
		})
		.where(
			and(
				eq(feedbackDrafts.id, input.draftId),
				eq(feedbackDrafts.academyId, academyId),
			),
		);

	return {
		ok: true,
		shareUrl: `${appUrl}/feedback/${rawToken}`,
		expiresAt,
	};
}
