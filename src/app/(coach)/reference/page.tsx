import { Badge } from "@/components/ui/badge";
import { requireRole } from "@/lib/auth/require-role";
import { listReferenceVideos } from "@/lib/reference/queries";
import { DeleteReferenceButton } from "./delete-reference-button";
import { ReferenceUploadForm } from "./reference-upload-form";

// Reference embedding (Vertex ~12s) runs in a server action on this segment.
export const maxDuration = 300;

export default async function ReferencePage() {
	const { academyId } = await requireRole(["owner", "admin"]);
	const refs = await listReferenceVideos(academyId);

	return (
		<main className="px-4 py-6 max-w-2xl mx-auto space-y-6">
			<header>
				<h1 className="text-xl font-bold">평가 기준 영상</h1>
				<p className="text-sm text-muted-foreground">
					학생 영상은 여기 등록된 기준 영상과 코사인 매칭으로 평가됩니다.
					tier·장면 유형별로 다양하게 등록할수록 등급이 정교해집니다.
				</p>
			</header>

			<ReferenceUploadForm />

			<section className="space-y-2">
				<h2 className="text-sm font-semibold">등록된 기준 ({refs.length})</h2>
				{refs.length === 0 ? (
					<p className="text-sm text-muted-foreground">
						아직 기준 영상이 없습니다. 위에서 추가하세요.
					</p>
				) : (
					<ul className="space-y-2">
						{refs.map((r) => (
							<li
								key={r.id}
								className="flex items-center justify-between rounded-lg border bg-card p-3"
							>
								<div className="flex items-center gap-3">
									<Badge>{r.level}급</Badge>
									<div>
										<p className="text-sm font-medium">{r.sceneType}</p>
										{r.techniqueTag && (
											<p className="text-xs text-muted-foreground">
												{r.techniqueTag}
											</p>
										)}
									</div>
								</div>
								<DeleteReferenceButton id={r.id} />
							</li>
						))}
					</ul>
				)}
			</section>
		</main>
	);
}
