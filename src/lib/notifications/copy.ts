import type { NotificationType } from "@/lib/notifications/types";

export type NotificationContent = { title: string; body: string; url: string };

// P2 하드게이트: 점수/등급 등 평가 내용은 절대 포함하지 않는다.
export function buildNotificationContent(
	type: NotificationType,
	submissionId: string,
): NotificationContent {
	switch (type) {
		case "submission_released":
			return {
				title: "결과가 준비됐어요",
				body: "확인해 보세요",
				url: `/submissions/${submissionId}`,
			};
		case "submission_scored":
			return {
				title: "채점이 끝났어요",
				body: "결제 후 결과가 공개됩니다",
				url: `/submissions/${submissionId}`,
			};
		case "evaluator_assigned":
			return {
				title: "새 채점 배정",
				body: "48시간 내에 채점해 주세요",
				url: `/score/${submissionId}`,
			};
	}
}
