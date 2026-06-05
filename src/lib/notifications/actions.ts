"use server";

import { and, eq, lt, or, sql } from "drizzle-orm";
import { after } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db/client";
import { notifications, pushSubscriptions } from "@/lib/db/schema";
import { env } from "@/lib/env";
import { buildNotificationContent } from "@/lib/notifications/copy";
import { createNotificationChannel } from "@/lib/notifications/factory";
import type {
	NotificationChannelName,
	NotificationType,
} from "@/lib/notifications/types";

const MAX_ATTEMPTS = 5;

export type EnqueueInput = {
	userId: string;
	type: NotificationType;
	submissionId: string;
	channel?: NotificationChannelName;
};

// 아웃박스에 알림 1건 기록. FEATURE_WEB_PUSH off 면 web_push 는 skip(null).
export async function enqueueNotification(
	input: EnqueueInput,
): Promise<string | null> {
	const channel = input.channel ?? "web_push";
	if (channel === "web_push" && env.FEATURE_WEB_PUSH !== "true") return null;
	const content = buildNotificationContent(input.type, input.submissionId);
	const rows = await db
		.insert(notifications)
		.values({
			userId: input.userId,
			type: input.type,
			channel,
			title: content.title,
			body: content.body,
			url: content.url,
		})
		.returning({ id: notifications.id });
	return rows[0]?.id ?? null;
}

// 단건 발송 시도. 이미 sent 면 멱등 skip. 반환: 발송 성공 여부.
export async function dispatchNotification(id: string): Promise<boolean> {
	const row = await db.query.notifications.findFirst({
		where: eq(notifications.id, id),
	});
	if (!row || row.status === "sent") return false;

	const channel = createNotificationChannel(row.channel);
	const result = await channel.send({
		id: row.id,
		userId: row.userId,
		type: row.type,
		channel: row.channel,
		title: row.title,
		body: row.body,
		url: row.url,
	});

	if (result.ok) {
		await db
			.update(notifications)
			.set({ status: "sent", sentAt: new Date() })
			.where(eq(notifications.id, id));
		return true;
	}
	await db
		.update(notifications)
		.set({
			status: "failed",
			attempts: sql`${notifications.attempts} + 1`,
			lastError: result.error,
		})
		.where(eq(notifications.id, id));
	return false;
}

// cron 재시도: pending + (failed && attempts<MAX) 를 순회 발송.
export async function drainPendingNotifications(): Promise<{
	processed: number;
	sent: number;
}> {
	const rows = await db
		.select({ id: notifications.id })
		.from(notifications)
		.where(
			or(
				eq(notifications.status, "pending"),
				and(
					eq(notifications.status, "failed"),
					lt(notifications.attempts, MAX_ATTEMPTS),
				),
			),
		);
	let sent = 0;
	for (const r of rows) {
		if (await dispatchNotification(r.id)) sent += 1;
	}
	return { processed: rows.length, sent };
}

// 액션 훅에서 호출. enqueue + 응답 후 즉시 발송 시도. 실패해도 호출 액션을 깨지 않음.
export async function notify(input: EnqueueInput): Promise<void> {
	try {
		const id = await enqueueNotification(input);
		if (id) after(() => dispatchNotification(id).catch(() => {}));
	} catch (e) {
		console.error("[notify] enqueue failed", e);
	}
}

// 클라이언트 푸시 구독 저장(본인). endpoint 충돌 시 갱신.
export async function savePushSubscription(sub: {
	endpoint: string;
	p256dh: string;
	auth: string;
}): Promise<{ ok: boolean }> {
	const user = await getCurrentUser();
	if (!user) return { ok: false };
	await db
		.insert(pushSubscriptions)
		.values({
			userId: user.appUser.id,
			endpoint: sub.endpoint,
			p256dh: sub.p256dh,
			auth: sub.auth,
		})
		.onConflictDoUpdate({
			target: pushSubscriptions.endpoint,
			set: { userId: user.appUser.id, p256dh: sub.p256dh, auth: sub.auth },
		});
	return { ok: true };
}
