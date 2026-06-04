import "server-only";
import { redirect } from "next/navigation";
import { type CurrentUser, getCurrentUser } from "@/lib/auth/current-user";

// 평가자(role='evaluator', academy_id=null) 전용 가드 — WS5.
// requireAuth 는 academy_id=null 계정을 /login 으로 보내므로 평가자 워크벤치엔
// 부적합. 미인증 → 로그인, 비-평가자 역할 → 홈으로.
export type EvaluatorUser = CurrentUser & { role: "evaluator" };

export async function requireEvaluator(
	redirectTo = "/queue",
): Promise<EvaluatorUser> {
	const user = await getCurrentUser();
	if (!user) redirect(`/login?next=${encodeURIComponent(redirectTo)}`);
	if (user.role !== "evaluator") redirect("/");
	return user as EvaluatorUser;
}
