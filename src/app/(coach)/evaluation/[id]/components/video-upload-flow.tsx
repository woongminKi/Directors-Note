"use client";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import type { ProgressEvent as AnalysisProgressEvent } from "@/lib/evaluation/types";
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

function formatSize(bytes: number): string {
	const mb = bytes / 1024 / 1024;
	return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`;
}

// Upload via XHR (not fetch) so we can surface real upload progress.
function putWithProgress(
	url: string,
	file: File,
	onProgress: (pct: number) => void,
): Promise<void> {
	return new Promise((resolve, reject) => {
		const xhr = new XMLHttpRequest();
		xhr.open("PUT", url);
		xhr.setRequestHeader("Content-Type", file.type);
		xhr.upload.onprogress = (e) => {
			if (e.lengthComputable)
				onProgress(Math.round((e.loaded / e.total) * 100));
		};
		xhr.onload = () =>
			xhr.status >= 200 && xhr.status < 300
				? resolve()
				: reject(new Error(`upload_failed_${xhr.status}`));
		xhr.onerror = () => reject(new Error("upload_network_error"));
		xhr.send(file);
	});
}

export function VideoUploadFlow({
	evaluationId,
	hasVideo,
}: {
	evaluationId: string;
	hasVideo: boolean;
}) {
	const router = useRouter();
	const [phase, setPhase] = useState<Phase>(hasVideo ? "ready" : "idle");
	const [events, setEvents] = useState<AnalysisProgressEvent[]>([]);
	const [errorMsg, setErrorMsg] = useState<string | null>(null);
	const [fileName, setFileName] = useState<string | null>(null);
	const [progress, setProgress] = useState(0);
	const [dragOver, setDragOver] = useState(false);
	const inputRef = useRef<HTMLInputElement>(null);

	const upload = async (file: File) => {
		if (!file.type.startsWith("video/")) {
			toast.error("영상 파일만 업로드할 수 있습니다");
			return;
		}
		setFileName(`${file.name} · ${formatSize(file.size)}`);
		setProgress(0);
		setPhase("uploading");
		const res = await createSignedUploadUrl(evaluationId);
		if (!res.ok) {
			toast.error(res.error);
			setPhase("idle");
			return;
		}
		try {
			await putWithProgress(res.signedUrl, file, setProgress);
		} catch {
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
			const event = JSON.parse(msg.data) as AnalysisProgressEvent;
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
		return (
			<div className="space-y-3">
				<p className="text-sm font-medium">AI 분석 중…</p>
				<StreamingTimeline events={events} />
			</div>
		);
	}

	if (phase === "uploading") {
		return (
			<div className="space-y-2">
				<p className="text-sm text-muted-foreground truncate">{fileName}</p>
				<Progress value={progress} className="h-2" />
				<p className="text-xs text-muted-foreground">업로드 중… {progress}%</p>
			</div>
		);
	}

	return (
		<div className="space-y-3">
			<button
				type="button"
				onClick={() => inputRef.current?.click()}
				onDragOver={(e) => {
					e.preventDefault();
					setDragOver(true);
				}}
				onDragLeave={() => setDragOver(false)}
				onDrop={(e) => {
					e.preventDefault();
					setDragOver(false);
					const f = e.dataTransfer.files?.[0];
					if (f) upload(f);
				}}
				className={`w-full rounded-lg border-2 border-dashed p-8 text-center transition-colors ${
					dragOver
						? "border-primary bg-primary/5"
						: "border-muted-foreground/30 hover:border-muted-foreground/50"
				}`}
			>
				<p className="text-sm font-medium">
					영상을 끌어다 놓거나 클릭해서 선택
				</p>
				<p className="mt-1 text-xs text-muted-foreground">
					mp4, mov 등 영상 파일 · {fileName ?? "선택된 파일 없음"}
				</p>
			</button>
			<input
				ref={inputRef}
				type="file"
				accept="video/*"
				className="hidden"
				onChange={(e) => {
					const f = e.target.files?.[0];
					if (f) upload(f);
				}}
			/>
			{phase === "ready" && (
				<Button className="w-full" onClick={startStreaming}>
					분석 시작
				</Button>
			)}
		</div>
	);
}
