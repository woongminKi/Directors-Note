import type { QueueRow } from "@/app/(coach)/dashboard/components/queue-card";
import type { EvaluatorQueueItem } from "@/lib/assignment/evaluator-queue";

const DUE_FORMATTER = new Intl.DateTimeFormat("ko-KR", {
	timeZone: "Asia/Seoul",
	month: "2-digit",
	day: "2-digit",
	hour: "2-digit",
	minute: "2-digit",
});

// WS5.3 — 평가자 큐 row. 신원 정보(학생 이름) 미노출 — 중립 라벨만:
//   제목 = submission id 앞 8자 + sceneType, 보조 = 마감 시각.
//   redundant(이중라벨) 배정은 'QA' 배지로 구분.
export function evaluatorQueueToRow(item: EvaluatorQueueItem): QueueRow {
	const shortId = item.submissionId.slice(0, 8);
	return {
		id: item.assignmentId,
		studentName: `#${shortId} · ${item.sceneType}`,
		year: `마감 ${DUE_FORMATTER.format(item.dueAt)}`,
		href: `/score/${item.submissionId}`,
		metaLabel: item.isRedundantLabel ? "QA" : undefined,
	};
}
