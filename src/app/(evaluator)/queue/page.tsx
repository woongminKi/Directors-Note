import { QueueCard } from "@/app/(coach)/dashboard/components/queue-card";
import { PushOptIn } from "@/components/notifications/push-opt-in";
import { InstallPrompt } from "@/components/pwa/install-prompt";
import { getEvaluatorOpenAssignments } from "@/lib/assignment/evaluator-queue";
import { requireEvaluator } from "@/lib/auth/require-evaluator";
import { fetchEvaluatorQueueRows } from "./actions";
import { evaluatorQueueToRow } from "./row-mapper";

export const dynamic = "force-dynamic";

// WS5.3 — 평가자 채점 큐. 본인 오픈 배정만 QueueCard(폴링)로 표시.
export default async function EvaluatorQueuePage() {
	const user = await requireEvaluator();
	const items = await getEvaluatorOpenAssignments(user.appUser.id);
	const initialRows = items.map(evaluatorQueueToRow);

	return (
		<div className="space-y-4">
			<div>
				<div className="flex items-center justify-between gap-2">
					<h1 className="text-xl font-bold">채점 큐</h1>
					<div className="flex items-center gap-2">
						<PushOptIn />
						<InstallPrompt />
					</div>
				</div>
				<p className="text-sm text-muted-foreground">
					배정된 영상을 열어 4축 루브릭으로 채점해 주세요.
				</p>
			</div>
			<QueueCard
				title="배정된 채점"
				queryKey={["evaluator-queue", user.appUser.id]}
				fetcher={fetchEvaluatorQueueRows}
				emptyVariant="evaluator-queue"
				pollIntervalMs={30_000}
				initialData={initialRows}
			/>
		</div>
	);
}
