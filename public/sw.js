// Director's Note 웹푸시 서비스워커.
// push 이벤트 → 알림 표시. notificationclick → 해당 URL 열기.
self.addEventListener("push", (event) => {
	if (!event.data) return;
	let data;
	try {
		data = event.data.json();
	} catch {
		return;
	}
	event.waitUntil(
		self.registration.showNotification(data.title || "알림", {
			body: data.body || "",
			data: { url: data.url || "/" },
			icon: "/android-chrome-192x192.png",
			badge: "/favicon-32x32.png",
		}),
	);
});

self.addEventListener("notificationclick", (event) => {
	event.notification.close();
	const url = (event.notification.data && event.notification.data.url) || "/";
	event.waitUntil(
		clients
			.matchAll({ type: "window", includeUncontrolled: true })
			.then((wins) => {
				for (const w of wins) {
					if (w.url.includes(url) && "focus" in w) return w.focus();
				}
				return clients.openWindow(url);
			}),
	);
});
