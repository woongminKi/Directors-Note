"use client";
import { use } from "react";
import { Button } from "@/components/ui/button";
import { signInWithKakao } from "@/lib/auth/kakao";

export function ConsumerLoginButton({
	searchParamsPromise,
}: {
	searchParamsPromise: Promise<{ next?: string }>;
}) {
	const { next } = use(searchParamsPromise);
	return (
		<Button
			className="w-full bg-[#FEE500] text-[#000000d9] hover:bg-[#FFEB3B]"
			onClick={() => signInWithKakao(next ?? "/submit")}
		>
			카카오로 시작하기
		</Button>
	);
}
