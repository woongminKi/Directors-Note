"use client";

import { countKoreanChars } from "@/lib/korean-letter";
import { cn } from "@/lib/utils";

interface KoreanCharCounterProps {
	value: string;
	max: number;
	className?: string;
}

/**
 * 한글 IME-aware 글자수 카운터.
 * - 공백/줄바꿈 제외 visible 글자만 카운트.
 * - max 의 90% 초과 시 amber, 100% 초과 시 destructive (textarea maxLength 가 차단하므로 100% 가 한계).
 */
export function KoreanCharCounter({
	value,
	max,
	className,
}: KoreanCharCounterProps) {
	const count = countKoreanChars(value);
	const ratio = count / max;
	const tone = ratio > 1 ? "destructive" : ratio > 0.9 ? "warn" : "muted";
	return (
		<div
			className={cn(
				"text-xs text-right tabular-nums mt-1",
				tone === "muted" && "text-muted-foreground",
				tone === "warn" && "text-amber-600 font-medium",
				tone === "destructive" && "text-destructive font-semibold",
				className,
			)}
		>
			{count} / {max}자
		</div>
	);
}
