# Session Log — 2026-05-21 PM

오후 세션. 오전 세션 (Vertex Approach-B 코드 ready) 의 외부 액션 2건 (Migration 0010, Vertex smoke test) 완료를 시작점으로, 후속 사전 부채 정리 + Task 5 (부모 동의서 v2) + 빌드 break 핫픽스까지. **4 commits 누적 origin/main 푸시**.

Reference HEAD: `8206d84`. Branch: `main`, **pushed**.

---

## 1. Migration 0010 적용 — cosine search RPC (5/21 오전 deferred)

오전 세션 결정 빚 첫 항목. Supabase MCP read-only 제거 후 첫 자동 apply.

### 사전 점검

| 항목 | 결과 |
|---|---|
| pgvector | 0.8.0 ✓ |
| embeddings, reference_videos 테이블 | 존재 ✓ |
| `search_reference_matches` 함수 | 부재 (적용 대상) |
| 0006-0009 적용 흔적 | `list_migrations` 에 안 보이나 함수/컬럼 직접 확인 결과 모두 적용됨 (이전 세션이 dashboard SQL Editor 로 적용한 듯) |

`migrations/0010_cosine_search_references.sql` 그대로 `mcp__supabase__apply_migration` 호출. SECURITY DEFINER + p_academy_id 명시 격리, REVOKE FROM PUBLIC, anon, authenticated + GRANT TO service_role 까지 적용.

### 검증

```
search_reference_matches(p_query_vector vector, p_academy_id uuid, p_limit integer)
  SECURITY DEFINER: true
  EXECUTE 권한:    postgres, service_role  (anon/authenticated 차단)
```

Supabase advisor 에 신규 경고 없음 — REVOKE 가 0028 lint 회피 성공.

---

## 2. Vertex smoke test — Approach-B 풀 경로 실제 동작 검증

오전 세션 두 번째 deferred 액션. 사용자가 piLab 의 `media/test_video.mp4` (165MB) 제공.

### 1차 시도 — Service agent provisioning 대기

```
HTTP 400 FAILED_PRECONDITION
"Service agents are being provisioned (...)
Service agents are needed to read the Cloud Storage file provided.
So please try again in a few minutes."
```

GCP 첫 호출 시 Vertex AI service agent (`service-917718139004@gcp-sa-aiplatform.iam.gserviceaccount.com`) 자동 생성 지연. GCS upload 자체는 성공했고 cleanup 도 정상 동작. 명시 권한 부여 없이 5분 대기 후 재시도.

### 2차 시도 — 성공 (백그라운드 `sleep 300 && retry`)

| 단계 | 결과 |
|---|---|
| GCS upload | ✓ |
| Vertex predict | ✓ 78.4초 (165MB / 0-120s segment) |
| Embedding 차원 | 1408 ✓ |
| L2 norm | 1.000000 (정규화 unit vector — cosine 매칭 적합) ✓ |
| GCS cleanup | ✓ |

코드 경로 (OAuth → GCS → Vertex predict → 파싱 → cleanup) 전부 정상. 비용 ~0.001 USD. 165MB 같은 큰 파일도 segment 추출은 모델 내부 처리라 분석 자체에 지장 없음 (다만 업로드 시간이 길어짐).

---

## 3. 사전 부채 정리 — `delete_student` anon REVOKE (Migration 0011 + 0012)

Migration 0010 적용 직후 advisor 검사에서 발견한 0028 경고 2건 (`delete_student`, `get_parent_feedback`) 처리.

### 판단

| 함수 | anon EXECUTE 의도 | 처리 |
|---|---|---|
| `delete_student` | ❌ 의도 X — 함수 본문에 `my_academy_id() IS NULL` 차단이 있어 실제 위험은 없으나 defense-in-depth 차원에서 REVOKE | Migration 0011 + 0012 |
| `get_parent_feedback` | ✅ 의도 O — 부모 share-link (token+pepper 인증) anon 호출 by design | 유지 (false positive) |

### 0011 → 0012 두 단계 이유

0011 `REVOKE EXECUTE FROM anon` 만으로는 `PUBLIC` grant 가 우선해서 anon EXECUTE 가 그대로 유지됨을 직접 확인 후 발견. 0012 에서 `REVOKE ALL FROM PUBLIC, anon, authenticated, service_role` 후 `GRANT TO authenticated, service_role` 명시 부여. 최종 상태:

```
anon          can_exec=false
authenticated can_exec=true
service_role  can_exec=true
```

advisor 0028 (anon executable) 의 `delete_student` 라인 사라짐 (단, advisor 캐시 지연으로 즉시 반영은 안 됨 — 직접 SQL 권한 조회로 확인).

---

## 4. 빌드 break 핫픽스 — `STUDENT_VIDEOS_BUCKET` plain module 분리

Task 5 작업 중 `bun run build` 실행 시 발견된 **pre-existing 버그**.

### 증상

```
The export createSignedUploadUrl was not found in module
[project]/src/lib/evaluations/upload-action.ts [app-ssr] (ecmascript).
The module has no exports at all.
```

### 원인

`src/lib/evaluations/upload-action.ts` 가 `"use server"` directive 모듈인데 `export const STUDENT_VIDEOS_BUCKET = "student-videos"` 같은 non-async 상수를 함께 export. Next.js 의 "use server" 규약 위반 → **모듈 전체 export 가 차단됨** (createSignedUploadUrl / attachVideoToEvaluation 모두). 5/21 오전 vertex 작업 (`6efbb47`) 이후 main 빌드가 줄곧 깨진 상태였음. Vercel deploy 도 막혔을 것.

오전 세션의 verified 체크 항목 (`typecheck`, `test:ci`) 은 그린이었으나 **`bun run build` 가 빠져있었음** — Next.js 의 use-server lint 가 빌드 타임에만 enforce 됨.

### 수정

`src/lib/evaluations/constants.ts` (plain module) 신설 + 상수 이전. `upload-action.ts` 와 `vertex.ts` 모두 거기서 import. 테스트 mock (server-only chain 우회용) 도 단순화.

빌드 그린 확인: `/parent-consent`, `/privacy` 정적 prerender, 17 routes total.

---

## 5. Task 5 — 부모 동의서 v2 + 생체정보 처리 별도 동의

CLAUDE.md 의 PIPA 의무 (D6 게이트 해제 시 약속) 이행. 친구 학원 prod cutover 전 필수 항목. 사용자가 **법률 확인 완료** 통지.

### 동의서 문안 (`/parent-consent`)

PIPA 제15조 (개인정보 처리) / 제17조 (제3자 제공) / 제23조 (민감정보 별도 동의) 형식 준수. 4부 구성:

| 제1부 | 일반 개인정보 처리 동의 | 학생 이름·평가 데이터, 보유 기간, 거부 권리 |
| 제2부 | **생체정보 처리 별도 동의 (PIPA 23)** | 얼굴·음성 1408차원 임베딩, Vertex/GCS 위탁, 영상 24시간 lifecycle, 거부 시 코치 직접 평가 모드 |
| 제3부 | 동의 확인 절차 | 코치 self-attest 모델 명시 |
| 제4부 | 정보주체의 권리 + /privacy cross-link |

특이 점:
- "본 동의 거부가 제1부 동의에 영향을 주지 않습니다" — PIPA 23 의 별도 동의 정신 (다른 동의와 묶지 말 것)
- 수탁업체 표: Google LLC (Vertex/GCS, asia-northeast1) + Supabase (미국)
- 외부 법률 검토 진행 중 초안임을 page header amber notice 로 명시

### 데이터 모델

스키마 변경 없음 — `students.parent_consent_version` 컬럼은 0001 init 부터 있었으나 미사용 상태였음. 본 작업으로 사용 시작.

`src/lib/consent/version.ts` 에 `CURRENT_PARENT_CONSENT_VERSION = "2026-05-21-v2"` 상수. 향후 문안 수정 시 이 상수만 갱신하면 새 버전 stamp 시작.

### 폼 UX

`student-form.tsx` 의 "부모 동의서 받음" 토글 옆에:
- 현행 버전 라벨 (`2026-05-21-v2 · v2 (영상 기반 AI 분석 동의 포함)`)
- "동의서 전문 보기 →" 링크 (새 탭으로 `/parent-consent`)

코치 self-attest 모델 — 학원이 부모로부터 종이/PDF 동의서 받음, 코치가 학생 등록 시 토글로 확인. v2 흐름에서 PDF artifact 업로드 추가 가능 (현재 컬럼 `parent_consent_artifact_url` 만 schema 에 있고 UI 미연결).

### Action 로직

| 액션 | 동작 |
|---|---|
| `createStudent` (consent ON) | `parent_consent_on_file_at=now()`, `parent_consent_version=CURRENT` stamp |
| `createStudent` (consent OFF) | 둘 다 null |
| `updateStudent` (consent ON, 신규) | 위와 동일 stamp |
| `updateStudent` (consent ON, 기존 version 존재) | **기존 version 보존** (downgrade 방지) |
| `updateStudent` (consent OFF) | 둘 다 null clear |

### 테스트

`tests/integration/students/actions.test.ts` 에 4개 신규 케이스 추가:
- consent ON 시 version stamp
- consent OFF 시 둘 다 null
- 기존 version 보존
- toggle OFF 시 clear

기존 액션 테스트는 mock 캡처 패턴 (`insertValues.mock.calls[0]?.[0]`) 으로 보강. TS 의 빈 튜플 추론 회피용 `as unknown as` 캐스트 1줄 추가.

---

## 6. End-to-end 코드 경로 감사 (Explore agent)

사용자 메시지 "비디오 분석 기능까지 붙여야 친구한테 영상을 달라고 할 수 있다" 받고 풀 경로 점검. 결론: **모든 단계가 코드 레벨에서 이미 연결됨**.

| 단계 | 파일 | 상태 |
|---|---|---|
| Evaluation row 생성 | `start-action.ts` | ✅ ready |
| 영상 업로드 (signed URL → Storage PUT) | `video-upload-flow.tsx`, `upload-action.ts` | ✅ ready |
| SSE streaming endpoint | `api/evaluations/[id]/stream/route.ts` | ✅ ready (`frames_extracted` → `embedding_generated` → `matches_computed` → `letter_drafting` → `complete`) |
| Vertex 호출 + cosine 매칭 | `vertex.ts`, `factory.ts` | ✅ ready |
| AI analysis DB 저장 | stream route 내부 | ✅ ready |
| Letter draft 생성 (gpt-4o-mini) | `gpt-4o-mini-letter.ts` | ✅ ready |
| 코치 검토/발송 | `evaluation/[id]/review/page.tsx`, `finalize-action.ts` | ✅ ready |
| 부모 share-link | `feedback/[token]/page.tsx` + `get_parent_feedback` RPC | ✅ ready |
| Reference 부재 graceful degrade | `grade-derivation.ts` throw → stream catch → Approach-A 라우팅 | ✅ ready |
| Feature flag 분기 | `FEATURE_AI_VIDEO_ANALYSIS=false` 시 coach-form 페이지로 자동 redirect | ✅ ready |
| Streaming timeline UI (수직) | `streaming-timeline.tsx` (D7 design 따름) | ✅ ready |

미구현 1건: D12 LLM-as-judge escalation — `shouldEscalateToJudge()` 헬퍼만 작성, caller 미연결. v1 은 cosine only (의도된 미구현).

**갭 없음**. 남은 마지막 외부 의존성: **reference 영상 시드**. 현재 dev tenant 의 `reference_videos` 비어있어 실제 분석시 `no_reference_matches` 로 Approach-A 자동 fallback. tier/axes 분류 의미있게 동작하려면 reference 영상 필요.

---

## 7. Commit 시퀀스 (4 commits → origin/main)

```
3953f00  fix(eval):     split STUDENT_VIDEOS_BUCKET into plain module
cb9c71d  chore(security): lock delete_student to authenticated+service_role
8206d84  feat(consent): parent consent v2 + biometric processing clause
```

`5f16777` (feat(privacy)) 는 본 세션 시작 시점에 이미 로컬 커밋 상태였고 본 세션 초반에 push.

### 사용자 결정 사항 (본 세션 내)

- **자율 push 권한 부여**: "앞으로 작업도 알아서 푸시해" — 메모리에 영구 기록 (`feedback_autonomous_push.md`). force push / prod 영향 동반 변경은 여전히 사전 확인 필수.

---

## 8. Verified vs not (이번 세션)

### Verified

- Migration 0010 적용 + 함수 시그니처 / SECURITY DEFINER / EXECUTE grant 확인
- Migration 0011 → 0012 의 권한 변경 직접 SQL 권한 조회로 검증 (advisor 캐시 와 무관)
- Vertex multimodalembedding 실제 호출 (165MB sample, 78.4s, 1408d unit vector)
- `bun run lint` / `bun run typecheck` / `bun run test:ci` (109 pass, 1 skip — 신규 4개 actions 테스트 포함)
- **`bun run build` 그린** (오전 세션 verified 항목에서 누락됐던 부분, 본 세션에서 add)
- 정적 prerender 확인: `/parent-consent`, `/privacy` 둘 다 static
- get_parent_feedback 함수 본문이 0008 버전 (display_name + '담당 선생님' fallback) 임을 직접 SQL 조회로 재확인

### Not verified

- **End-to-end 영상 → 분석 → letter** — reference 영상 0개 상태라 도그푸드 불가. 코드 경로는 ready, 데이터만 부재.
- 부모 동의서 페이지 **시각적 검수** — 사용자가 `bun run dev` 후 `/parent-consent` 브라우저 확인 권장. 코드/build 차원에선 그린.
- D12 LLM-as-judge escalation — caller 미연결. v1 의도 범위.

---

## 9. Resume instructions

```bash
# Resume
/context-restore

# 회귀 확인 (특히 빌드 — 5/21 PM 빌드 fix 가 새로 들어갔으니)
bun run lint && bun run typecheck && bun run test:ci && bun run build
```

### 남은 외부 액션

1. **Reference 영상 시드** — 사용자 본인 권한 영상 1-4개 (각 10-30초 권장, mp4). 1개라도 시드되면 풀 흐름 동작.
   ```bash
   bun --env-file=.env.local run seed:reference-video \
     --academy 554c68ef-3244-44a3-96a1-397185ad41ea \
     --tier A --scene-type classical_monologue \
     --file ./demo.mp4
   ```
2. **사용자 본인 dev 도그푸드** — 시드 후 학생 1명 등록 → 평가 시작 → 영상 업로드 → 분석 결과 검토 → 부모 share-link 까지 풀 흐름. 발견 버그 그 자리에서 fix.
3. **친구한테 데모** — 도그푸드 완성 후 친구한테 보여줄 시연 흐름 (dev 노트북 직접 시연 또는 prod cutover 후 vercel 배포 후 시연).

---

## 10. Decisions still owed (carry-over)

오전 세션 (5/21 AM) 의 결정 빚 갱신:

| # | 항목 | 상태 |
|---|---|---|
| 1 | Migration 0010 적용 | ✅ done (PM 1) |
| 2 | Reference 영상 촬영 | ⏸ pending — 사용자 본인 영상 1-4개 시드 후 친구 영상 받기 |
| 3 | C1 Supabase split (별도 prod project) | ⏸ pending — 친구 첫 실 OAuth 전 |
| 4 | C2 도메인 (*.vercel.app vs 커스텀) | ⏸ pending |
| 5 | C3 Kakao 앱 전략 (단일 vs split) | ⏸ pending |
| 6 | PIPA 자문 솔리시테이션 | ⏸ pending — 친구 prod cutover 전 필수 (사용자가 동의서 v2 법률 확인 완료 통지 받음) |
| 7 | 개인정보처리방침 페이지 | ✅ /privacy v1-draft 라이브 (사전 push 됨) |
| 8 | 부모 동의서 v2 (생체정보 조항) | ✅ done (PM 5) — 코드 레벨 ready, 변호사 자문 trigger 대기 |
| 9 | iCloud sync 키 노출 회피 (~/Desktop/gcp-keys → ~/.gcp-keys) | ⏸ pending |

---

## 11. 비용 / 비용 가드레일

본 세션 GCP 비용: **~0.001 USD** (Vertex smoke test 1회).

남은 free credit 추정: $300 의 거의 전체 남음 (5/21 발급, 90일 카운트).

---

## 12. 메모리 업데이트

| 파일 | 변경 |
|---|---|
| `feedback_autonomous_push.md` | **신규** — main 직접 push 사전 승인 (force push / prod 영향 동반 변경 제외) |
| `MEMORY.md` | 인덱스에 위 entry 추가 |

기존 memory entries (Hard gate scope, MCP secrets redact, Pilot academy seeded, D6 gate removed, Supabase MCP writable) 모두 변경 없음.

---

## 13. 한 줄 요약

오전 deferred 액션 2건 (Migration 0010 / Vertex smoke test) 완료 → 사전 부채 (delete_student anon REVOKE) + main 빌드 break 핫픽스 + Task 5 (부모 동의서 v2 PIPA 23 형식) → end-to-end 코드 경로 갭 없음 확인. 4 commits push. 남은 외부 의존성은 reference 영상 시드 1건.
