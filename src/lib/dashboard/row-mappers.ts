import type { QueueRow } from "@/app/(coach)/dashboard/components/queue-card";
import type {
	EvalTodoItem,
	ReviewPendingItem,
	SentItem,
} from "@/lib/dashboard/queries";

export function evalTodoToRow(t: EvalTodoItem): QueueRow {
	return {
		id: t.studentId,
		studentName: t.studentName,
		year: t.year,
		href: `/students/${t.studentId}`,
		metaLabel: t.lastGrade ?? undefined,
	};
}

export function reviewPendingToRow(t: ReviewPendingItem): QueueRow {
	return {
		id: t.feedbackDraftId,
		studentName: t.studentName,
		year: t.year,
		href: `/evaluation/${t.evaluationId}/review`,
		metaLabel: t.internalGrade ?? undefined,
	};
}

export function sentToRow(t: SentItem): QueueRow {
	return {
		id: t.feedbackDraftId,
		studentName: t.studentName,
		year: t.year,
		href: `/evaluation/${t.evaluationId}/review`,
		metaLabel: "발송됨",
	};
}
