"use server";

import type { QueueRow } from "@/app/(coach)/dashboard/components/queue-card";
import { getEvaluatorOpenAssignments } from "@/lib/assignment/evaluator-queue";
import { requireEvaluator } from "@/lib/auth/require-evaluator";
import { evaluatorQueueToRow } from "./row-mapper";

// WS5.3 — 평가자 큐 폴링 fetcher (QueueCard 재사용). 본인 배정만 조회.
export async function fetchEvaluatorQueueRows(): Promise<QueueRow[]> {
	const user = await requireEvaluator();
	const items = await getEvaluatorOpenAssignments(user.appUser.id);
	return items.map(evaluatorQueueToRow);
}
