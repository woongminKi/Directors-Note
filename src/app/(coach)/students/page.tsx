import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { requireAuth } from "@/lib/auth/require-auth";
import { listStudents, type StudentListFilter } from "@/lib/students/queries";
import { cn } from "@/lib/utils";
import { StudentRow } from "./components/student-row";

const FILTERS: { key: StudentListFilter; label: string }[] = [
	{ key: "all", label: "전체" },
	{ key: "active", label: "활성" },
	{ key: "no_consent", label: "동의 미제출" },
	{ key: "archived", label: "보관됨" },
];

export default async function StudentsPage({
	searchParams,
}: {
	searchParams: Promise<{ filter?: string }>;
}) {
	const { academyId, role } = await requireAuth();
	const { filter: rawFilter } = await searchParams;
	const filter: StudentListFilter =
		rawFilter === "active" ||
		rawFilter === "no_consent" ||
		rawFilter === "archived"
			? rawFilter
			: "all";

	const rows = await listStudents(academyId, filter);
	const canManage = role === "owner" || role === "admin";

	return (
		<main className="px-4 py-6 max-w-2xl mx-auto">
			<header className="mb-4 flex items-center justify-between">
				<h1 className="text-xl font-bold">학생 목록</h1>
				{canManage && (
					<Link
						href="/students/new"
						className={cn(buttonVariants({ size: "sm" }))}
					>
						학생 추가
					</Link>
				)}
			</header>
			<nav className="mb-4 flex gap-2">
				{FILTERS.map((f) => (
					<Link
						key={f.key}
						href={`/students?filter=${f.key}`}
						className={`text-sm rounded-full px-3 py-1 ${
							filter === f.key
								? "bg-primary text-primary-foreground"
								: "bg-muted"
						}`}
					>
						{f.label}
					</Link>
				))}
			</nav>
			{rows.length === 0 ? (
				<div className="text-center py-12 text-muted-foreground">
					<p>
						{filter === "all" || filter === "active"
							? "첫 학생을 추가해 보세요"
							: "해당하는 학생이 없습니다"}
					</p>
					{(filter === "all" || filter === "active") && canManage && (
						<Link href="/students/new" className={cn(buttonVariants(), "mt-4")}>
							학생 추가
						</Link>
					)}
				</div>
			) : (
				<ul className="space-y-2">
					{rows.map((row) => (
						<StudentRow key={row.id} student={row} />
					))}
				</ul>
			)}
		</main>
	);
}
