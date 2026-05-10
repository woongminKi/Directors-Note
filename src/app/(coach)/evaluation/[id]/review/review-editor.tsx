"use client";
export function ReviewEditor({
	draftId,
	initialText,
}: {
	draftId: string;
	initialText: string;
}) {
	return (
		<div>
			Stub editor for {draftId} (length: {initialText.length})
		</div>
	);
}
