import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertTriangle } from "lucide-react";

/**
 * D8 graceful degrade 배너.
 * FEATURE_AI_VIDEO_ANALYSIS=false 거나 Vertex 호출 2회 연속 실패 시 surface.
 */
export function DegradeBanner({
	reason,
}: {
	reason?: "feature_off" | "ai_failed";
}) {
	const message =
		reason === "ai_failed"
			? "AI 영상 분석 호출이 잠시 불안정합니다. 메모로 진행해 주세요. 분석 기능은 자동으로 복구됩니다."
			: "AI 영상 분석 사용 불가. 메모로 진행해 주세요. 학원 관리자에게 PIPA 검토 진행 상황을 문의할 수 있습니다.";

	return (
		<Alert className="bg-amber-50 border-amber-300 text-amber-900">
			<AlertTriangle className="size-4 text-amber-700" />
			<AlertTitle className="text-amber-900">AI 영상 분석 사용 불가</AlertTitle>
			<AlertDescription className="text-amber-900/90">{message}</AlertDescription>
		</Alert>
	);
}
