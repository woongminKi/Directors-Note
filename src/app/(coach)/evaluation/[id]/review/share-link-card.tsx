"use client";
export function ShareLinkCard({
	shareUrl,
	expiresAt,
}: {
	shareUrl: string;
	expiresAt: Date;
}) {
	return (
		<div>
			Stub share card for {shareUrl} until {String(expiresAt)}
		</div>
	);
}
