"use client";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { KoreanCharCounter } from "@/components/korean-char-counter";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { finalizeAndSend } from "./actions";
import { ShareLinkCard } from "./share-link-card";

const ERROR_MESSAGES: Record<string, string> = {
	must_start_greeting: "letter 는 '안녕하세요' 로 시작해야 합니다.",
	too_long: "350자를 초과했습니다.",
	missing_pepper: "서버 설정 오류 (pepper).",
	missing_app_url: "서버 설정 오류 (app url).",
};

export function ReviewEditor({
	draftId,
	initialText,
}: {
	draftId: string;
	initialText: string;
}) {
	const [text, setText] = useState(initialText);
	const [pending, startTransition] = useTransition();
	const [shareUrl, setShareUrl] = useState<string | null>(null);
	const [expiresAt, setExpiresAt] = useState<Date | null>(null);

	if (shareUrl && expiresAt) {
		return <ShareLinkCard shareUrl={shareUrl} expiresAt={expiresAt} />;
	}

	const handle = () =>
		startTransition(async () => {
			const res = await finalizeAndSend({ draftId, editedText: text });
			if (!res.ok) {
				const msg =
					ERROR_MESSAGES[res.error] ??
					(res.error.startsWith("prohibited:")
						? `금지어가 포함되어 있습니다: ${res.error.replace("prohibited:", "")}`
						: "발송 실패");
				toast.error(msg);
				return;
			}
			setShareUrl(res.shareUrl);
			setExpiresAt(res.expiresAt);
		});

	return (
		<div className="space-y-3">
			<Textarea
				value={text}
				onChange={(e) => setText(e.target.value)}
				rows={14}
				className="font-serif"
			/>
			<KoreanCharCounter value={text} max={350} />
			<p className="text-xs text-muted-foreground rounded bg-muted p-2">
				💡 AI 가 작성한 초안입니다. 한 줄 한 줄 검토 후 발송하세요.
			</p>
			<Button className="w-full" disabled={pending} onClick={handle}>
				{pending ? "발송 중..." : "승인 및 공유 링크 생성"}
			</Button>
		</div>
	);
}
