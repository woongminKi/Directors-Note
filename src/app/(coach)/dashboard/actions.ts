"use server";

import type { QueueRow } from "@/app/(coach)/dashboard/components/queue-card";
import { requireAuth } from "@/lib/auth/require-auth";
import {
	type CoachProgress,
	type EscalationData,
	getEscalationData,
	getEvaluationTodo,
	getOwnerCoachProgress,
	getReviewPending,
	getSentRecent,
	type SentItem,
} from "@/lib/dashboard/queries";
import {
	evalTodoToRow,
	reviewPendingToRow,
	sentToRow,
} from "@/lib/dashboard/row-mappers";

export async function fetchEvalTodoRows(): Promise<QueueRow[]> {
	const user = await requireAuth();
	const items = await getEvaluationTodo(user.academyId, user.appUser.id);
	return items.map(evalTodoToRow);
}

export async function fetchReviewPendingRows(): Promise<QueueRow[]> {
	const user = await requireAuth();
	const items = await getReviewPending(user.academyId, user.appUser.id);
	return items.map(reviewPendingToRow);
}

export async function fetchSentRows(): Promise<QueueRow[]> {
	const user = await requireAuth();
	const items = await getSentRecent(user.academyId, user.appUser.id);
	return items.map(sentToRow);
}

export async function fetchSentItems(): Promise<SentItem[]> {
	const user = await requireAuth();
	return getSentRecent(user.academyId, user.appUser.id);
}

export async function fetchCoachProgress(): Promise<CoachProgress[]> {
	const user = await requireAuth();
	if (user.role !== "owner" && user.role !== "admin") {
		throw new Error("forbidden");
	}
	return getOwnerCoachProgress(user.academyId);
}

export async function fetchEscalation(): Promise<EscalationData> {
	const user = await requireAuth();
	if (user.role !== "owner" && user.role !== "admin") {
		throw new Error("forbidden");
	}
	return getEscalationData(user.academyId);
}
