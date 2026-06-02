import { beforeEach, describe, expect, it, vi } from "vitest";

const insertValues = vi.fn(() => ({
	returning: vi.fn(async () => [{ id: "stu-1" }]),
}));
const updateSet = vi.fn(() => ({ where: vi.fn(async () => ({})) }));

vi.mock("@/lib/auth/require-auth", () => ({ requireAuth: vi.fn() }));
vi.mock("@/lib/auth/require-role", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/db/client", () => ({
	db: {
		insert: vi.fn(() => ({ values: insertValues })),
		update: vi.fn(() => ({ set: updateSet })),
		query: { students: { findFirst: vi.fn() } },
	},
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { requireAuth } from "@/lib/auth/require-auth";
import { requireRole } from "@/lib/auth/require-role";
import { CURRENT_PARENT_CONSENT_VERSION } from "@/lib/consent/version";
import { db } from "@/lib/db/client";
import {
	archiveStudent,
	createStudent,
	recordParentConsent,
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

	it("inserts student with consent timestamp + current version when toggle ON", async () => {
		const res = await createStudent({
			name: "박지윤",
			year: "2년차",
			parentConsentOnFile: true,
		});
		expect(res.ok).toBe(true);
		expect(db.insert).toHaveBeenCalled();
		const args = (insertValues.mock.calls as unknown as unknown[][])[0]?.[0] as {
			parentConsentOnFileAt: Date | null;
			parentConsentVersion: string | null;
		};
		expect(args.parentConsentOnFileAt).toBeInstanceOf(Date);
		expect(args.parentConsentVersion).toBe(CURRENT_PARENT_CONSENT_VERSION);
	});

	it("inserts student with null consent fields when toggle OFF", async () => {
		const res = await createStudent({
			name: "박지윤",
			parentConsentOnFile: false,
		});
		expect(res.ok).toBe(true);
		const args = (insertValues.mock.calls as unknown as unknown[][])[0]?.[0] as {
			parentConsentOnFileAt: Date | null;
			parentConsentVersion: string | null;
		};
		expect(args.parentConsentOnFileAt).toBeNull();
		expect(args.parentConsentVersion).toBeNull();
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
			{ id: "stu-1", academyId: "acad-1", parentConsentOnFileAt: null } as any,
		);
	});

	it("requires owner/admin role for consent toggle", async () => {
		vi.mocked(requireRole).mockRejectedValue(new Error("REDIRECT:/students"));
		await expect(
			updateStudent("stu-1", { name: "박지윤", parentConsentOnFile: true }),
		).rejects.toThrow();
	});

	it("allows coach role to edit name without changing consent", async () => {
		vi.mocked(requireRole).mockRejectedValue(
			new Error("requireRole should not have been called"),
		);
		const res = await updateStudent("stu-1", {
			name: "새이름",
			parentConsentOnFile: false,
		});
		expect(res.ok).toBe(true);
		expect(requireRole).not.toHaveBeenCalled();
	});

	it("stamps current consent version when toggling consent ON for first time", async () => {
		vi.mocked(db.query.students.findFirst).mockResolvedValue(
			{
				id: "stu-1",
				academyId: "acad-1",
				parentConsentOnFileAt: null,
				parentConsentVersion: null,
				// biome-ignore lint/suspicious/noExplicitAny: partial mock
			} as any,
		);
		const res = await updateStudent("stu-1", {
			name: "박지윤",
			parentConsentOnFile: true,
		});
		expect(res.ok).toBe(true);
		const args = (updateSet.mock.calls as unknown as unknown[][])[0]?.[0] as {
			parentConsentVersion: string | null;
		};
		expect(args.parentConsentVersion).toBe(CURRENT_PARENT_CONSENT_VERSION);
	});

	it("preserves existing consent version on subsequent updates", async () => {
		vi.mocked(db.query.students.findFirst).mockResolvedValue(
			{
				id: "stu-1",
				academyId: "acad-1",
				parentConsentOnFileAt: new Date("2026-01-01"),
				parentConsentVersion: "2026-01-01-v1",
				// biome-ignore lint/suspicious/noExplicitAny: partial mock
			} as any,
		);
		const res = await updateStudent("stu-1", {
			name: "박지윤",
			parentConsentOnFile: true,
		});
		expect(res.ok).toBe(true);
		const args = (updateSet.mock.calls as unknown as unknown[][])[0]?.[0] as {
			parentConsentVersion: string | null;
		};
		expect(args.parentConsentVersion).toBe("2026-01-01-v1");
	});

	it("nulls consent version when toggling consent OFF", async () => {
		vi.mocked(db.query.students.findFirst).mockResolvedValue(
			{
				id: "stu-1",
				academyId: "acad-1",
				parentConsentOnFileAt: new Date("2026-01-01"),
				parentConsentVersion: "2026-01-01-v1",
				// biome-ignore lint/suspicious/noExplicitAny: partial mock
			} as any,
		);
		const res = await updateStudent("stu-1", {
			name: "박지윤",
			parentConsentOnFile: false,
		});
		expect(res.ok).toBe(true);
		const args = (updateSet.mock.calls as unknown as unknown[][])[0]?.[0] as {
			parentConsentOnFileAt: Date | null;
			parentConsentVersion: string | null;
		};
		expect(args.parentConsentOnFileAt).toBeNull();
		expect(args.parentConsentVersion).toBeNull();
	});
});

describe("recordParentConsent", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(requireRole).mockResolvedValue(
			// biome-ignore lint/suspicious/noExplicitAny: partial mock
			{ academyId: "acad-1", role: "owner" } as any,
		);
		vi.mocked(db.query.students.findFirst).mockResolvedValue(
			// biome-ignore lint/suspicious/noExplicitAny: partial mock
			{ id: "stu-1", academyId: "acad-1", parentConsentOnFileAt: null } as any,
		);
	});

	it("stamps consent date + current version when not yet on file", async () => {
		const res = await recordParentConsent("stu-1");
		expect(res.ok).toBe(true);
		expect(db.update).toHaveBeenCalled();
		const args = (updateSet.mock.calls as unknown as unknown[][])[0]?.[0] as {
			parentConsentOnFileAt: Date | null;
			parentConsentVersion: string | null;
		};
		expect(args.parentConsentOnFileAt).toBeInstanceOf(Date);
		expect(args.parentConsentVersion).toBe(CURRENT_PARENT_CONSENT_VERSION);
	});

	it("is idempotent no-op when consent already on file", async () => {
		vi.mocked(db.query.students.findFirst).mockResolvedValue(
			// biome-ignore lint/suspicious/noExplicitAny: partial mock
			{
				id: "stu-1",
				academyId: "acad-1",
				parentConsentOnFileAt: new Date("2026-01-01"),
			} as any,
		);
		const res = await recordParentConsent("stu-1");
		expect(res.ok).toBe(true);
		expect(db.update).not.toHaveBeenCalled();
	});

	it("rejects when student not found in academy", async () => {
		vi.mocked(db.query.students.findFirst).mockResolvedValue(undefined);
		const res = await recordParentConsent("stu-missing");
		expect(res.ok).toBe(false);
		if (!res.ok) expect(res.error).toContain("찾을 수 없");
	});

	it("requires owner/admin (requireRole rejection propagates)", async () => {
		vi.mocked(requireRole).mockRejectedValue(new Error("REDIRECT:/students"));
		await expect(recordParentConsent("stu-1")).rejects.toThrow();
	});
});
