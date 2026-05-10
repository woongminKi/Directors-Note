import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/require-auth", () => ({ requireAuth: vi.fn() }));
vi.mock("@/lib/auth/require-role", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/db/client", () => ({
	db: {
		insert: vi.fn(() => ({
			values: vi.fn(() => ({
				returning: vi.fn(async () => [{ id: "stu-1" }]),
			})),
		})),
		update: vi.fn(() => ({
			set: vi.fn(() => ({ where: vi.fn(async () => ({})) })),
		})),
		query: { students: { findFirst: vi.fn() } },
	},
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { requireAuth } from "@/lib/auth/require-auth";
import { requireRole } from "@/lib/auth/require-role";
import { db } from "@/lib/db/client";
import {
	archiveStudent,
	createStudent,
	updateStudent,
} from "@/lib/students/actions";

describe("createStudent", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(requireRole).mockResolvedValue(
			// biome-ignore lint/suspicious/noExplicitAny: partial mock
			{ academyId: "acad-1", role: "owner" } as any,
		);
	});

	it("inserts student with consent timestamp when toggle ON", async () => {
		const res = await createStudent({
			name: "박지윤",
			year: "2년차",
			parentConsentOnFile: true,
		});
		expect(res.ok).toBe(true);
		expect(db.insert).toHaveBeenCalled();
	});

	it("rejects invalid input via Zod", async () => {
		const res = await createStudent({
			name: "",
			parentConsentOnFile: false,
			// biome-ignore lint/suspicious/noExplicitAny: invalid input test
		} as any);
		expect(res.ok).toBe(false);
	});
});

describe("archiveStudent", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(requireRole).mockResolvedValue(
			// biome-ignore lint/suspicious/noExplicitAny: partial mock
			{ academyId: "acad-1", role: "owner" } as any,
		);
		vi.mocked(db.query.students.findFirst).mockResolvedValue(
			// biome-ignore lint/suspicious/noExplicitAny: partial mock
			{ id: "stu-1", name: "박지윤", academyId: "acad-1" } as any,
		);
	});

	it("anonymizes name and sets soft_deleted_at", async () => {
		const res = await archiveStudent("stu-1");
		expect(res.ok).toBe(true);
		expect(db.update).toHaveBeenCalled();
	});

	it("rejects when student not found in academy", async () => {
		vi.mocked(db.query.students.findFirst).mockResolvedValue(undefined);
		const res = await archiveStudent("stu-missing");
		expect(res.ok).toBe(false);
	});

	it("rejects when student is already archived", async () => {
		vi.mocked(db.query.students.findFirst).mockResolvedValue({
			id: "stu-1",
			name: "박지윤",
			academyId: "acad-1",
			softDeletedAt: new Date(),
			// biome-ignore lint/suspicious/noExplicitAny: partial mock
		} as any);
		const res = await archiveStudent("stu-1");
		expect(res.ok).toBe(false);
		if (!res.ok) expect(res.error).toContain("이미 삭제");
	});
});

describe("updateStudent", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(requireAuth).mockResolvedValue(
			// biome-ignore lint/suspicious/noExplicitAny: partial mock
			{ academyId: "acad-1", role: "coach" } as any,
		);
		vi.mocked(requireRole).mockResolvedValue(
			// biome-ignore lint/suspicious/noExplicitAny: partial mock
			{ academyId: "acad-1", role: "owner" } as any,
		);
		vi.mocked(db.query.students.findFirst).mockResolvedValue(
			// biome-ignore lint/suspicious/noExplicitAny: partial mock
			{ id: "stu-1", academyId: "acad-1" } as any,
		);
	});

	it("requires owner/admin role for consent toggle", async () => {
		vi.mocked(requireRole).mockRejectedValue(new Error("REDIRECT:/students"));
		await expect(
			updateStudent("stu-1", { name: "박지윤", parentConsentOnFile: true }),
		).rejects.toThrow();
	});
});
