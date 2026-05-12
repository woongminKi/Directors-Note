import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CoachProgressBar } from "@/app/(coach)/dashboard/components/coach-progress-bar";

describe("<CoachProgressBar>", () => {
	it("renders coach email and percentage", () => {
		render(<CoachProgressBar email="coach1@x.kr" progressRatio={0.5} />);
		expect(screen.getByText("coach1@x.kr")).toBeInTheDocument();
		expect(screen.getByText("50%")).toBeInTheDocument();
	});

	it("applies 'behind' tier styling below 30%", () => {
		const { container } = render(
			<CoachProgressBar email="x" progressRatio={0.1} />,
		);
		expect(container.querySelector('[data-tier="behind"]')).toBeInTheDocument();
	});

	it("applies 'on-track' tier styling 30-70%", () => {
		const { container } = render(
			<CoachProgressBar email="x" progressRatio={0.5} />,
		);
		expect(
			container.querySelector('[data-tier="on-track"]'),
		).toBeInTheDocument();
	});

	it("applies 'complete' tier styling >= 70%", () => {
		const { container } = render(
			<CoachProgressBar email="x" progressRatio={0.85} />,
		);
		expect(
			container.querySelector('[data-tier="complete"]'),
		).toBeInTheDocument();
	});

	it("rounds percentage to integer", () => {
		render(<CoachProgressBar email="x" progressRatio={0.674} />);
		expect(screen.getByText("67%")).toBeInTheDocument();
	});
});
