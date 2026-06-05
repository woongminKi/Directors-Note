import type {
	NotificationChannel,
	NotificationRow,
	SendResult,
} from "@/lib/notifications/types";

// 후속 사이클 stub — 카카오 비즈채널·대행사·템플릿 심사 완료 전까지 미발송.
export class AlimTalkChannel implements NotificationChannel {
	async send(_n: NotificationRow): Promise<SendResult> {
		return { ok: false, error: "alimtalk_not_configured", retryable: false };
	}
}
