# Reference Library Admin UI — Design Spec (2026-05-29)

## Goal
Let owners/admins manage the academy's evaluation-criteria (reference) videos from
the web — currently only possible via the `seed-reference-video.ts` CLI. More
references across tiers/scene-types → meaningful cosine grading.

## Decisions (user-approved)
- **Access:** owner/admin only (`requireRole(['owner','admin'])`).
- **Upload UX:** simple loading (upload progress + "처리 중…" spinner), not the SSE timeline.
- **scene_type:** fixed `<select>` of common types + a "직접 입력" free-text fallback.
- **Delete:** hard delete with a confirm dialog (references are not PII).

## Route
`/reference` → `src/app/(coach)/reference/page.tsx`, guarded with
`requireRole(['owner','admin'])` (shares coach nav/layout). Nav link "평가 기준"
added to `(coach)/layout.tsx`, shown only when `isOwner`.
Page segment: `export const maxDuration = 300` (Vertex embed ~12s; Fluid default
already 300s — explicit for drift-safety).

## Data flow (mirrors seed-reference-video.ts; script NOT refactored, to keep it safe)
1. Client uploads the video to Supabase Storage `student-videos/<academyId>/reference/<uuid>.mp4`
   via a signed URL minted by `createReferenceUploadUrl` (service role; signed-URL
   upload bypasses RLS, same as the seed's service-role write).
2. Client calls `processReferenceVideo({ tier, sceneType, techniqueTag, storagePath })`:
   - download bytes from Supabase Storage (service role)
   - upload to GCS staging, call Vertex `multimodalembedding@001` → 1408d
   - **transaction**: INSERT `reference_videos (id, academy_id, level, scene_type,
     technique_tag, storage_url)` + INSERT `embeddings (academy_id,
     source_type='reference_video', source_reference_video_id, vector)` — **exact same
     shape as the seed** so the `search_reference_matches` cosine RPC keeps working.
   - GCS staging cleanup.
3. `deleteReferenceVideo(id)`: `DELETE FROM reference_videos WHERE id AND academy_id`
   — the only FK to reference_videos is `embeddings.source_reference_video_id ON
   DELETE CASCADE`, so the embedding row is removed automatically. Also delete the
   Supabase Storage object. Confirm dialog.

## Components / modules
- `src/lib/reference/queries.ts` — `listReferenceVideos(academyId)` (filtered by
  academyId, like `listStudents` — multi-tenant safety).
- `src/lib/reference/embed.ts` — `createReferenceFromStorage(...)`: Supabase read →
  GCS → Vertex → transactional insert → GCS cleanup. Self-contained (parallels the
  seed; does not import/modify the seed script).
- `src/lib/reference/actions.ts` — `createReferenceUploadUrl`, `processReferenceVideo`,
  `deleteReferenceVideo`. All `requireRole(['owner','admin'])`. `revalidatePath('/reference')`.
- `src/app/(coach)/reference/page.tsx` — list + form (server).
- `.../reference-upload-form.tsx` — client: tier select, scene_type select+custom,
  technique_tag input, dropzone + progress (reuse video-upload-flow pattern), processing state.
- `.../reference-row.tsx` + `.../delete-reference-button.tsx` — list row + confirm delete.

## Side-effects verified (see double-check)
- Delete is clean (single CASCADE FK; no other refs; past evaluations unaffected —
  analysis is stored once at eval time; topMatches ids in JSON are not FKs).
- Adding/removing references changes FUTURE grading only (intended), never retroactive.
- embeddings CHECK: reference rows need source_reference_video_id NOT NULL +
  source_evaluation_id NULL — satisfied by the 4-column insert.

## Out of scope
- Editing a reference's metadata in place (delete + re-add for now).
- Bulk upload. Scene-type taxonomy management.
- Refactoring the seed script.

## Verification
- lint + typecheck + build clean.
- Deploy; owner uploads 2-3 references across tiers on prod; confirm list + a student
  analysis now matches against the richer set.
