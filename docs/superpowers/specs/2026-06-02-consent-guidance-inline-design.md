# 학생 상세 인라인 부모동의 안내 — 설계 (spec)

- 날짜: 2026-06-02
- 상태: 승인 대기 (브레인스토밍 완료)
- 범위: 작은 단일 기능 (A안 · 최소 범위)

## 1. 배경 / 문제

신규 원장(친구)이 "학생 등록 → 부모 동의서 ON → 평가 시작 → 영상 업로드 → AI 분석" 흐름을 처음 사용한다. 동의서 상태 관리(미제출 배지·필터, 동의 OFF 시 평가시작 버튼 잠금)는 이미 구현돼 있으나, **동의를 실제로 기록하도록 유도하는 행동 안내(call-to-action)** 가 없다. 현재는 수동 라벨("동의 미제출")뿐이라, 코치가 "그래서 지금 뭘 눌러야 하지?"를 알기 어렵다.

요구된 핵심 동작: **동의를 한 번 기록하면 안내가 더 이상 보이지 않고, 기록 전에는 계속 보인다.**

## 2. 결정된 방향 (브레인스토밍 결과)

- 형태: **학생별 인라인 "다음 할 일" 안내** (대시보드 체크리스트/전역 배너 아님)
- 범위: **동의 단계만** (평가/업로드/검토까지 안내하지 않음 — 최소)
- 동의 기록 방식: **인라인 즉시 확인** (안내 카드 안에서 바로 기록)
- 노출 위치: **학생 상세 페이지에서만** (학생 목록 행에는 버튼을 넣지 않음)
- 확인 단계: **확인 다이얼로그 포함** (PIPA — "부모 동의를 받았음" 확인)

## 3. 동작 규칙

1. 학생 상세 페이지에서 `student.parentConsentOnFileAt == null` 이면 "다음 할 일 — 부모 동의서" 인라인 카드를 평가 시작 버튼 위에 렌더한다.
2. 카드 구성:
   - `[동의서 전문 보기]` — `/parent-consent` 를 새 탭으로 연다 (법적 동의서 전문).
   - `[동의 받음으로 표시]` (primary) — 클릭 시 확인 다이얼로그를 띄운다.
3. 확인 다이얼로그: "부모로부터 동의를 받으셨나요? 확인 시 동의 완료로 기록됩니다." → [취소] / [확인].
   - [확인] → server action 호출 → `parentConsentOnFileAt = now()`, `parentConsentVersion = CURRENT_PARENT_CONSENT_VERSION` 기록.
4. 기록 성공 시: 해당 경로 revalidate → 카드가 사라지고 "평가 시작" 버튼이 기존 게이팅 로직(`canEvaluate = !!parentConsentOnFileAt`)에 의해 활성화된다.
5. `parentConsentOnFileAt != null` 이면 카드를 **아예 렌더하지 않는다** (= 한 번 기록되면 안 보임, 기록 전에는 계속 보임).
6. 권한: **owner/admin 에게만** `[동의 받음으로 표시]` 버튼을 노출하고 실행을 허용한다. coach 에게는 안내 문구만 보이고 기록 버튼은 숨긴다. (전문 보기 링크는 모두 노출)

## 4. 데이터 / 재사용

- **스키마 변경 없음.** 기존 컬럼 사용: `students.parent_consent_on_file_at`, `students.parent_consent_version`.
- 동의 버전 상수 재사용: `CURRENT_PARENT_CONSENT_VERSION` (`src/lib/consent/version.ts`, 현재 `"2026-05-21-v2"`).
- 기록은 기존 `updateStudent`(`src/lib/students/actions.ts`)의 consent stamp 방식과 동일하게 처리한다.

## 5. 컴포넌트 / 인터페이스

### 5.1 server action — `recordParentConsent(studentId: string)`
- 위치: `src/lib/students/actions.ts` (기존 파일에 추가) 또는 동일 도메인 신규 파일.
- 가드: `requireRole(['owner','admin'])` + academy 격리(요청자 academyId 와 학생 academyId 일치 검증).
- 동작: 대상 학생의 `parentConsentOnFileAt` 이 이미 non-null 이면 **no-op** 으로 `{ ok: true }` 반환(멱등). null 이면 `now()` + `CURRENT_PARENT_CONSENT_VERSION` 기록.
- 성공 시 `revalidatePath('/students/[id]')` (해당 상세 + 목록 캐시 갱신).
- 반환: `{ ok: true } | { ok: false, error }`.

### 5.2 client 컴포넌트 — `consent-guidance-card.tsx`
- 위치: `src/app/(coach)/students/[id]/` 하위.
- props: `studentId`, `canRecordConsent`(= owner/admin 여부).
- 책임: 조건부 렌더(부모는 page.tsx에서 `parentConsentOnFileAt == null` 일 때만 마운트) · 전문보기 링크 · 기록 버튼 · 확인 다이얼로그(기존 UI 컴포넌트 재사용) · 액션 호출 · 로딩/에러 토스트.
- 의존: `recordParentConsent` server action, shadcn/ui dialog, sonner toast.

### 5.3 page 연결 — `students/[id]/page.tsx`
- `parentConsentOnFileAt == null && (owner|admin|coach)` 일 때 평가 시작 버튼 위에 `<ConsentGuidanceCard />` 삽입.
- 기존 동의 표시(36-38행 부근)·평가시작 게이팅(`canEvaluate`)은 변경하지 않는다.

## 6. 엣지 케이스 / 사이드이펙트

- 이미 동의된 학생: 카드 미렌더 + 액션도 멱등 no-op (중복 stamp 방지).
- coach 가 액션을 직접 호출(우회): 서버 가드에서 거부.
- 다른 academy 학생 id 로 호출: academy 격리 검증에서 거부.
- 동의 **해제**(되돌리기)는 이 기능 범위 밖 — 기존 학생 편집 토글에서 OFF (변경 없음).
- 동시성: 두 owner 가 동시에 클릭해도 멱등이라 결과 동일(한 번만 stamp).
- PIPA: 기록 시점에 version stamp 로 어느 동의서 버전 기준인지 남는다.

## 7. 테스트 (수용 기준)

1. 미동의 학생 상세(owner) → 카드 보임 → 기록 버튼 → 확인 다이얼로그 → 확인 → 카드 사라지고 "평가 시작" 활성.
2. 확인 다이얼로그에서 [취소] → 아무 변화 없음(미기록).
3. 이미 동의된 학생 상세 → 카드 안 보임.
4. coach 계정 상세 → 기록 버튼 숨김(안내 문구/전문보기 링크만), 액션 직접 호출 시 서버 거부.
5. `recordParentConsent` 멱등성: 이미 기록된 학생에 호출 → `{ok:true}`, 값/시각 불변.

## 8. 범위 밖 (YAGNI)

- 대시보드 온보딩 체크리스트 / 전역 동의 배너.
- 평가·업로드·검토 단계의 인라인 안내(stepper).
- 학생 목록 행의 기록 버튼.
- 동의 해제 UX.
- 동의서 artifact 파일 업로드(`parent_consent_artifact_url` 는 계속 미사용).
