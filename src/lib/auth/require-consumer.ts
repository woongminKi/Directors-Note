import "server-only";
import { redirect } from "next/navigation";
import { type CurrentUser, getCurrentUser } from "@/lib/auth/current-user";

// 소비자(role='consumer', academy_id=null) 전용 가드 — WS3.
// requireAuth 는 academy_id=null 계정을 /login 으로 보내므로 B2C 경로엔 부적합.
// 미인증 → 소비자 로그인(/submit 복귀)으로, 비-소비자 역할 → 홈으로.
export type ConsumerUser = CurrentUser & { academyId: null; role: "consumer" };

export async function requireConsumer(
	redirectTo = "/submit",
): Promise<ConsumerUser> {
	const user = await getCurrentUser();
	if (!user) redirect(`/submit/login?next=${encodeURIComponent(redirectTo)}`);
	if (user.role !== "consumer") redirect("/");
	return user as ConsumerUser;
}
