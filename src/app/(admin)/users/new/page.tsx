import { inviteUserAction } from "./actions";
import { InviteForm } from "./invite-form";

export default function InviteUserPage() {
	return (
		<main className="px-4 py-6 max-w-md mx-auto">
			<h1 className="text-xl font-bold mb-6">코치 초대</h1>
			<InviteForm action={inviteUserAction} />
		</main>
	);
}
