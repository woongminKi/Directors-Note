import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function NotInvitedPage() {
	return (
		<main className="flex min-h-screen items-center justify-center px-4 text-center">
			<div className="max-w-md space-y-4">
				<h1 className="text-xl font-bold">초대된 사용자가 아닙니다</h1>
				<p className="text-sm text-muted-foreground">
					이 이메일로 등록된 사용자가 없습니다. 학원 관리자에게 문의해 주세요.
				</p>
				<Link
					href="/login"
					className={cn(buttonVariants({ variant: "secondary" }))}
				>
					로그인 화면으로
				</Link>
			</div>
		</main>
	);
}
