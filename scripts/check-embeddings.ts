#!/usr/bin/env bun
/**
 * 읽기 전용 임베딩 분석 스크립트. 같은 영상을 여러 reference 로 시드했는지,
 * 3파트 분할이 실제로 다른 내용을 담는지 cosine 유사도로 역추적.
 * Usage: DATABASE_URL=... bun run scripts/check-embeddings.ts
 */
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
	console.error("DATABASE_URL 미설정");
	process.exit(1);
}

const sql = postgres(url, { prepare: false, max: 1 });
const r3 = (v: unknown) => Number(v).toFixed(4);

try {
	const host = url.replace(/.*@([^/]+)\/.*/, "$1");
	console.log(`\n=== DB: ${host} ===`);

	// 1) part 별 카운트
	const byPart = await sql`
		SELECT part_index, count(*) AS rows,
		       count(DISTINCT source_reference_video_id) AS ref_videos
		FROM embeddings
		WHERE source_type = 'reference_video'
		GROUP BY part_index ORDER BY part_index
	`;
	console.log("\n[ reference part 별 행 수 ]");
	console.table(byPart.map((x) => ({ part: x.part_index, rows: Number(x.rows), ref_videos: Number(x.ref_videos) })));

	// 2) WITHIN-PART: 같은 part 의 서로 다른 영상 벡터 간 cosine 유사도
	//    같은 영상을 여러 번 시드했다면 ≈ 1.0 이어야 함.
	const within = await sql`
		SELECT a.part_index AS part,
		       count(*) AS pairs,
		       min(1 - (a.vector <=> b.vector))::numeric AS min_sim,
		       avg(1 - (a.vector <=> b.vector))::numeric AS avg_sim,
		       max(1 - (a.vector <=> b.vector))::numeric AS max_sim
		FROM embeddings a
		JOIN embeddings b
		  ON a.part_index = b.part_index
		 AND a.source_type = 'reference_video'
		 AND b.source_type = 'reference_video'
		 AND a.id < b.id
		GROUP BY a.part_index ORDER BY a.part_index
	`;
	console.log("\n[ WITHIN-PART: 같은 part, 다른 영상 간 cosine (≈1 이면 동일 영상) ]");
	console.table(
		within.map((x) => ({
			part: x.part,
			pairs: Number(x.pairs),
			min_sim: r3(x.min_sim),
			avg_sim: r3(x.avg_sim),
			max_sim: r3(x.max_sim),
		})),
	);

	// 3) CROSS-PART: 같은 영상 내 서로 다른 part 간 cosine (낮을수록 내용 차이 큼)
	const cross = await sql`
		SELECT a.part_index AS pa, b.part_index AS pb,
		       count(*) AS pairs,
		       avg(1 - (a.vector <=> b.vector))::numeric AS avg_sim
		FROM embeddings a
		JOIN embeddings b
		  ON a.source_reference_video_id = b.source_reference_video_id
		 AND a.source_type = 'reference_video'
		 AND a.part_index < b.part_index
		GROUP BY a.part_index, b.part_index ORDER BY a.part_index, b.part_index
	`;
	console.log("\n[ CROSS-PART: 같은 영상 내 part 간 cosine (낮을수록 파트 내용 상이) ]");
	console.table(cross.map((x) => ({ pair: `part${x.pa}↔part${x.pb}`, pairs: Number(x.pairs), avg_sim: r3(x.avg_sim) })));

	// 4) 벡터 노름 / 샘플값 — 정규화 여부 등 추가 단서
	const norms = await sql`
		SELECT part_index AS part,
		       avg(sqrt((SELECT sum(v*v) FROM unnest(vector::real[]) AS v)))::numeric AS avg_l2
		FROM embeddings WHERE source_type = 'reference_video'
		GROUP BY part_index ORDER BY part_index
	`;
	console.log("\n[ part 별 평균 L2 norm ]");
	console.table(norms.map((x) => ({ part: x.part, avg_l2: r3(x.avg_l2) })));
} catch (e) {
	console.error("쿼리 실패:", e instanceof Error ? e.message : e);
	process.exitCode = 1;
} finally {
	await sql.end();
}
