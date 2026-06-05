import { eq } from "drizzle-orm";
import webpush from "web-push";
import { db } from "@/lib/db/client";
import { pushSubscriptions } from "@/lib/db/schema";
import { env } from "@/lib/env";
import type {
	NotificationChannel,
	NotificationRow,
	SendResult,
} from "@/lib/notifications/types";

export class WebPushChannel implements NotificationChannel {
	constructor() {
		webpush.setVapidDetails(
			env.VAPID_SUBJECT ?? "mailto:admin@directorsnote.app",
			env.VAPID_PUBLIC_KEY ?? "",
			env.VAPID_PRIVATE_KEY ?? "",
		);
	}

	async send(n: NotificationRow): Promise<SendResult> {
		const subs = await db
			.select()
			.from(pushSubscriptions)
			.where(eq(pushSubscriptions.userId, n.userId));
		if (subs.length === 0)
			return { ok: false, error: "no_subscription", retryable: false };

		const payload = JSON.stringify({
			title: n.title,
			body: n.body,
			url: n.url,
		});
		let anyOk = false;
		let lastErr = "";
		for (const s of subs) {
			try {
				await webpush.sendNotification(
					{ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
					payload,
				);
				anyOk = true;
			} catch (e) {
				const statusCode = (e as { statusCode?: number }).statusCode;
				if (statusCode === 404 || statusCode === 410) {
					// 죽은 구독 — 삭제(재시도 무의미).
					await db
						.delete(pushSubscriptions)
						.where(eq(pushSubscriptions.id, s.id));
				} else {
					lastErr = e instanceof Error ? e.message : "send_failed";
				}
			}
		}
		if (anyOk) return { ok: true };
		return {
			ok: false,
			error: lastErr || "all_subscriptions_dead",
			retryable: lastErr !== "",
		};
	}
}
