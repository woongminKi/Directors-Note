import { notFound, redirect } from "next/navigation";
import { requireAuth } from "@/lib/auth/require-auth";
import { updateStudent } from "@/lib/students/actions";
import { getStudent } from "@/lib/students/queries";
import type { StudentFormInput } from "@/lib/students/schema";
import { StudentForm } from "../../components/student-form";

export default async function EditStudentPage({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	const { id } = await params;
	const { academyId, role } = await requireAuth();
	const student = await getStudent(academyId, id);
	if (!student) notFound();

	const canEditConsent = role === "owner" || role === "admin";

	async function action(input: StudentFormInput) {
		"use server";
		const res = await updateStudent(id, input);
		if (res.ok) redirect(`/students/${id}`);
		return res;
	}

	return (
		<main className="px-4 py-6 max-w-md mx-auto">
			<h1 className="text-xl font-bold mb-6">{student.name} 정보 수정</h1>
			<StudentForm
				defaultValues={{
					name: student.name,
					year: student.year ?? "",
					parentConsentOnFile: !!student.parentConsentOnFileAt,
				}}
				canEditConsent={canEditConsent}
				submitLabel="저장"
				onSubmit={action}
			/>
		</main>
	);
}
