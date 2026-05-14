import { env } from "@/lib/env";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { ExpiredOrInvalid } from "./expired-or-invalid";
import { ParentReportCard } from "./parent-report-card";

export const dynamic = "force-dynamic";

export default async function ParentFeedbackPage({
	params,
}: {
	params: Promise<{ token: string }>;
}) {
	const { token } = await params;
	const supabase = createServiceRoleClient();
	const { data, error } = await supabase.rpc("get_parent_feedback", {
		p_token: token,
		p_pepper: env.SHARE_LINK_PEPPER,
	});

	if (error || !data || (Array.isArray(data) && data.length === 0)) {
		return <ExpiredOrInvalid />;
	}

	const feedback = Array.isArray(data) ? data[0] : data;
	return <ParentReportCard feedback={feedback} />;
}
