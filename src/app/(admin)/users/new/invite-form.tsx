"use client";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { InviteUserResult } from "./actions";

type Props = {
	action: (
		prev: InviteUserResult | null,
		formData: FormData,
	) => Promise<InviteUserResult>;
};

export function InviteForm({ action }: Props) {
	const [state, formAction, pending] = useActionState(action, null);

	return (
		<form action={formAction} className="space-y-3">
			{state && !state.ok && (
				<p className="text-sm text-destructive">{state.error}</p>
			)}
			<label htmlFor="invite-email" className="block text-sm">
				이메일
				<Input id="invite-email" name="email" type="email" required />
			</label>
			<label htmlFor="invite-role" className="block text-sm">
				권한
				<select
					id="invite-role"
					name="role"
					className="w-full rounded border p-2 text-sm"
				>
					<option value="coach">코치</option>
					<option value="admin">관리자</option>
				</select>
			</label>
			<Button type="submit" className="w-full" disabled={pending}>
				초대
			</Button>
		</form>
	);
}
