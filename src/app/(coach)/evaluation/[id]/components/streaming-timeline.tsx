"use client";
import type { ProgressEvent } from "@/lib/evaluation/types";

const STEPS = [
	{ key: "frames_extracted", label: "영상 프레임 추출" },
	{ key: "embedding_generated", label: "Vertex 임베딩 생성" },
	{ key: "matches_computed", label: "코치 기준 매칭 점수 계산" },
	{ key: "letter_drafting", label: "한국어 피드백 초안 작성" },
] as const;

export function StreamingTimeline({ events }: { events: ProgressEvent[] }) {
	const reached = new Set(events.map((e) => e.step));
	const isDone = reached.has("complete");
	const lastStep = events[events.length - 1]?.step;

	return (
		<ol className="space-y-2 border-l pl-4">
			{STEPS.map((step) => {
				const done =
					reached.has(step.key) || (step.key === "letter_drafting" && isDone);
				const active = !done && lastStep === step.key;
				return (
					<li key={step.key} className="relative">
						<span
							className={`absolute -left-[21px] top-1 w-3 h-3 rounded-full ${
								done
									? "bg-green-500"
									: active
										? "bg-primary animate-pulse"
										: "bg-muted"
							}`}
						/>
						<p
							className={`text-sm ${done ? "text-foreground" : active ? "font-medium" : "text-muted-foreground"}`}
						>
							{done ? "✓ " : ""}
							{step.label}
						</p>
					</li>
				);
			})}
		</ol>
	);
}
