export type EmptyStateVariant =
	| "eval-todo"
	| "review-pending"
	| "sent"
	| "owner-no-coach";

export interface EmptyStateConfig {
	message: string;
	cta?: { label: string; href: string };
}

const CONFIG: Record<EmptyStateVariant, EmptyStateConfig> = {
	"eval-todo": {
		message: "이번 cycle 평가 모두 시작됨 ✨",
	},
	"review-pending": {
		message: "검토할 letter 가 없습니다.",
		cta: { label: "새 평가 시작", href: "/students" },
	},
	sent: {
		message: "이번 주 첫 발송을 기대합니다.",
	},
	"owner-no-coach": {
		message: "함께 일할 코치를 초대해 보세요.",
		cta: { label: "코치 초대", href: "/admin/users/new" },
	},
};

export function emptyStateConfig(variant: EmptyStateVariant): EmptyStateConfig {
	return CONFIG[variant];
}
