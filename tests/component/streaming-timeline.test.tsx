import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StreamingTimeline } from "@/app/(coach)/evaluation/[id]/components/streaming-timeline";

describe("StreamingTimeline", () => {
	it("renders all 4 steps", () => {
		render(<StreamingTimeline events={[]} />);
		expect(screen.getByText("영상 프레임 추출")).toBeInTheDocument();
		expect(screen.getByText("Vertex 임베딩 생성")).toBeInTheDocument();
		expect(screen.getByText("코치 기준 매칭 점수 계산")).toBeInTheDocument();
		expect(screen.getByText("한국어 피드백 초안 작성")).toBeInTheDocument();
	});

	it("marks step done when its event arrived", () => {
		render(
			<StreamingTimeline
				events={[
					{ step: "frames_extracted", frameCount: 30, durationMs: 1800 },
				]}
			/>,
		);
		expect(screen.getByText(/✓.*영상 프레임 추출/)).toBeInTheDocument();
	});

	it("marks all done after complete", () => {
		render(
			<StreamingTimeline
				events={[
					{ step: "frames_extracted", frameCount: 30, durationMs: 1800 },
					{ step: "embedding_generated", vectorPreview: [] },
					{ step: "matches_computed", matches: [] },
					{ step: "letter_drafting" },
					{ step: "complete", analysis: {} as never, letterDraft: "" },
				]}
			/>,
		);
		expect(screen.getByText(/✓.*한국어 피드백 초안 작성/)).toBeInTheDocument();
	});
});
