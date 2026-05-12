import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EmptyState } from "@/app/(coach)/dashboard/components/empty-state";

describe("<EmptyState>", () => {
	it("renders message for eval-todo (no CTA)", () => {
		render(<EmptyState variant="eval-todo" />);
		expect(screen.getByText(/이번 cycle 평가 모두 시작됨/)).toBeInTheDocument();
		expect(screen.queryByRole("link")).not.toBeInTheDocument();
	});

	it("renders message + CTA for review-pending", () => {
		render(<EmptyState variant="review-pending" />);
		expect(screen.getByText(/검토할 letter 가 없습니다/)).toBeInTheDocument();
		expect(screen.getByRole("link", { name: "새 평가 시작" })).toHaveAttribute(
			"href",
			"/students",
		);
	});

	it("renders coach invite CTA for owner-no-coach", () => {
		render(<EmptyState variant="owner-no-coach" />);
		expect(screen.getByRole("link", { name: "코치 초대" })).toHaveAttribute(
			"href",
			"/admin/users/new",
		);
	});
});
