# Director's Note v1 — 학생/평가/Letter 흐름 디자인

**Date:** 2026-05-10
**Status:** Approved (brainstorming session 통과)
**Source-of-truth refs:**
- 디자인 doc: `~/.gstack/projects/directors-note/kiwoongmin-unknown-design-20260509-203619.md` (APPROVED)
- 스택 lock: `~/.gstack/projects/directors-note/frontend-stack-v1.md`
- 스키마: `~/.gstack/projects/directors-note/schema-v1.md` (0001/0002 적용 완료)
- 평가 인터페이스: `~/.gstack/projects/directors-note/evaluation-interface-v1.md`
- 코치 불릿 폼: `~/.gstack/projects/directors-note/coach-bullet-form-spec.md`
- Dashboard plan (DEFERRED): `~/.gstack/projects/directors-note/coach-dashboard-plan.md`

---

## 1. Goal

v1 demo path 구현: **owner 가 user pre-seed → 코치 Kakao OAuth 로그인 → 학생 목록 → 평가 시작 → 코치 불릿 (Approach-A) 또는 영상 업로드 (Approach-C, stub) → AI letter 검토·편집 → 승인·발송 → 부모 share-link 열람**.

이전에 deferred 된 dashboard plan 이 요약하는 데이터 sources 를 모두 실재화시킴.

## 2. Scope

### In scope

1. **Auth** — Kakao OAuth (`@supabase/ssr`), pre-seeded `users` rows, 콜백에서 academy 해석, "not invited" 폴백.
2. **Students CRUD** — 목록, 상세, 생성, 수정, 보관(soft-delete). Owner-only 동의 토글.
3. **Evaluation start** — server action 이 `evaluations` row 생성, `FEATURE_AI_VIDEO_ANALYSIS` 플래그로 분기.
4. **Approach-A (flag OFF)** — 기존 코치 불릿 폼 그대로 유지, redirect 경로만 review 로 정렬.
5. **Approach-C (flag ON, stub-driven)** — 영상 업로드 페이지 + SSE Route Handler + `StubVideoAnalysisService` wiring.
6. **Review/send** — `/evaluation/[id]/review` 인라인 편집 + 1-click 승인·발송, share-link 토큰 생성, `draft → sent` 전환.
7. **Parent landing** — `/feedback/[token]/page.tsx` 가 `get_parent_feedback` RPC 호출하도록 wiring.
8. **Schema migration `0003_students_year.sql.draft`** — `students` 테이블에 `year text` 컬럼 추가.

### Out of scope (지명, 후일)

- Vertex 실제 호출 (D6 PIPA gate)
- Reference video admin UI (manual GDrive 폴더 — Step-0 refinement)
- Coach dashboard `/dashboard` (이 spec ship 후 deferred plan 재개)
- Owner approval gate (intermediate `approved` status — schema 보존, v1 action 미사용)
- Kakao Share SDK (그냥 URL copy)
- Parent contact 저장 / auto-DM
- Parent consent artifact upload (owner attestation 토글만)
- Multi-academy / academy switcher

## 3. Architecture overview

```
┌─────────────┐         ┌──────────────────────┐         ┌──────────────┐
│  Coach UI   │────────▶│  Server Actions      │────────▶│  Supabase    │
│ (Next.js)   │         │  (auth-guarded)      │         │  (RLS-       │
│             │         │  • startEvaluation   │         │  enforced)   │
│             │         │  • submitBullets     │         │              │
│             │         │  • finalizeAndSend   │         │  • students  │
│             │         │  • archiveStudent    │         │  • evals     │
│             │         │                      │         │  • drafts    │
│  ┌────────┐ │  SSE    │  Route Handler       │  fetch  │  • emb       │
│  │ Stream │◀┼─────────│  /api/evaluations/   │◀────────│              │
│  │ UI     │ │         │  [id]/stream        │         │              │
│  └────────┘ │         │  → Stub video svc   │         │              │
└─────────────┘         │  → GPT-4o-mini      │         │              │
                        │  letter svc         │         │              │
                        └──────────────────────┘         └──────────────┘
                                                                ▲
┌─────────────┐         ┌──────────────────────┐               │
│  Parent UI  │────────▶│  get_parent_feedback │  service_role │
│ (no auth)   │  token  │  RPC (RLS bypass)    │───────────────┘
└─────────────┘         └──────────────────────┘
```

- **Coach 측 read/write**: `@supabase/ssr` server client → RLS 가 `my_academy_id()` 헬퍼로 academy 격리.
- **Parent 측 read**: `get_parent_feedback` RPC (SECURITY DEFINER, sha256+pepper hash check, status='sent', expiry check) — service-role client.
- **SSE**: Approach-C 만; `StubVideoAnalysisService` 가 4단계 progress 이벤트 emit.

## 4. Auth & Onboarding

### Routes

| Route | Type | Purpose |
|---|---|---|
| `/login` | Server Component | Kakao OAuth 버튼. `signInWithOAuth({ provider: 'kakao' })`. |
| `/auth/callback` | Route Handler | code → session 교환, email 로 users row 매칭, redirect. |
| `/auth/not-invited` | Server Component | 미초대 폴백. "학원 관리자에게 문의" + sign-out. |

### Onboarding 규칙

Owner 가 `users` rows 를 `email` + `academy_id` + `role` 로 pre-seed. 첫 Kakao 로그인 시 email 매칭 → `auth.users.id` attach.

### Callback 핸들러 로직 (`src/app/auth/callback/route.ts`)

```
1. supabase.auth.exchangeCodeForSession(code)            // 세션 쿠키 셋
2. const { user } = await supabase.auth.getUser()         // auth.users.id 확보
3. SELECT * FROM users WHERE email = user.email LIMIT 1
4a. row exists, row.id IS NULL              → UPDATE users SET id = user.id WHERE email = ... ; redirect /students
4b. row exists, row.id = user.id            → redirect /students
4c. row exists, row.id != user.id           → sign out + redirect /auth/not-invited
4d. row missing                              → sign out + redirect /auth/not-invited
```

### 모듈 구조

```
src/lib/auth/
├── current-user.ts        # getCurrentUser() — cookie 읽고 users row join, { auth_user, app_user, academy_id, role } 반환
├── require-auth.ts        # Server-only: 세션 없으면 redirect /login
├── require-role.ts        # require-role('owner' | 'admin'): 부족하면 redirect /students
└── kakao.ts               # signInWithKakao() 헬퍼

src/app/(coach)/layout.tsx # await requireAuth(); sidebar 렌더
src/app/(admin)/layout.tsx # await requireAuth(); await requireRole('owner'|'admin')
```

기존 `src/proxy.ts` + `src/lib/supabase/server.ts` 의 dev bypass (T1) 제거. `DEV_USER_ID` env 는 테스트 setup 에만 작동, runtime 에서는 무시.

### 신규 user 추가 (owner 전용)

`/(admin)/users/new` 의 작은 폼: owner 가 email + role 입력 → server action `INSERT INTO users (id=NULL, email, academy_id=my_academy_id(), role)`. 파일럿 6명 규모라서 충분.

## 5. Students CRUD

### Routes

| Route | Type | Purpose |
|---|---|---|
| `/students` | Server Component | 학원 학생 목록. 필터 칩: 활성 / 동의 미제출 / 보관됨. |
| `/students/new` | Server Component + Client form | 학생 추가. owner/admin 만. |
| `/students/[id]` | Server Component | 상세 + 최근 평가 + "시작하기" CTA. |
| `/students/[id]/edit` | Server Component + Client form | 수정. owner/admin 만. |

### 목록 화면

- Drizzle fetch: `SELECT id, name, year, parent_consent_on_file_at, last_eval_date, eval_count_this_month FROM students_with_eval_summary WHERE soft_deleted_at IS NULL ORDER BY name`. `_with_eval_summary` 는 쿼리 헬퍼 — DB view 가 아니라 학생별 최신 평가 left-join.
- 필터 칩: 활성 (default — `parent_consent_on_file_at IS NOT NULL`), 동의 미제출 (`parent_consent_on_file_at IS NULL`), 보관됨 (`soft_deleted_at IS NOT NULL`). URL search params 에 상태.
- Row: 이름 + year 배지 + 동의 ✓/⚠ + 최근 평가일.
- Empty: "첫 학생을 추가해 보세요" + "학생 추가" 버튼 (owner/admin only).
- 80 row flat — pagination 불필요.

### 상세 화면

```
┌────────────────────────────────┐
│ ◀ 박지윤                        │
│ 2년차 · 동의 ✓ 2026-04-20       │
├────────────────────────────────┤
│ [   시작하기 (이번 달 평가)   ] │  ← 동의 없으면 disabled
├────────────────────────────────┤
│ 최근 평가                       │
│ ─ 2026-04 발송 완료 (4/20)     │
│ ─ 2026-03 발송 완료 (3/15)     │
│ ─ 2026-02 발송 완료 (2/12)     │
├────────────────────────────────┤
│ [ 학생 정보 수정 ]              │  ← owner/admin only
│ [ 보관 (archive) ]              │  ← owner/admin only, confirm dialog
└────────────────────────────────┘
```

- "시작하기" → `startEvaluation(studentId)` server action.
- 최근 평가 row 탭 → `/evaluation/[id]/review`.
- "보관" → `archiveStudent(studentId)`: `soft_deleted_at = now()`, name anonymize (`STUDENT_DELETED_<id>`), `schema-v1.md §5` 흐름 그대로. 확인: "이 작업은 되돌릴 수 없습니다."

### 폼 (`/students/new`, `/students/[id]/edit`)

react-hook-form + Zod 공유 client 컴포넌트 `<StudentForm>`:

```ts
const studentFormSchema = z.object({
  name: z.string().min(1, "이름은 필수입니다").max(40),
  year: z.string().min(1).max(20).optional(),
  parent_consent_on_file: z.boolean().default(false),
});
```

- 같은 폼이 create 와 update 서빙 — wrapper 가 server action 만 다르게 선택.
- 동의 토글은 `requireRole(['owner','admin'])` 뒤 — coach role 은 read-only.
- Server action 이 `users.role` 독립 재검증 (RLS 가 role 을 gate 안 함).

### 모듈 구조

```
src/lib/students/
├── queries.ts             # listStudents, getStudent, getRecentEvaluations
├── actions.ts             # createStudent, updateStudent, archiveStudent
└── schema.ts              # studentFormSchema

src/app/(coach)/students/
├── page.tsx
├── new/page.tsx
├── [id]/page.tsx
├── [id]/edit/page.tsx
└── components/
    ├── student-form.tsx
    ├── student-row.tsx
    └── archive-confirm.tsx
```

### Application invariants

1. **No eval without consent**: `startEvaluation` 가 `parent_consent_on_file_at IS NOT NULL` 재확인 (RLS 외 — `schema-v1.md §3.3`).
2. **Archive owner/admin only**: server action + UI 양쪽 enforce.
3. **Soft-delete preserves history**: drafts/evaluations 보존 (read-only); name 만 anonymize. RLS 가 이미 `soft_deleted_at IS NULL` 만 SELECT.

## 6. Evaluation 흐름

### 6.1 라우트 맵

| Route | Type | When |
|---|---|---|
| `/evaluation/[id]` | Server Component | flag ON → 영상 업로드 + SSE (Approach-C stub) |
| `/evaluation/[id]/coach-form` | Server Component + Client form | flag OFF → 코치 불릿 (existing) |
| `/evaluation/[id]/review` | Server Component + Client editor | 양쪽 흐름 공통 종착점 — 검토·편집·승인·발송 |
| `/api/evaluations/[id]/stream` | Route Handler (SSE) | flag ON 만 |

### 6.2 평가 시작 (server action)

`/students/[id]` "시작하기" → `startEvaluation(studentId)`:

```ts
'use server'
export async function startEvaluation(studentId: string) {
  const { app_user, academy_id, role } = await requireAuth()

  // 1. 학생 검증 (RLS + app invariant)
  const student = await db.query.students.findFirst({
    where: (s, { eq, and, isNull }) => and(eq(s.id, studentId), isNull(s.soft_deleted_at)),
  })
  if (!student) throw new Error('학생을 찾을 수 없습니다')
  if (!student.parent_consent_on_file_at) {
    return { ok: false, error: 'no_consent' as const }
  }

  // 2. 같은 날 in-flight 평가 중복 방지
  const existing = await db.query.evaluations.findFirst({
    where: (e, { eq, and }) =>
      and(eq(e.student_id, studentId), eq(e.evaluation_date, today())),
    with: { feedback_draft: true },
  })
  if (existing && existing.feedback_draft?.status !== 'sent') {
    return { ok: true, evaluationId: existing.id, resumed: true }
  }

  // 3. INSERT evaluations
  const [row] = await db.insert(evaluations).values({
    academy_id,
    student_id: studentId,
    coach_user_id: app_user.id,
    evaluation_date: today(),
    video_storage_url: null,
    video_lifecycle_expires_at: addDays(today(), 30),
  }).returning()

  // 4. flag 보고 redirect
  const featureOn = process.env.FEATURE_AI_VIDEO_ANALYSIS === 'true'
  return {
    ok: true,
    evaluationId: row.id,
    redirectTo: featureOn ? `/evaluation/${row.id}` : `/evaluation/${row.id}/coach-form`,
  }
}
```

**Invariants:**
- 동의 없음 → 즉시 `error: 'no_consent'` (UI 가 student edit 페이지로 안내).
- (student_id, evaluation_date) 의 미발송 평가 있으면 resume — 두 번 클릭해도 row 1개로 수렴.

### 6.3 Approach-A (flag OFF — v1 기본)

기존 `(coach)/evaluation/[id]/coach-form/` scaffold 그대로. **단 한 군데 수정:**

- `actions.ts` 의 `submitCoachBulletEvaluation` 마지막 단계가 `redirect(/evaluation/${id}/review)` 로 이동 (현재 spec 의 `/coach/evaluations/...` 경로를 실제 라우트와 정렬).
- 폼 / Zod / KoreanCharCounter / autosave 모두 그대로.

### 6.4 Approach-C (flag ON — stub-driven)

#### `/evaluation/[id]/page.tsx`

상단: 학생 컨텍스트 + 평가일. 본문: `<VideoUploadFlow>`.

#### `<VideoUploadFlow>` (client)

```
[1] 영상 선택 (파일 입력 or 카메라 capture)
   → Supabase Storage pre-signed URL (≤30분) 으로 직접 multipart upload
   → upload 완료 시 evaluations.video_storage_url UPDATE (server action)
[2] "분석 시작" 버튼 → EventSource 로 /api/evaluations/[id]/stream 구독
[3] <StreamingTimeline> — 4-step 진행률 (수직 타임라인, 디자인 D7)
[4] step='complete' → router.push(`/evaluation/${id}/review`)
[5] step='error' → degrade banner + "메모로 진행" → /coach-form (D8)
```

`<StreamingTimeline>` 4단계는 `evaluation-interface-v1.md §2.3` 의 `ProgressEvent` 그대로:
1. `frames_extracted` (영상 프레임 추출)
2. `embedding_generated` (Vertex 임베딩 생성)
3. `matches_computed` (코치 기준 매칭 점수 계산)
4. `letter_drafting` → `complete` (한국어 피드백 초안 작성)

상태 전환 (Pending → Active pulsing → Done ✓): `~/.gstack/projects/directors-note/designs/streaming-progress-20260510/wireframe-A.html`.

#### `/api/evaluations/[id]/stream/route.ts`

`evaluation-interface-v1.md §8` 그대로 작성:

```ts
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const { app_user, academy_id } = await requireAuth()
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: ProgressEvent) => controller.enqueue(
        encoder.encode(`data: ${JSON.stringify(event)}\n\n`)
      )
      try {
        const videoSvc = createVideoAnalysisService()  // Stub or Vertex
        const letterSvc = createLetterGenerationService()
        const evaluation = await getEvaluation(params.id, academy_id)

        const analysis = await videoSvc.analyzeStreaming(
          { evaluationId: evaluation.id, academyId: academy_id, studentVideoUrl: evaluation.video_storage_url! },
          send,
        )
        await db.insert(aiAnalyses).values({ ...analysis, evaluation_id: evaluation.id, academy_id })

        send({ step: 'letter_drafting' })
        const letter = await letterSvc.generateLetter({
          type: 'ai_analysis',
          analysis,
          student: { studentName: evaluation.student.name, year: evaluation.student.year ?? '미지정', evaluationDate: evaluation.evaluation_date },
        })
        await db.insert(feedbackDrafts).values({
          academy_id, evaluation_id: evaluation.id, ai_draft_text: letter, status: 'draft',
        })

        send({ step: 'complete', analysis, letterDraft: letter })
      } catch (err) {
        send({ step: 'error', message: String(err), degradeTo: 'approach_a' })
      } finally {
        controller.close()
      }
    },
  })
  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' },
  })
}
```

stub 으로 5-7초 latency 시뮬레이션 (`StubVideoAnalysisService` 가 setTimeout).

### 6.5 검토·승인·발송 (`/evaluation/[id]/review`)

양쪽 흐름의 공통 종착점. `feedback_drafts` row 가 이미 존재 (Approach-A: server action 이 INSERT, Approach-C: SSE 가 INSERT).

#### 화면 — 발송 전

```
┌─────────────────────────────────┐
│ ◀ 박지윤 학생 · 2026-05         │
├─────────────────────────────────┤
│ 학생 컨텍스트 카드               │
│ • 박지윤 (2년차)                │
│ • 평가일 2026-05-10             │
│ • 작성: 김코치                  │
├─────────────────────────────────┤
│ AI 작성 letter (편집 가능)      │
│ ┌─────────────────────────────┐ │
│ │ 안녕하세요, 박지윤 학생       │ │
│ │ 부모님.                      │ │
│ │ ...                         │ │
│ │ [textarea, 350자 hard cap]   │ │
│ └─────────────────────────────┘ │
│ 0 / 350자 (KoreanCharCounter)   │
├─────────────────────────────────┤
│ 💡 AI 가 작성한 초안입니다.      │
│ 한 줄 한 줄 검토 후 발송하세요. │
├─────────────────────────────────┤
│ [   승인 및 공유 링크 생성   ]  │  ← sticky bottom
└─────────────────────────────────┘
```

#### 화면 — 발송 후

```
┌─────────────────────────────────┐
│ ✓ 발송 완료                     │
│                                 │
│ 부모용 공유 링크:                │
│ ┌─────────────────────────────┐ │
│ │ https://app/feedback/abc123 │ │
│ └─────────────────────────────┘ │
│ [ 주소 복사 ]  [ KakaoTalk 열기 ]│
│                                 │
│ ⏰ 2026-06-09 까지 열람 가능     │
└─────────────────────────────────┘
```

`KakaoTalk 열기` = `kakaotalk://` deep link.

#### `finalizeAndSend` server action

```ts
'use server'
export async function finalizeAndSend(input: {
  draftId: string
  editedText: string
}): Promise<{ ok: true; shareUrl: string; expiresAt: Date } | { ok: false; error: string }> {
  const { app_user, academy_id } = await requireAuth()

  // 1. 검증 (gpt-4o-mini-letter §validateOutput 동일)
  const text = input.editedText.trim()
  if (!text.startsWith('안녕하세요')) return { ok: false, error: 'must_start_greeting' }
  const charCount = [...text].filter(c => c.trim()).length
  if (charCount > 350) return { ok: false, error: 'too_long' }
  for (const word of PROHIBITED) {
    if (text.includes(word)) return { ok: false, error: `prohibited:${word}` }
  }

  // 2. 토큰 — 32 random bytes, base64url
  const rawToken = randomBytes(32).toString('base64url')
  const tokenHash = sha256(rawToken + process.env.SHARE_LINK_PEPPER!).hex()
  const expiresAt = addDays(now(), 30)

  // 3. UPDATE feedback_drafts — draft → sent (intermediate `approved` 생략)
  await db.update(feedbackDrafts).set({
    coach_edited_text: text,
    status: 'sent',
    approved_at: now(),                      // 감사용 동시 기록
    sent_at: now(),
    share_link_token_hash: tokenHash,
    share_link_expires_at: expiresAt,
  }).where(and(
    eq(feedbackDrafts.id, input.draftId),
    eq(feedbackDrafts.academy_id, academy_id),
  ))

  // 4. raw token 은 절대 DB 저장 X — 응답에서만 보임
  return {
    ok: true,
    shareUrl: `${process.env.NEXT_PUBLIC_APP_URL}/feedback/${rawToken}`,
    expiresAt,
  }
}
```

**Security:**
- raw token DB 저장 X — hash 만 (`schema-v1.md §3.7`).
- 응답 화면 떠나면 raw URL 다시 못 봄. 다시 발송하려면 `regenerateShareLink` 별도 action (v1.x defer).
- `SHARE_LINK_PEPPER` env: `t3-env` server-only.

### 6.6 모듈 구조

```
src/lib/evaluations/
├── queries.ts             # getEvaluation, getRecentEvaluations
├── start-action.ts        # startEvaluation
├── finalize-action.ts     # finalizeAndSend
├── share-link.ts          # generateToken, hashToken
└── validate-letter.ts     # validateLetter (Approach-A actions 와 review action 양쪽 import)

src/app/(coach)/evaluation/[id]/
├── page.tsx               # NEW — Approach-C 영상 업로드
├── coach-form/            # EXISTING
├── review/
│   ├── page.tsx           # NEW
│   ├── review-editor.tsx
│   ├── share-link-card.tsx
│   └── actions.ts
└── components/
    ├── video-upload-flow.tsx
    └── streaming-timeline.tsx

src/app/api/evaluations/[id]/stream/route.ts  # SSE Route Handler
```

### 6.7 흐름 invariant 요약

| Invariant | Enforce |
|---|---|
| 동의 없으면 `evaluations` INSERT 불가 | `startEvaluation` (RLS 외) |
| `feedback_drafts` ↔ `evaluations` 1:1 | DB UNIQUE constraint (0001) |
| `status='sent'` 만 부모 노출 | `get_parent_feedback` RPC (0002) |
| raw token 어디에도 저장 X | `finalizeAndSend` 가 hash 만 INSERT |
| `share_link_expires_at` 지나면 RPC 빈 결과 | `get_parent_feedback` 의 `WHERE expires_at > now()` |
| `coach_edited_text` 350자 hard cap + 금지어 0 | `validateLetter` |

## 7. Parent share-link 페이지 wiring

### `/feedback/[token]/page.tsx`

```ts
export default async function ParentFeedbackPage({ params }: { params: { token: string } }) {
  const supabase = createServiceRoleClient()
  const { data, error } = await supabase.rpc('get_parent_feedback', { p_token: params.token })

  if (error || !data || data.length === 0) {
    return <ExpiredOrInvalidPage />
  }

  const feedback = data[0]
  return <ParentReportCard feedback={feedback} />
}
```

`<ParentReportCard>` layout: `~/.gstack/projects/directors-note/designs/parent-share-link-20260510/wireframe-B.html` (B 카드 layout 락됨).
- 학원 헤더 → 학생 카드 → 코치 피드백 카드 → 코치 서명 카드 → footer (학원 연락처 + 30일 만료 + PIPA 링크).
- **AI grade 절대 노출 X (P2)** — RPC 가 `ai_analyses.*` 컬럼 자체 SELECT 안 함.

### Service-role client 격리

```
src/lib/supabase/
├── server.ts           # 기존 — 코치용, cookie + RLS
└── service-role.ts     # NEW — 부모 surface 전용, RPC only

createServiceRoleClient() — 'server-only' import 강제.
SUPABASE_SERVICE_ROLE_KEY — t3-env server schema only.
```

부모 페이지는 인증 X — token 자체가 capability. RPC 가 4중 검증: hash match + status='sent' + expires_at > now() + soft_deleted_at IS NULL.

### Edge cases (모두 동일 메시지로 폴백)

| 상태 | 화면 |
|---|---|
| valid | 카드 리포트 |
| invalid (포맷 / 해시 mismatch) | "만료되었거나 유효하지 않은 링크입니다" |
| valid + expired | 동일 |
| valid + 학생 soft-deleted | 동일 |
| valid + status != 'sent' | 동일 |

## 8. Schema migration `0003_students_year.sql.draft`

```sql
-- 0003_students_year.sql.draft
-- 적용 시점: PIPA 의견 + 0001/0002 적용 후. 별도 변호사 review 불필요.
ALTER TABLE students ADD COLUMN year text;
COMMENT ON COLUMN students.year IS '학생 구분 — 자유 텍스트 (예: 1년차, 2년차, 재수생)';
```

- `.draft` 확장자 = 검토 대기. 적용: `mv 0003_students_year.sql.draft 0003_students_year.sql && supabase db push`.
- RLS / 정책 / 인덱스 추가 불필요.
- Drizzle schema (`src/lib/db/schema.ts`) 에 `year: text('year')` 추가, `bun run db:generate` 로 type 재생성.

## 9. 에러 정책 (전체)

| 영역 | 에러 | UX |
|---|---|---|
| **인증** | 세션 없음 | `/login` redirect (`requireAuth`) |
| | 이메일 미초대 | `/auth/not-invited` + sign-out |
| | role 부족 | 403 page + "관리자에게 문의" |
| **학생** | 동의 미제출 + 시작하기 | toast: "부모 동의가 필요합니다" + edit link |
| | 학생 soft-deleted (race) | 404 |
| | 보관 confirm 취소 | 모달 dismiss |
| **평가 시작** | 같은 날 in-flight 평가 | 기존 evaluation 으로 redirect (resume) |
| | RLS 차단 (다른 학원) | 404 |
| **Approach-A 폼** | 5축 중 2개 미만 | inline error |
| | LLM 호출 실패 | retry 1회, 그래도 실패 시 toast |
| **Approach-C SSE** | 영상 upload 실패 | toast + retry |
| | Vertex/Stub 2회 실패 (D8) | `degradeTo: 'approach_a'` → degrade banner → `/coach-form` (기존 evaluation row 재사용) |
| | EventSource 끊김 | 자동 reconnect 1회, 실패 시 D8 |
| **검토·발송** | 350자 초과 | submit 차단 + char counter 빨강 |
| | 금지어 포함 | submit 차단 + 어떤 단어 inline 표시 |
| | "안녕하세요" 시작 안 함 | submit 차단 + inline 안내 |
| | 토큰 충돌 (해시 unique 위반) | 1회 자동 재생성 |
| **부모** | 만료 / invalid / soft-deleted | 동일 메시지 — 정보 노출 최소화 |

## 10. 테스트 전략

### Unit (Vitest)
- `validateLetter` — 350자, 금지어, 인사말
- `share-link.ts` — token randomness, hash determinism
- `studentFormSchema` — name 길이, year optional, consent boolean
- `coachBulletFormSchema` — 5축 중 2개 enforce

### Integration (Vitest + Drizzle on test DB)
- `startEvaluation`: 동의 없는 학생 → `error: 'no_consent'`
- `startEvaluation`: 동일 (student, date) 두 번 → 같은 row resume
- `finalizeAndSend`: status `draft → sent` + token 해시 저장 + raw token 응답
- `archiveStudent`: name anonymize + soft_deleted_at + 후속 listStudents 결과 제외
- `get_parent_feedback` RPC: valid token → 데이터, 잘못된 token → 0 rows

### Component (Vitest + Testing Library)
- `<ReviewEditor>`: 350자 카운터, 발송 버튼 disabled 조건
- `<ShareLinkCard>`: copy 버튼 클립보드, kakaotalk:// deep link
- `<StreamingTimeline>`: 4-step pending → active → done
- `<StudentForm>`: consent toggle role gating

### E2E (Playwright)

| # | 시나리오 |
|---|---|
| E2E-A1 | 미초대 이메일 Kakao 로그인 → not-invited 페이지 |
| E2E-A2 | 초대된 이메일 Kakao 로그인 → /students 도착 |
| E2E-S1 | owner: 학생 추가 → 목록 노출, 동의 토글 ON 후 시작하기 enabled |
| E2E-S2 | coach: 학생 정보 수정 hidden / server action 직접 호출 시 403 |
| E2E-S3 | 보관 → 활성 필터에서 사라지고 보관됨 필터에 노출 |
| E2E-E1 | 시작하기 (flag OFF) → 코치 폼 → 5축 중 3개 입력 → submit → review |
| E2E-E2 | 시작하기 (flag ON, stub) → 영상 업로드 → 4-step 타임라인 → review |
| E2E-E3 | review: 편집 → 승인·발송 → share-link card 노출 |
| E2E-E4 | 부모: share-link 열기 → 카드 리포트 노출, AI grade DOM 어디에도 없음 (P2) |
| E2E-E5 | 부모: 만료된 link → "유효하지 않음" |
| E2E-E6 | RLS: 학원 A 코치가 학원 B 학생 id 로 startEvaluation → 404 |
| E2E-D8 | Approach-C 강제 실패 → degrade banner → coach-form (evaluation row 재사용) |

기존 test plan (`~/.gstack/projects/directors-note/kiwoongmin-unknown-eng-review-test-plan-20260509-231615.md`) 에 추가.

## 11. Performance

- `/students` LCP < 2s (RSC + Pretendard cached + 80 row flat)
- `/evaluation/[id]/review` LCP < 1.5s (single record fetch)
- SSE: stub 5-7초 simulated, Vertex 시 30-40초 예상 (D7)
- 부모 페이지: RPC 1회 + render — LCP < 1.5s

## 12. 환경변수 추가

```
SUPABASE_SERVICE_ROLE_KEY=<from supabase>      # 부모 RPC 전용
SHARE_LINK_PEPPER=<32+ random chars>            # token 해시 pepper
NEXT_PUBLIC_APP_URL=https://...                  # share-link 절대 URL
KAKAO_OAUTH_CLIENT_ID=<from kakao developers>   # Supabase Auth provider
KAKAO_OAUTH_CLIENT_SECRET=<from kakao developers>
FEATURE_AI_VIDEO_ANALYSIS=false                  # v1 기본 OFF
```

`src/lib/env.ts` t3-env schema: server-only / public 분리.

## 13. 보안 체크리스트

- `service_role` 키는 부모 RPC 호출에만. 다른 server action 사용 X.
- `requireAuth` / `requireRole` `'server-only'` import 강제.
- raw `share_link_token` 응답 1회만 노출, DB 저장 X.
- coach role 의 owner-only action server 단 reject (UI hidden 만 믿지 않음).
- AI grade 부모 노출 차단 — RPC SELECT 절에 `ai_analyses` 테이블 없음 (P2 hold).

## 14. 의존 / 후속 결정

이 spec 자체는 lock 됨. 다음 항목들은 implementation 중 자연스럽게 결정:

- Kakao Developers app 등록 + redirect URL 설정 — owner (친구) 가 학원 도메인으로 신청
- Supabase Auth Kakao provider 설정 — dashboard UI 에서 client id/secret 입력
- `SHARE_LINK_PEPPER` 값 생성 — `openssl rand -base64 48`
- `NEXT_PUBLIC_APP_URL` 도메인 — Vercel 배포 시점에 확정
- T1 (dev auth bypass) / T5 (seed safety) fix 는 이 spec 적용 시 자연 정리 — `requireAuth` 가 dev bypass 대체

## 15. 다음 단계

1. 이 spec 을 `/superpowers:writing-plans` 에 입력 → task-by-task implementation plan 생성.
2. Plan 을 `/plan-eng-review` 에 통과시켜 architecture 강화.
3. Plan 을 `/superpowers:subagent-driven-development` 또는 `/superpowers:executing-plans` 으로 실행.
4. Implementation 완료 후 deferred coach dashboard plan (`~/.gstack/projects/directors-note/coach-dashboard-plan.md`) 재개.
