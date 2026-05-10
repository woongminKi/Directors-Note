import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "@/lib/env";
import * as schema from "./schema";

// postgres.js client — Supabase Postgres direct connection
// Drizzle 의 query builder + RLS context 통합 (auth.uid() 통해 SET LOCAL)
const client = postgres(env.DATABASE_URL, {
	prepare: false, // Supabase Pooler 호환
	max: 10,
});

// schema 를 전달해야 db.query.<table>.findFirst() 등 relational query API 사용 가능
export const db = drizzle(client, { schema });

// RLS context 적용 helper — Supabase Auth 세션의 auth.uid() 를 transaction 안에 set
// Supabase JS client 사용 시엔 자동, 직접 postgres 연결할 때만 필요.
// NOTE: tx 객체는 db 와 같은 query API 를 가지지만 타입은 다름. unknown cast 로 우회.
export async function withUserContext<T>(
	userId: string,
	fn: (tx: typeof db) => Promise<T>,
): Promise<T> {
	return db.transaction(async (tx) => {
		await tx.execute(
			`SELECT set_config('request.jwt.claim.sub', '${userId}', true)`,
		);
		return fn(tx as unknown as typeof db);
	});
}
