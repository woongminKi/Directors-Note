import "server-only";
import { redirect } from "next/navigation";
import { type CurrentUser, getCurrentUser } from "@/lib/auth/current-user";

// 학원 소속(academy_id NOT NULL)이 보장된 사용자. B2B(owner/coach/admin) 경로용.
// 0014 에서 academy_id 가 nullable 로 풀리며 소비자/평가자는 academyId=null —
// 이들은 별도 인테이크 경로(WS3+)를 쓰고, 기존 학원 페이지엔 진입하지 않는다.
export type AcademyUser = Omit<CurrentUser, "academyId"> & {
	academyId: string;
};

export async function requireAuth(): Promise<AcademyUser> {
	const user = await getCurrentUser();
	if (!user) redirect("/login");
	// B2B 페이지는 학원 소속을 전제. academy 없는 계정(소비자/평가자)은 로그인 경유.
	if (user.academyId === null) redirect("/login");
	return user as AcademyUser;
}
