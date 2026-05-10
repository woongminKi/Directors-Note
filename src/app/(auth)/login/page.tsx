import { LoginButton } from "./login-button";

export default function LoginPage({
	searchParams,
}: {
	searchParams: Promise<{ next?: string }>;
}) {
	return (
		<main className="flex min-h-screen items-center justify-center px-4">
			<div className="w-full max-w-sm space-y-6 text-center">
				<h1 className="text-2xl font-bold">Director's Note</h1>
				<p className="text-sm text-muted-foreground">학원 코치 전용 로그인</p>
				<LoginButton searchParamsPromise={searchParams} />
			</div>
		</main>
	);
}
