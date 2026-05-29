"use client";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
	createReferenceUploadUrl,
	processReferenceVideo,
} from "@/lib/reference/actions";

const TIERS = ["A", "B", "C", "D"] as const;
const SCENE_TYPES = [
	{ value: "modern_monologue", label: "현대극 독백" },
	{ value: "classical_monologue", label: "고전극 독백" },
	{ value: "dialogue", label: "2인극 대화" },
	{ value: "improv", label: "자유·즉흥" },
	{ value: "__custom__", label: "직접 입력" },
] as const;

type Phase = "idle" | "uploading" | "processing";

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

export function ReferenceUploadForm() {
	const router = useRouter();
	const [tier, setTier] = useState<string>("A");
	const [sceneSelect, setSceneSelect] = useState<string>("modern_monologue");
	const [customScene, setCustomScene] = useState("");
	const [techniqueTag, setTechniqueTag] = useState("");
	const [phase, setPhase] = useState<Phase>("idle");
	const [progress, setProgress] = useState(0);
	const [dragOver, setDragOver] = useState(false);
	const inputRef = useRef<HTMLInputElement>(null);

	const sceneType =
		sceneSelect === "__custom__" ? customScene.trim() : sceneSelect;

	const handleFile = async (file: File) => {
		if (!file.type.startsWith("video/")) {
			toast.error("영상 파일만 업로드할 수 있습니다");
			return;
		}
		if (!sceneType) {
			toast.error("장면 유형을 입력해 주세요");
			return;
		}
		setProgress(0);
		setPhase("uploading");
		const res = await createReferenceUploadUrl();
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
		setPhase("processing");
		const done = await processReferenceVideo({
			referenceId: res.referenceId,
			storagePath: res.path,
			tier,
			sceneType,
			techniqueTag: techniqueTag.trim() || null,
		});
		if (!done.ok) {
			toast.error(`처리 실패: ${done.error ?? "알 수 없는 오류"}`);
			setPhase("idle");
			return;
		}
		toast.success("기준 영상이 등록되었습니다");
		setCustomScene("");
		setTechniqueTag("");
		setPhase("idle");
		router.refresh();
	};

	const busy = phase !== "idle";

	return (
		<section className="rounded-lg border bg-card p-4 space-y-4">
			<h2 className="text-sm font-semibold">기준 영상 추가</h2>

			<div className="grid grid-cols-2 gap-3">
				<div className="space-y-1">
					<Label htmlFor="ref-tier">tier</Label>
					<select
						id="ref-tier"
						value={tier}
						onChange={(e) => setTier(e.target.value)}
						disabled={busy}
						className="w-full rounded-md border bg-background px-3 py-2 text-sm"
					>
						{TIERS.map((t) => (
							<option key={t} value={t}>
								{t}급
							</option>
						))}
					</select>
				</div>
				<div className="space-y-1">
					<Label htmlFor="ref-scene">장면 유형</Label>
					<select
						id="ref-scene"
						value={sceneSelect}
						onChange={(e) => setSceneSelect(e.target.value)}
						disabled={busy}
						className="w-full rounded-md border bg-background px-3 py-2 text-sm"
					>
						{SCENE_TYPES.map((s) => (
							<option key={s.value} value={s.value}>
								{s.label}
							</option>
						))}
					</select>
				</div>
			</div>

			{sceneSelect === "__custom__" && (
				<div className="space-y-1">
					<Label htmlFor="ref-scene-custom">장면 유형 직접 입력</Label>
					<Input
						id="ref-scene-custom"
						value={customScene}
						onChange={(e) => setCustomScene(e.target.value)}
						placeholder="예: 뮤지컬 넘버"
						disabled={busy}
					/>
				</div>
			)}

			<div className="space-y-1">
				<Label htmlFor="ref-tag">기술 태그 (선택)</Label>
				<Input
					id="ref-tag"
					value={techniqueTag}
					onChange={(e) => setTechniqueTag(e.target.value)}
					placeholder="예: 발성, 표정"
					disabled={busy}
				/>
			</div>

			{phase === "processing" ? (
				<p className="text-sm text-muted-foreground">
					임베딩 처리 중… (Vertex 분석, 최대 30초)
				</p>
			) : phase === "uploading" ? (
				<div className="space-y-1">
					<Progress value={progress} className="h-2" />
					<p className="text-xs text-muted-foreground">
						업로드 중… {progress}%
					</p>
				</div>
			) : (
				<>
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
							if (f) handleFile(f);
						}}
						className={`w-full rounded-lg border-2 border-dashed p-6 text-center text-sm transition-colors ${
							dragOver
								? "border-primary bg-primary/5"
								: "border-muted-foreground/30 hover:border-muted-foreground/50"
						}`}
					>
						기준 영상을 끌어다 놓거나 클릭해서 선택
					</button>
					<input
						ref={inputRef}
						type="file"
						accept="video/*"
						className="hidden"
						onChange={(e) => {
							const f = e.target.files?.[0];
							if (f) handleFile(f);
						}}
					/>
				</>
			)}
		</section>
	);
}
