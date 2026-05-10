import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/require-role";
import { createStudent } from "@/lib/students/actions";
import type { StudentFormInput } from "@/lib/students/schema";
import { StudentForm } from "../components/student-form";

export default async function NewStudentPage() {
	await requireRole(["owner", "admin"]);

	async function action(input: StudentFormInput) {
		"use server";
		const res = await createStudent(input);
		if (res.ok && res.data) redirect(`/students/${res.data.id}`);
		return res;
	}

	return (
		<main className="px-4 py-6 max-w-md mx-auto">
			<h1 className="text-xl font-bold mb-6">학생 추가</h1>
			<StudentForm canEditConsent submitLabel="추가" onSubmit={action} />
		</main>
	);
}
