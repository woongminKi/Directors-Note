# Video Analysis UI — Design Spec (2026-05-29)

## Context
`FEATURE_AI_VIDEO_ANALYSIS=true` now enabled (localhost + prod). The video flow
(`/evaluation/[id]`) is wired but the UI is bare: a raw `<input type=file>`, then
`/review` shows only the AI letter, not the analysis result. Backend verified to
run within limits (Fluid Compute, maxDuration=300; pipeline ~20-25s).

## Goal
1. A polished page to upload a video and watch the analysis progress.
2. Surface the AI analysis result (coach-only) before the letter editor.

## Scope (3 pieces)

### 1. Upload UI — `video-upload-flow.tsx`
- Replace native input with a **styled dropzone**: dashed card, drag-and-drop +
  click-to-select, accepted-formats hint, drag-over highlight.
- On select: show **filename + size**.
- **Upload progress bar (%)** — switch the `fetch` PUT to `XMLHttpRequest` to read
  `upload.onprogress`.
- Phases: idle (dropzone) → uploading (progress) → ready (분석 시작) → streaming →
  complete/error. Reuse `createSignedUploadUrl` / `attachVideoToEvaluation`.
- Keep existing error → "메모로 진행" fallback.

### 2. Progress timeline — `streaming-timeline.tsx`
- Already the locked vertical timeline (A안). Light touch: add an "AI 분석 중…"
  header. No logic change.

### 3. Result section — new `analysis-result.tsx` + wire into `review/page.tsx`
- Coach-only card above `ReviewEditor`, rendered when `evaluation.aiAnalysis` exists:
  - Internal grade (tier A–D) badge
  - 3 axis scores (발성/표정/입시완성도) /10 via Progress bars
  - Calibration match score + evaluatorUsed (cosine/llm) + cosineConfidence
  - Top reference matches (from `rawResponseJson.topMatches`, if present): tier +
    sceneType + cosine %
  - "🔒 코치 전용 · 부모에게 노출되지 않습니다" note (P2)
- Data: `getEvaluation` already loads `aiAnalysis` (drizzle relation). No new query.
- If `aiAnalysis` is null (Approach-A bullet path / failed analysis), section hidden.

## Constraints
- P2: AI internal grade is coach-facing only. `/review` is auth-gated (coach/owner);
  parents see `/feedback/[token]` (letter only). Result section never appears parent-side.
- Numeric DB columns return as `string | null` in drizzle — parse for display, guard nulls.

## Out of scope
- Async/background processing (TODOS: >500 evals/month trigger).
- Reference library admin UI (TODOS).
- Changing the analysis pipeline itself.

## Verification
- lint + typecheck + build clean.
- Component renders with a populated aiAnalysis; hidden when null.
- Deploy; real end-to-end upload test on prod confirms SSE + analysis completion.
