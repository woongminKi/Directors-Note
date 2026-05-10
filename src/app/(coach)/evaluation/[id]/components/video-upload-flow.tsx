"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { ProgressEvent } from "@/lib/evaluation/types";
import {
	attachVideoToEvaluation,
	createSignedUploadUrl,
} from "@/lib/evaluations/upload-action";
import { StreamingTimeline } from "./streaming-timeline";

type Phase =
	| "idle"
	| "uploading"
	| "ready"
	| "streaming"
	| "complete"
	| "error";

export function VideoUploadFlow({
	evaluationId,
	hasVideo,
}: {
	evaluationId: string;
	hasVideo: boolean;
}) {
	const router = useRouter();
	const [phase, setPhase] = useState<Phase>(hasVideo ? "ready" : "idle");
	const [events, setEvents] = useState<ProgressEvent[]>([]);
	const [errorMsg, setErrorMsg] = useState<string | null>(null);

	const upload = async (file: File) => {
		setPhase("uploading");
		const res = await createSignedUploadUrl(evaluationId);
		if (!res.ok) {
			toast.error(res.error);
			setPhase("idle");
			return;
		}
		const put = await fetch(res.signedUrl, {
			method: "PUT",
			body: file,
			headers: { "Content-Type": file.type },
		});
		if (!put.ok) {
			toast.error("업로드 실패");
			setPhase("idle");
			return;
		}
		await attachVideoToEvaluation(evaluationId, res.path);
		setPhase("ready");
	};

	const startStreaming = () => {
		setPhase("streaming");
		setEvents([]);
		const es = new EventSource(`/api/evaluations/${evaluationId}/stream`);
		es.onmessage = (msg) => {
			const event = JSON.parse(msg.data) as ProgressEvent;
			setEvents((prev) => [...prev, event]);
			if (event.step === "complete") {
				es.close();
				setPhase("complete");
				router.push(`/evaluation/${evaluationId}/review`);
			}
			if (event.step === "error") {
				es.close();
				setErrorMsg(event.message);
				setPhase("error");
			}
		};
		es.onerror = () => {
			es.close();
			setErrorMsg("연결이 끊겼습니다");
			setPhase("error");
		};
	};

	if (phase === "error") {
		return (
			<div className="space-y-3">
				<div className="rounded border border-destructive p-3 text-sm">
					⚠️ AI 분석 실패: {errorMsg ?? "알 수 없는 오류"}
				</div>
				<Button
					className="w-full"
					onClick={() => router.push(`/evaluation/${evaluationId}/coach-form`)}
				>
					메모로 진행
				</Button>
			</div>
		);
	}

	if (phase === "streaming" || phase === "complete") {
		return <StreamingTimeline events={events} />;
	}

	return (
		<div className="space-y-3">
			<input
				type="file"
				accept="video/*"
				onChange={(e) => {
					const f = e.target.files?.[0];
					if (f) upload(f);
				}}
				disabled={phase === "uploading"}
			/>
			{phase === "ready" && (
				<Button className="w-full" onClick={startStreaming}>
					분석 시작
				</Button>
			)}
		</div>
	);
}
