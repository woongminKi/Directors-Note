export type ProgressTier = "behind" | "on-track" | "complete";

export function progressColorTier(ratio: number): ProgressTier {
	const clamped = Math.max(0, Math.min(1, ratio));
	if (clamped < 0.3) return "behind";
	if (clamped < 0.7) return "on-track";
	return "complete";
}
