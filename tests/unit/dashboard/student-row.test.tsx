import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StudentRow } from "@/app/(coach)/dashboard/components/student-row";

describe("<StudentRow>", () => {
	it("renders student name + year and links to href", () => {
		render(
			<StudentRow
				studentName="박지윤"
				year="2년차"
				href="/evaluation/abc/coach-form"
			/>,
		);
		expect(screen.getByText("박지윤")).toBeInTheDocument();
		expect(screen.getByText("2년차")).toBeInTheDocument();
		expect(screen.getByRole("link")).toHaveAttribute(
			"href",
			"/evaluation/abc/coach-form",
		);
	});

	it("renders without year when null", () => {
		render(<StudentRow studentName="이서준" year={null} href="/x" />);
		expect(screen.getByText("이서준")).toBeInTheDocument();
		expect(screen.queryByText("2년차")).not.toBeInTheDocument();
	});

	it("renders meta tag when provided", () => {
		render(
			<StudentRow studentName="김하늘" year="1년차" href="/x" metaLabel="B" />,
		);
		expect(screen.getByText("B")).toBeInTheDocument();
	});
});
