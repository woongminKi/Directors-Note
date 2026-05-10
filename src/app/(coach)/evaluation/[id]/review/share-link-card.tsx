"use client";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function ShareLinkCard({
	shareUrl,
	expiresAt,
}: {
	shareUrl: string;
	expiresAt: Date;
}) {
	const [copied, setCopied] = useState(false);
	const handleCopy = async () => {
		await navigator.clipboard.writeText(shareUrl);
		setCopied(true);
		toast.success("주소를 복사했습니다");
	};
	const expiry = new Date(expiresAt).toLocaleDateString("ko-KR");

	return (
		<div className="rounded border p-4 space-y-3">
			<h2 className="font-semibold text-green-700">✓ 발송 완료</h2>
			<div>
				<p className="text-xs text-muted-foreground">부모용 공유 링크:</p>
				<p className="break-all rounded bg-muted p-2 text-xs font-mono">
					{shareUrl}
				</p>
			</div>
			<div className="flex gap-2">
				<Button onClick={handleCopy} className="flex-1">
					{copied ? "복사됨" : "주소 복사"}
				</Button>
				<a
					href="kakaotalk://"
					className="flex-1 rounded-md border px-3 py-2 text-center text-sm font-medium"
				>
					KakaoTalk 열기
				</a>
			</div>
			<p className="text-xs text-muted-foreground">
				⏰ {expiry} 까지 열람 가능
			</p>
		</div>
	);
}
