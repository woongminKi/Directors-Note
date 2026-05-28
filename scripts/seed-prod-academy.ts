/**
 * Prod seed — insert ONE academies row for the friend academy and nothing
 * else. No test users, no test students, no fixtures. The friend's
 * auth.users row is created when they complete Kakao OAuth; the matching
 * public.users row is inserted manually (Phase 2 owner seed) referencing
 * the academy UUID printed by this script.
 *
 * Idempotent by name: re-running with the same name prints the existing
 * UUID instead of inserting a duplicate.
 *
 * Required env (from .env.local pointing at the PROD Supabase):
 *   - DATABASE_URL (prod pooled connection string)
 *
 * Run:
 *   bun --env-file=.env.local.prod run db:seed-prod-academy
 *   bun --env-file=.env.local.prod run db:seed-prod-academy --name "다른 학원명"
 */

import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { academies } from "../src/lib/db/schema";

const DEFAULT_NAME = "카타르시스 연기학원";

function parseArgs(): { name: string } {
	const args = process.argv.slice(2);
	const nameIdx = args.indexOf("--name");
	const name =
		nameIdx >= 0 && args[nameIdx + 1] ? args[nameIdx + 1] : DEFAULT_NAME;
	return { name };
}

async function main() {
	const { name } = parseArgs();

	const databaseUrl = process.env.DATABASE_URL;
	if (!databaseUrl) {
		console.error(
			"Missing DATABASE_URL. Run with --env-file pointing at the prod env file.",
		);
		process.exit(1);
	}

	const pg = postgres(databaseUrl, { prepare: false, max: 2 });
	const db = drizzle(pg);

	try {
		console.log("=== seed-prod-academy ===");
		console.log(`Academy name: ${name}`);

		const existing = await db
			.select({ id: academies.id, name: academies.name })
			.from(academies)
			.where(eq(academies.name, name));

		if (existing.length > 0) {
			console.log(`Academy already exists: ${existing[0]?.id}`);
			console.log("Idempotent skip — no INSERT performed.");
			return;
		}

		const [inserted] = await db
			.insert(academies)
			.values({ name })
			.returning({ id: academies.id, name: academies.name });

		if (!inserted) {
			throw new Error("INSERT returned no row");
		}

		console.log("=========================================");
		console.log(`Created academy: ${inserted.id}`);
		console.log(`Name:            ${inserted.name}`);
		console.log("=========================================");
		console.log("\nNext step — Phase 2 owner seed (after friend's first Kakao OAuth):");
		console.log("  In Supabase SQL Editor (prod project):");
		console.log("    SELECT id FROM auth.users WHERE email = '<friend email>';");
		console.log("    INSERT INTO public.users (id, academy_id, role, email, display_name)");
		console.log(`    VALUES ('<auth.users.id>', '${inserted.id}', 'owner', '<email>', '<name>');`);
	} finally {
		await pg.end();
	}
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
