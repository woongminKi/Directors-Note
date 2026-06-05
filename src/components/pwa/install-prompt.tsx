"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

type BeforeInstallPromptEvent = Event & {
	prompt: () => Promise<void>;
	userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export function InstallPrompt() {
	const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(
		null,
	);
	const [isIos, setIsIos] = useState(false);
	const [standalone, setStandalone] = useState(false);

	useEffect(() => {
		const onBip = (e: Event) => {
			e.preventDefault();
			setDeferred(e as BeforeInstallPromptEvent);
		};
		window.addEventListener("beforeinstallprompt", onBip);
		const ua = window.navigator.userAgent.toLowerCase();
		setIsIos(/iphone|ipad|ipod/.test(ua));
		setStandalone(
			window.matchMedia("(display-mode: standalone)").matches ||
				(window.navigator as unknown as { standalone?: boolean }).standalone ===
					true,
		);
		return () => window.removeEventListener("beforeinstallprompt", onBip);
	}, []);

	if (standalone) return null;

	if (deferred) {
		return (
			<Button
				variant="outline"
				size="sm"
				onClick={async () => {
					await deferred.prompt();
					await deferred.userChoice;
					setDeferred(null);
				}}
			>
				앱 설치
			</Button>
		);
	}

	if (isIos) {
		return (
			<p className="text-xs text-muted-foreground">
				홈 화면에 추가: 공유 버튼 → "홈 화면에 추가"
			</p>
		);
	}

	return null;
}
