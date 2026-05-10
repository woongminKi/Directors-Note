export function ExpiredOrInvalid() {
	return (
		<main className="flex min-h-screen items-center justify-center px-4 text-center">
			<div className="max-w-md space-y-3">
				<h1 className="text-xl font-bold">
					만료되었거나 유효하지 않은 링크입니다
				</h1>
				<p className="text-sm text-muted-foreground">
					학원에 문의하여 새 링크를 받아 주세요.
				</p>
			</div>
		</main>
	);
}
