export type NotificationType =
	| "submission_released"
	| "evaluator_assigned"
	| "submission_scored";

export type NotificationChannelName = "web_push" | "alimtalk";

export type NotificationRow = {
	id: string;
	userId: string;
	type: NotificationType;
	channel: NotificationChannelName;
	title: string;
	body: string;
	url: string;
};

export type SendResult =
	| { ok: true }
	| { ok: false; error: string; retryable: boolean };

export interface NotificationChannel {
	send(n: NotificationRow): Promise<SendResult>;
}
