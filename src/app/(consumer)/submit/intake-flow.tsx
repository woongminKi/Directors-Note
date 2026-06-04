"use client";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
	attachVideoToSubmission,
	createSubmission,
	createSubmissionUploadUrl,
	enqueueSubmission,
} from "@/lib/submissions/actions";
import { ConsentIntakeForm } from "./consent-form";

type Step = "meta" | "uploading" | "consent" | "done";

function formatSize(bytes: number): string {
	const mb = bytes / 1024 / 1024;
	return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`;
}

// XHR PUT so we can surface real upload progress — video-upload-flow.tsx 재사용
// (AI 스트리밍 분기/EventSource/"분석 시작" 버튼은 WS3.1 따라 제거).
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

export function SubmissionIntakeFlow({
	guardianVerification,
}: {
	guardianVerification: boolean;
}) {
	const [step, setStep] = useState<Step>("meta");
	const [sceneType, setSceneType] = useState("");
	const [performanceYear, setPerformanceYear] = useState("");
	const [submissionId, setSubmissionId] = useState<string | null>(null);
	const [fileName, setFileName] = useState<string | null>(null);
	const [progress, setProgress] = useState(0);
	const [dragOver, setDragOver] = useState(false);
	const inputRef = useRef<HTMLInputElement>(null);

	const upload = async (file: File) => {
		if (!file.type.startsWith("video/")) {
			toast.error("영상 파일만 업로드할 수 있습니다");
			return;
		}
		if (!sceneType.trim()) {
			toast.error("장면 유형을 먼저 입력해 주세요");
			return;
		}
		setFileName(`${file.name} · ${formatSize(file.size)}`);
		setProgress(0);
		setStep("uploading");

		// 1) 제출 row(draft) 생성 → submissionId 확보
		const created = await createSubmission({
			sceneType: sceneType.trim(),
			performanceYear: performanceYear.trim() || undefined,
		});
		if (!created.ok || !created.data) {
			toast.error(created.ok ? "제출 생성 실패" : created.error);
			setStep("meta");
			return;
		}
		const id = created.data.submissionId;
		setSubmissionId(id);

		// 2) 서명 업로드 URL 발급 → `${uploaderId}/${id}.mp4`
		const signed = await createSubmissionUploadUrl(id);
		if (!signed.ok) {
			toast.error(signed.error);
			setStep("meta");
			return;
		}
		try {
			await putWithProgress(signed.signedUrl, file, setProgress);
		} catch {
			toast.error("업로드 실패");
			setStep("meta");
			return;
		}
		await attachVideoToSubmission(id, signed.path);
		setStep("consent");
	};

	const handleConsentRecorded = async () => {
		if (!submissionId) return;
		// 3) 동의 기록 완료 → enqueue 게이트 통과 시 status='queued'
		const res = await enqueueSubmission(submissionId);
		if (res.ok) {
			setStep("done");
			toast.success("제출이 접수되었습니다");
		} else {
			toast.error(res.error);
		}
	};

	if (step === "done") {
		return (
			<div className="rounded-lg border bg-card p-6 text-center space-y-2">
				<p className="text-base font-semibold">제출이 접수되었습니다 ✓</p>
				<p className="text-sm text-muted-foreground">
					사람 평가자가 평가를 진행합니다. 결과가 준비되면 알려드릴게요.
				</p>
			</div>
		);
	}

	if (step === "consent" && submissionId) {
		return (
			<ConsentIntakeForm
				submissionId={submissionId}
				guardianVerification={guardianVerification}
				onRecorded={handleConsentRecorded}
			/>
		);
	}

	if (step === "uploading") {
		return (
			<div className="space-y-2">
				<p className="truncate text-sm text-muted-foreground">{fileName}</p>
				<Progress value={progress} className="h-2" />
				<p className="text-xs text-muted-foreground">업로드 중… {progress}%</p>
			</div>
		);
	}

	// meta + 드롭존
	return (
		<div className="space-y-4">
			<div className="space-y-2">
				<Label htmlFor="sceneType">장면 유형</Label>
				<Input
					id="sceneType"
					value={sceneType}
					onChange={(e) => setSceneType(e.target.value)}
					placeholder="예: 자유연기, 지정대사, 뮤지컬 넘버"
					maxLength={60}
				/>
			</div>
			<div className="space-y-2">
				<Label htmlFor="performanceYear">연기 경력/학년 (선택)</Label>
				<Input
					id="performanceYear"
					value={performanceYear}
					onChange={(e) => setPerformanceYear(e.target.value)}
					placeholder="예: 입시 1년차"
					maxLength={20}
				/>
			</div>
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
					mp4, mov 등 영상 파일
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
		</div>
	);
}
