// src/app/(coach)/dashboard/page.tsx
import { requireAuth } from "@/lib/auth/require-auth";
import {
	getAcademyMiniStats,
	getEscalationData,
	getEvaluationTodo,
	getOwnerCoachProgress,
	getReviewPending,
	getSentRecent,
} from "@/lib/dashboard/queries";
import {
	evalTodoToRow,
	reviewPendingToRow,
	sentToRow,
} from "@/lib/dashboard/row-mappers";
import {
	fetchCoachProgress,
	fetchEscalation,
	fetchEvalTodoRows,
	fetchReviewPendingRows,
	fetchSentItems,
	fetchSentRows,
} from "./actions";
import { GreetingHeader } from "./components/greeting-header";
import { MiniStats } from "./components/mini-stats";
import { OwnerStatusRow } from "./components/owner-status-row";
import { QueueCard } from "./components/queue-card";
import { RecentActivity } from "./components/recent-activity";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
	const user = await requireAuth();
	const isOwner = user.role === "owner" || user.role === "admin";

	const [
		stats,
		evalTodo,
		reviewPending,
		sentRecent,
		coachProgress,
		escalation,
	] = await Promise.all([
		getAcademyMiniStats(user.academyId),
		getEvaluationTodo(user.academyId, user.appUser.id),
		getReviewPending(user.academyId, user.appUser.id),
		getSentRecent(user.academyId, user.appUser.id),
		isOwner ? getOwnerCoachProgress(user.academyId) : Promise.resolve(null),
		isOwner ? getEscalationData(user.academyId) : Promise.resolve(null),
	]);

	const displayName = user.appUser.email.split("@")[0] ?? "사용자";
	const pendingTaskCount = evalTodo.length + reviewPending.length;

	const evalTodoRows = evalTodo.map(evalTodoToRow);
	const reviewPendingRows = reviewPending.map(reviewPendingToRow);
	const sentRows = sentRecent.map(sentToRow);

	return (
		<div className="space-y-4">
			{isOwner && coachProgress && escalation && (
				<OwnerStatusRow
					academyId={user.academyId}
					initialCoaches={coachProgress}
					initialEscalation={escalation}
					fetchCoaches={fetchCoachProgress}
					fetchEscalation={fetchEscalation}
				/>
			)}

			<GreetingHeader
				displayName={displayName}
				pendingTaskCount={pendingTaskCount}
			/>
			<MiniStats
				totalStudents={stats.totalStudents}
				thisMonthCompleted={stats.thisMonthCompleted}
				cycleDeadline={stats.cycleDeadline}
			/>

			<div className="grid grid-cols-1 gap-4 md:grid-cols-3">
				<QueueCard
					title="평가 시작"
					queryKey={["queue", "eval-todo", user.appUser.id]}
					fetcher={fetchEvalTodoRows}
					emptyVariant="eval-todo"
					pollIntervalMs={30_000}
					initialData={evalTodoRows}
				/>
				<QueueCard
					title="검토 대기"
					queryKey={["queue", "review-pending", user.appUser.id]}
					fetcher={fetchReviewPendingRows}
					emptyVariant="review-pending"
					pollIntervalMs={10_000}
					initialData={reviewPendingRows}
				/>
				<QueueCard
					title="발송 완료"
					queryKey={["queue", "sent", user.appUser.id]}
					fetcher={fetchSentRows}
					emptyVariant="sent"
					pollIntervalMs={60_000}
					initialData={sentRows}
				/>
			</div>

			<RecentActivity
				queryKey={["activity", user.appUser.id]}
				fetcher={fetchSentItems}
				initialData={sentRecent}
			/>
		</div>
	);
}
