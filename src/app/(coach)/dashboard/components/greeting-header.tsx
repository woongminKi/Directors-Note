interface Props {
	displayName: string;
	pendingTaskCount: number;
}

export function GreetingHeader({ displayName, pendingTaskCount }: Props) {
	return (
		<header className="flex items-baseline justify-between gap-3 border-b pb-3">
			<h1 className="text-lg font-semibold">
				안녕하세요, {displayName} 코치님
			</h1>
			<p className="text-sm text-muted-foreground">
				오늘 작업{" "}
				<span className="font-medium text-foreground">{pendingTaskCount}</span>
				건
			</p>
		</header>
	);
}
