# Session Log — 2026-05-21

오전 세션. 한 주 멈춤 후 재개. 단일 큰 작업 — Approach-B (Vertex multimodal embedding) 코드 경로를 stub 에서 실제 호출로 전환. GCP/Vertex 자격증명 셋업 + VertexVideoAnalysisService 구현 + reference video 시드 인프라까지 한 흐름. 2 commits, 8 commits 누적 origin/main 푸시.

Reference HEAD: `7457b27`. Branch: `main`, **pushed**.

---

## 1. GCP / Vertex AI 셋업 (Task 2 완료)

대화형 9단계 가이드 + 검증. 사용자는 GCP 처음 사용. 30분 안에 완료.

| 단계 | 결과 |
|---|---|
| 1. GCP 프로젝트 | `directors-note` (number `917718139004`) |
| 2. 결제 연결 | $300 / 90일 free credit + 결제 카드 등록 |
| 3. API 활성화 | Vertex AI / Cloud Storage / IAM Service Account Credentials |
| 4. GCS 버킷 | `directors-note-video-staging-7891` (서울 리전, private, 1-day lifecycle) |
| 5. 서비스 계정 | `directors-note-vertex-198@directors-note.iam.gserviceaccount.com` |
| 6. 역할 부여 | `Agent Platform 사용자` (= `roles/aiplatform.user`) + `Storage 객체 관리자` |
| 7. JSON 키 | 다운로드 → `~/Desktop/gcp-keys/directors-note-vertex.json` (chmod 600) |
| 8. `.env.local` | `GOOGLE_VERTEX_PROJECT_ID`, `GOOGLE_VERTEX_LOCATION=asia-northeast1`, `GOOGLE_APPLICATION_CREDENTIALS_JSON` (minified, 작은따옴표), `GCS_VIDEO_BUCKET` 추가 |
| 9. 검증 | OAuth 토큰 발급 ✓, GCS 객체 list 권한 ✓, JSON round-trip ✓ |

**리브랜딩 노트:** 구글이 최근 `roles/aiplatform.user` 의 콘솔 표시명을 **"Vertex AI 사용자"** → **"Agent Platform 사용자"** 로 변경. URL `apiid=aiplatform.googleapis.com` 으로 내부 ID 는 동일 확인. 향후 비슷한 혼동 가능.

**보안 메모:** 키 파일이 `~/Desktop/gcp-keys/` 에 있음. iCloud Drive Desktop & Documents 동기화 켜져있으면 클라우드 노출됨. 친구 prod 셋업 전 `~/.gcp-keys/` 같은 동기화 제외 위치로 이동 권장.

---

## 2. VertexVideoAnalysisService 구현 (Task 3 완료, commit `6efbb47`)

D6 PIPA 게이트 제거 + GCP 자격증명 갖춰진 이후 첫 실코드. Stub 인터페이스를 Vertex 실호출로 교체. 11 files, +952 / -13.

### 데이터 흐름

```
Supabase Storage(student-videos)
  → download bytes (service-role bypasses RLS)
  → GCS staging upload ({academy}/{eval}.mp4)
  → Vertex multimodalembedding@001 :predict (gs:// URI, 1408d)
  → emit progress events (frames_extracted, embedding_generated, matches_computed)
  → pgvector cosine search via search_reference_matches RPC
  → axes/grade derivation (v1 휴리스틱: top-match tier broadcast)
  → cache evaluation embedding (source_type='evaluation')
  → finally: GCS staging cleanup (1-day lifecycle 도 backstop)
```

### 핵심 단순화

설계 doc §5 의 TODO #1-2 (ffmpeg server-side frame extraction) **자동 해결**. Vertex multimodalembedding@001 의 video 모드는 프레임 샘플링을 모델이 내부 처리 — 우리는 `gs://` URI 만 넘기면 1408d embedding 1개 받음. ffmpeg 의존성 0.

### V1 한계 명시

- **Axes broadcast** — 단일 영상 embedding 하나로 vocal/expression/examReadiness 를 분리 측정 불가. 셋 다 동일 점수 (top-match tier base ± cosine 기반 jitter). V2 에서 axis-별 reference embedding 시드로 분리.
- **LLM-as-judge escalation (D12) 미구현** — `shouldEscalateToJudge()` 헬퍼는 작성됐지만 caller 경로 미연결. cosine 만으로 v1 출시.

### 신규 파일

```
src/lib/evaluation/vertex.ts             VertexVideoAnalysisService (290 lines)
src/lib/evaluation/grade-derivation.ts   tier → axes 휴리스틱 + escalation 헬퍼
migrations/0010_cosine_search_references.sql  pgvector cosine search RPC
scripts/vertex-smoke-test.ts             실제 mp4 1개 end-to-end 검증 (~0.001 USD)
tests/unit/evaluation/vertex.test.ts     6 tests — happy path, gs URI, error cleanup
tests/unit/evaluation/grade-derivation.test.ts  11 tests — tier/cosine 매핑
```

### 변경 파일

```
src/lib/env.ts                  + GCS_VIDEO_BUCKET 스키마
src/lib/evaluation/factory.ts   Vertex 와이어링 (자격증명 있을 때 Vertex, 없으면 dev Stub)
.env.local.example              + Vertex 섹션 가이드 보강 + GCS_VIDEO_BUCKET
package.json                    + google-auth-library 직접 dep, vertex:smoke-test 스크립트
```

### Migration 0010

`search_reference_matches(p_query_vector vector(1408), p_academy_id uuid, p_limit int) → table(...)` SQL 함수. `SECURITY DEFINER` (RLS bypass) + `p_academy_id` 명시 격리 + service_role 만 EXECUTE 권한. caller 가 application 레벨에서 academy 신원 검증 후 호출.

**적용 보류:** Supabase MCP 가 read-only 모드 + harness 가 공유 인프라 변경 명시 승인 요구 → 자동 apply 차단. **사용자 외부 액션 필요** — Supabase SQL Editor (`https://supabase.com/dashboard/project/kyizppeuvalqjtnhyqgf/sql/new`) 에서 `migrations/0010_cosine_search_references.sql` 내용 복사 → Run.

미적용 상태에서 VertexVideoAnalysisService 호출하면 `function search_reference_matches does not exist` 오류로 D8 graceful degrade trigger.

---

## 3. Reference video 시드 인프라 (Task 4 완료, commit `7457b27`)

학원의 gold-standard 시연 영상을 등록 + Vertex embedding 캐시하는 운영 스크립트. cosine 매칭의 reference set 을 채우는 일회성 도구.

```bash
bun run seed:reference-video \
  --academy 554c68ef-3244-44a3-96a1-397185ad41ea \
  --tier A|B|C|D \
  --scene-type classical_monologue|modern_monologue|improv \
  --file ./demos/demo.mp4 \
  [--technique-tag "발성, 표정"]
```

### 동작

1. 로컬 mp4 읽기
2. Supabase Storage 업로드 (`student-videos/{academy}/reference/{ref_id}.mp4` — service-role 가 RLS bypass)
3. GCS staging 업로드
4. Vertex multimodalembedding@001 호출
5. **Transaction**: `reference_videos` + `embeddings` (source_type='reference_video') INSERT
6. GCS staging 삭제

### 의도된 비대칭

- **멱등성 X** — 같은 영상 두 번 실행하면 두 row 생김. pilot 규모에서 직접 DB 정리 충분 (학원당 10-20개 reference 가 목표).
- **운영자 권한 가정** — service-role 키 + GCP creds 필요. friend academy 운영자는 못 씀. 학원 운영 초기는 founder 가 대신 시드.

### 비용

학원당 reference 10-20개 × 0.001 USD/call ≈ **1-2 cents**. 무시 가능.

### 미실행

실제 reference 영상이 아직 없음 (친구 학원 시연 촬영 전). 스크립트만 ship, 영상 확보 후 일괄 시드 가능. 그 전까진 dev tenant 의 `reference_videos` 테이블 비어있음 → VertexVideoAnalysisService 호출 시 `no_reference_matches` throw (의도된 동작).

---

## 4. origin/main 푸시 — 8 commits

세션 끝에 8커밋을 한 번에 origin 동기화. 마지막 origin 푸시가 `05ab147` 였음 (2주 전).

```
7457b27  feat(scripts): seed-reference-video
6efbb47  feat(eval): VertexVideoAnalysisService — task 3
dcb3f26  docs: session log for 2026-05-14 PM
ace5b22  feat(storage): student-videos bucket
13d9882  fix: A3 dogfooding sweep
775a549  feat(share-link): coach display_name
5e40652  fix(share-link): pepper as RPC arg
e33610f  fix(home): redirect stub
```

origin 푸시 자체는 harness 가 "main 직접 푸시는 명시 승인" 요구 → 사용자 한 마디 후 진행.

---

## 5. Active task list (TaskCreate state)

| # | Subject | Status | Notes |
|---|---|---|---|
| 1 | Storage bucket: student-videos + RLS | ✅ completed | 5/14 |
| 2 | Vertex AI creds 확보 | ✅ completed | **5/21** |
| 3 | VertexVideoAnalysisService 구현 | ✅ completed | **5/21, commit 6efbb47** |
| 4 | Reference videos 시드 인프라 | ✅ completed | **5/21, commit 7457b27** |
| 5 | 부모 동의서 생체정보 처리 동의 문구 | ⏸ pending | parallel, PIPA 자문 후 |
| 6 | End-to-end dogfood: 영상 → 분석 → letter | ⏸ blocked | migration 0010 적용 + 실제 영상 필요 |

---

## 6. Verified vs not (이번 세션)

### Verified
- GCP OAuth 토큰 발급 (서비스 계정 키 라운드트립)
- GCS 버킷 객체 list 권한 (실제 API 호출)
- `.env.local` 의 GCP/Vertex 4개 변수 모두 dotenv 통해 로드 + JSON.parse 성공
- `bun run typecheck` 그린
- `bun run lint` 그린 (biome auto-fix 1번)
- `bun run test:ci` — 105 pass / 1 skip (기존 E1 skip 그대로)
- 신규 unit tests 17개 모두 pass (vertex 6 + grade-derivation 11)
- git push origin main 성공 (8 commits)

### Not verified
- **Vertex multimodalembedding 실제 호출** — `scripts/vertex-smoke-test.ts` 작성됐지만 사용자가 sample mp4 들고 실행해야 함. 30초 안에 끝남.
- **Migration 0010 적용** — Supabase 미적용. 코드는 RPC 호출 시점에 깨질 것 (D8 degrade path 로 흐름).
- **End-to-end 영상 → 분석 → letter** — Task 6 미수행. reference 영상 시드 0개 상태라 cosine 매칭 자체 불가.
- **반복 호출에서의 latency** — Vertex 평균 응답 시간 미측정. 디자인 D7 streaming UI 의 SSE event 타이밍이 실제와 맞는지 추후 검증.

---

## 7. Resume instructions

```bash
# Resume
/context-restore

# 환경 변수 재확인 (특히 GCS_VIDEO_BUCKET 가 작동 중인지)
bun -e "require('dotenv').config({path:'.env.local'}); console.log(Object.fromEntries(Object.entries(process.env).filter(([k])=>k.startsWith('GOOGLE_')||k.startsWith('GCS_'))))"

# 회귀 확인
bun run lint && bun run typecheck && bun run test:ci
```

### 사용자 외부 액션 2개

1. **Migration 0010 적용** (1분):
   - Supabase SQL Editor 에서 `migrations/0010_cosine_search_references.sql` 내용 Run
   - 또는 `~/.claude.json` 의 supabase MCP `--read-only` 제거 후 새 세션에서 `/context-restore` 하면 제가 apply_migration 자동 호출 가능

2. **Vertex smoke test** (1분, ~0.001 USD):
   ```bash
   bun --env-file=.env.local run vertex:smoke-test ./<sample.mp4>
   ```
   실제 mp4 1개로 OAuth → GCS upload → Vertex predict → cleanup 풀 경로 검증.

### 친구 학원 시연 영상 받으면

```bash
# 영상별 1개씩 시드 (~0.001 USD per call)
bun --env-file=.env.local run seed:reference-video \
  --academy 554c68ef-3244-44a3-96a1-397185ad41ea \
  --tier A --scene-type classical_monologue \
  --file ./demos/seo-a-tier.mp4

# DB 확인
psql ${DATABASE_URL} -c "SELECT id, level, scene_type FROM reference_videos WHERE academy_id = '554c68ef-3244-44a3-96a1-397185ad41ea'"
```

학원당 10-20개 시드되면 cosine 매칭이 의미있는 분포 갖춤. 그 시점에 Task 6 (영상 → 분석 → letter end-to-end 도그푸드) 가능.

---

## 8. Decisions still owed

이전 세션 (5/14 PM) 의 결정 빚 + 이번 세션 추가:

1. **Migration 0010 적용** — 1분 외부 액션, 위 (resume §7-1) 참조
2. **Reference 영상 촬영** — 친구 학원 시연 영상 10-20개. cosine 매칭 의미있게 동작하려면 필수
3. **C1 (Supabase split)** — B 결정 (별도 prod project) 됨, 미실행 — 친구 첫 실 OAuth 전에
4. **C2 도메인** — `*.vercel.app` (권장) vs 커스텀, 미결정
5. **C3 Kakao 앱 전략** — 단일 vs split, 미결정
6. **PIPA 자문 솔리시테이션** — 병렬, 친구 prod cutover 전에 필수
7. **개인정보처리방침 페이지** — `/privacy` 404 상태, 부모 surface 라이브 전에 작성 (변호사 검토 desirable)
8. **부모 동의서 v2** — 생체정보 처리 동의 문구 (얼굴/음성 embedding). Task 5 driver
9. **iCloud sync 키 노출 회피** — `~/Desktop/gcp-keys/` → `~/.gcp-keys/` 이동 권장

---

## 9. 비용 / 비용 가드레일

이번 세션 GCP 비용: **0 USD** (Vertex 실호출 아직 없음).

GCP free tier credit: **$300 / 90일** (5/21 부터 카운트).

운영 예측 (Approach-B 정상 가동 시):
- 학원당 reference 시드 10-20개 × 0.001 USD ≈ **1-2 cents**
- 학생 평가 1회 = 1 Vertex call ≈ **0.001 USD**
- 학원당 월 50 evaluation × 1 = 50 calls/month ≈ **5 cents/month**
- GCS 스토리지 (1-day lifecycle): 정상 상태 ~1-2 GB → **수 cents/month**
- OpenAI (gpt-4o-mini letter): 호출당 ~0.1 cents

총 — 학원당 월 ≈ **10 cents** 미만. 50 학원까지 free credit 안에서 운영 가능.

---

## 10. 메모리 업데이트

이번 세션 신규/업데이트된 cross-session memory entries:

- `project_pilot_academy.md` — 변경 없음 (academy id 동일)
- `project_d6_gate_removed.md` — 변경 없음 (이미 5/14 추가)

**신규 후보** (아직 안 씀, 다음 세션에서 판단):
- GCP creds 위치 (~/Desktop/gcp-keys/) — iCloud sync 위험 메모
- 서비스 계정 이메일 (`directors-note-vertex-198@...`) — `-198` suffix 가 GCP 자동 부여, 정상

---

## 11. 한 줄 요약

D6 게이트 제거 → GCP/Vertex 자격증명 셋업 → VertexVideoAnalysisService 실구현 + 시드 인프라 → 8커밋 origin 푸시. Vertex 경로 코드 레벨 ready, migration 0010 적용 + reference 영상 확보 + smoke test 만 남음.
