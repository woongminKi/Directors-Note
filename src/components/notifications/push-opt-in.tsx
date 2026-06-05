"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { env } from "@/lib/env";
import { savePushSubscription } from "@/lib/notifications/actions";

// VAPID base64url → Uint8Array (PushManager applicationServerKey 용).
function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
	const padding = "=".repeat((4 - (base64.length % 4)) % 4);
	const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
	const raw = atob(b64);
	const arr = new Uint8Array(new ArrayBuffer(raw.length));
	for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
	return arr;
}

export function PushOptIn() {
	const [supported, setSupported] = useState(false);
	const [permission, setPermission] =
		useState<NotificationPermission>("default");
	const [busy, setBusy] = useState(false);

	useEffect(() => {
		const ok =
			typeof window !== "undefined" &&
			"serviceWorker" in navigator &&
			"PushManager" in window &&
			"Notification" in window;
		setSupported(ok);
		if (ok) setPermission(Notification.permission);
	}, []);

	if (!supported || permission === "granted") return null;

	async function enable() {
		const vapid = env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
		if (!vapid) return;
		setBusy(true);
		try {
			const perm = await Notification.requestPermission();
			setPermission(perm);
			if (perm !== "granted") return;
			const reg = await navigator.serviceWorker.register("/sw.js");
			const sub = await reg.pushManager.subscribe({
				userVisibleOnly: true,
				applicationServerKey: urlBase64ToUint8Array(vapid),
			});
			const json = sub.toJSON();
			await savePushSubscription({
				endpoint: json.endpoint ?? "",
				p256dh: json.keys?.p256dh ?? "",
				auth: json.keys?.auth ?? "",
			});
		} finally {
			setBusy(false);
		}
	}

	return (
		<Button variant="outline" size="sm" onClick={enable} disabled={busy}>
			{busy ? "설정 중…" : "알림 켜기"}
		</Button>
	);
}
