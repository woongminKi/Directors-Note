import { describe, expect, it } from "vitest";
import {
	type EvaluatorCandidate,
	selectEvaluator,
	shouldCreateRedundantLabel,
} from "@/lib/assignment/select-evaluator";

const cand = (id: string, onboardedAt: Date | null): EvaluatorCandidate => ({
	evaluatorId: id,
	onboardedAt,
});

const t = (iso: string) => new Date(iso);

describe("selectEvaluator", () => {
	it("returns null for an empty pool", () => {
		expect(selectEvaluator([], {})).toBeNull();
	});

	it("returns the only candidate when pool has one", () => {
		expect(selectEvaluator([cand("a", t("2026-01-01"))], { a: 99 })).toBe("a");
	});

	it("picks the evaluator with the fewest open assignments", () => {
		const pool = [
			cand("a", t("2026-01-01")),
			cand("b", t("2026-01-02")),
			cand("c", t("2026-01-03")),
		];
		expect(selectEvaluator(pool, { a: 3, b: 1, c: 5 })).toBe("b");
	});

	it("treats missing open-count as zero", () => {
		const pool = [cand("a", t("2026-01-01")), cand("b", t("2026-01-02"))];
		// b has no entry → 0 open, a has 1 → b wins.
		expect(selectEvaluator(pool, { a: 1 })).toBe("b");
	});

	it("tie-breaks equal open counts by oldest onboardedAt", () => {
		const pool = [
			cand("z", t("2026-03-01")), // newer
			cand("y", t("2026-01-01")), // oldest → should win on tie
			cand("x", t("2026-02-01")),
		];
		expect(selectEvaluator(pool, { x: 2, y: 2, z: 2 })).toBe("y");
	});

	it("tie-breaks equal open + equal onboardedAt by evaluatorId asc", () => {
		const same = t("2026-01-01");
		const pool = [cand("b", same), cand("a", same), cand("c", same)];
		expect(selectEvaluator(pool, { a: 0, b: 0, c: 0 })).toBe("a");
	});

	it("treats null onboardedAt as last in tie-break", () => {
		const pool = [cand("a", null), cand("b", t("2026-05-01"))];
		expect(selectEvaluator(pool, { a: 1, b: 1 })).toBe("b");
	});

	it("honors the exclude set", () => {
		const pool = [cand("a", t("2026-01-01")), cand("b", t("2026-01-02"))];
		// a would win on fewest open, but excluded → b.
		expect(selectEvaluator(pool, { a: 0, b: 5 }, new Set(["a"]))).toBe("b");
	});

	it("returns null when every candidate is excluded", () => {
		const pool = [cand("a", t("2026-01-01"))];
		expect(selectEvaluator(pool, { a: 0 }, new Set(["a"]))).toBeNull();
	});
});

describe("shouldCreateRedundantLabel", () => {
	it("returns true when rng is strictly below the rate", () => {
		expect(shouldCreateRedundantLabel(0.15, () => 0.149)).toBe(true);
		expect(shouldCreateRedundantLabel(0.15, () => 0)).toBe(true);
	});

	it("returns false when rng is at or above the rate", () => {
		expect(shouldCreateRedundantLabel(0.15, () => 0.15)).toBe(false);
		expect(shouldCreateRedundantLabel(0.15, () => 0.9)).toBe(false);
	});

	it("rate 0 never samples; rate 1 always samples", () => {
		expect(shouldCreateRedundantLabel(0, () => 0)).toBe(false);
		expect(shouldCreateRedundantLabel(1, () => 0.999)).toBe(true);
	});
});
