// Invite UI is disabled in v1 — see TODOS.md "Deferred from T30 (2026-05-10)".
// Pre-creating auth.users via inviteUserByEmail can produce a different
// auth.users.id when the invitee later signs in via Kakao OAuth (Supabase
// does not auto-link identities by email unless "Allow account linking" is
// enabled in the dashboard). The id-mismatch check in /auth/callback would
// then reject the legitimate invitee.
//
// v1 pilot is single-academy single-owner; coaches (if any) are seeded
// manually via Phase 2 owner seed pattern in docs/production-deploy-plan.md.

export default function InviteUserPage() {
	return (
		<main className="px-4 py-6 max-w-md mx-auto space-y-4">
			<h1 className="text-xl font-bold">코치 초대</h1>
			<div className="rounded border-l-4 border-amber-500 bg-amber-50 p-4 text-sm">
				<p className="font-semibold mb-1">
					v1에서는 초대 폼이 비활성화되어 있습니다.
				</p>
				<p className="text-muted-foreground">
					현재 버전은 단일 학원·단일 코치 파일럿용입니다. 추가 코치가 필요하다면
					관리자에게 문의해 주세요. 수동 등록 절차는 운영 문서에 정리되어
					있습니다.
				</p>
			</div>
		</main>
	);
}
