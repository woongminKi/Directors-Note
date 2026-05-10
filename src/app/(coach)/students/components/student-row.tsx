import Link from "next/link";

type Student = {
	id: string;
	name: string;
	year: string | null;
	parentConsentOnFileAt: Date | null;
	lastEvalDate: string | null;
};

export function StudentRow({ student }: { student: Student }) {
	return (
		<li>
			<Link
				href={`/students/${student.id}`}
				className="flex items-center justify-between rounded border p-3 hover:bg-muted"
			>
				<div className="flex-1">
					<p className="font-medium">{student.name}</p>
					<p className="text-xs text-muted-foreground">
						{student.year ?? "구분 미입력"} ·{" "}
						{student.parentConsentOnFileAt ? "동의 ✓" : "동의 미제출"}
					</p>
				</div>
				<p className="text-xs text-muted-foreground">
					{student.lastEvalDate ?? "평가 없음"}
				</p>
			</Link>
		</li>
	);
}
