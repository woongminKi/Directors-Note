# Notifications (Foundation + Web Push + PWA Install) — Design Spec

**Date:** 2026-06-05
**Scope:** Phase A 잔여 D-② (알림). 이번 사이클 = **공통토대 + 웹푸시 + PWA 설치형**. 알림톡 실발송·네이티브 앱은 후속.
**Status:** Approved (design), pre-implementation

## 1. 목적

B2C 마켓플레이스는 소비자·평가자 양쪽이 상태 변화를 기다린다. 현재 알림 인프라가 전혀 없어
대시보드를 직접 열어야 확인된다. 이 작업은 **채널 불문(channel-agnostic) 알림 공통토대**를 만들고,
첫 채널로 **웹 푸시**를 구현하며, 앱처럼 쓰도록 **PWA 설치형**을 갖춘다. 알림톡·네이티브 푸시는
같은 토대에 어댑터로 후속 연결한다(재작업 없음).

## 2. 범위

**이번 사이클 (출시 가능):**
- 알림 공통토대: 아웃박스 테이블 + `NotificationChannel` 추상화 + dispatch + cron 재시도
- 이벤트 훅 3종: `submission_released`(→소비자), `evaluator_assigned`(→평가자), `submission_scored`(→소비자)
- 웹 푸시 채널: 서비스워커 + VAPID + 구독 저장 + 권한 요청 UI
- PWA 설치형: manifest 보강 + 설치 프롬프트(Android beforeinstallprompt / iOS 수동 안내)
- 알림톡 채널: **인터페이스 stub만**(flag off, 미발송)

**비범위 (후속 사이클):**
- 알림톡 실발송 — 전화번호 수집 + 카카오 비즈채널·사업자·대행사·템플릿 심사 선행
- 네이티브 RN/Capacitor 앱 + APNs/FCM
- in-app 알림센터, 이메일, 사용자별 알림 선호도 설정, 결제/환불 알림(D-③ 의존)

## 3. 재사용 / 신규 / 비범위

**재사용:**
- factory + feature-flag 패턴 (`src/lib/evaluation/factory.ts` 동형)
- `/api/cron/*` 인프라 — CRON_SECRET 인증 + proxy allowlist(D-① 에서 이미 구축/면제)
- 이벤트 훅 지점: `releaseSubmission`(release-action.ts), `assignSubmission`(assignment/actions.ts), `submitEvaluatorScore`(score-action.ts)
- `after()` (next/server) — 응답 후 비차단 작업

**신규:** 아래 4·5·6·7 절 전부.

## 4. 아키텍처

```
[server action: tx commit 성공 후]
   │ enqueueNotification({ userId, type, channel:'web_push', title, body, url })
   ▼
 notifications 아웃박스 (status=pending)
   │
   ├─ after(() => dispatchNotification(id))   ← 평시 즉시 전달(비차단)
   └─ GET /api/cron/dispatch-notifications (daily) → drainPending()  ← 재시도 안전망
   ▼
 createNotificationChannel(channel) → NotificationChannel.send()
   ├─ WebPushChannel   : push_subscriptions 조회 → web-push 로 발송, 404/410 → 죽은 구독 삭제
   └─ AlimTalkChannel  : stub — { ok:false, error:'alimtalk_not_configured', retryable:false }
```

**즉시시도 + cron 재시도 근거:** Hobby 는 daily cron 만 허용 → cron 단독 드레인은 최대 24h 지연(알림
부적합). 따라서 `after()` 로 응답 후 즉시 1회 시도하고, 실패/누락분만 daily cron 이 재시도한다.
`after()` 를 쓰는 이유: 서버리스에서 un-awaited 프로미스는 응답 종료 시 죽을 수 있음.

## 5. DB

**마이그레이션 0018 (테이블) + 0019 (RLS)** — 기존 0014/0015 분리 컨벤션을 따른다. `schema.ts` 동시 갱신.

**`push_subscriptions`** — 사용자 푸시 구독:
- `id uuid PK, user_id uuid FK→users, endpoint text NOT NULL, p256dh text NOT NULL, auth text NOT NULL, created_at timestamptz`
- `UNIQUE(endpoint)` — 동일 구독 중복 방지(upsert 타깃)
- RLS: 본인(`user_id = auth.uid()`) 행만 select/insert/delete. 시스템(service-role)은 발송 시 조회.

**`notifications`** — 아웃박스:
- `id uuid PK, user_id uuid FK→users, type notification_type, channel notification_channel, title text, body text, url text, status notification_status DEFAULT 'pending', attempts int DEFAULT 0, last_error text, created_at timestamptz, sent_at timestamptz`
- enums: `notification_type('submission_released','evaluator_assigned','submission_scored')`, `notification_channel('web_push','alimtalk')`, `notification_status('pending','sent','failed')`
- RLS: service-role 전용(시스템 write/send). 소비자/평가자 직접 접근 없음(in-app 센터는 비범위).

## 6. 채널 추상화 (`src/lib/notifications/`)

- `types.ts`
  - `EnqueueInput = { userId, type, channel, title, body, url }`
  - `interface NotificationChannel { send(n: NotificationRow): Promise<SendResult> }`
  - `type SendResult = { ok: true } | { ok: false; error: string; retryable: boolean }`
- `factory.ts` — `createNotificationChannel(channel): NotificationChannel` (flag 게이트)
- `web-push-channel.ts` — `WebPushChannel implements NotificationChannel`
  - `push_subscriptions` 에서 user 의 구독 전부 조회 → 각 구독에 `webpush.sendNotification(sub, payload)` 발송
  - payload: `{ title, body, url }` (JSON). **점수/등급 절대 미포함 — P2.**
  - 404/410 응답 → 해당 구독 row 삭제(죽은 endpoint). 그 외 오류 → `retryable:true`.
- `alimtalk-channel.ts` — `AlimTalkChannel` stub: 항상 `{ ok:false, error:'alimtalk_not_configured', retryable:false }`
- `actions.ts` (server-only)
  - `enqueueNotification(input)` — 아웃박스 insert(status pending) 후 id 반환
  - `dispatchNotification(id)` — row 로드 → 채널 send → 성공 `status='sent', sent_at` / 실패 `status='failed', attempts++, last_error`
  - `drainPendingNotifications()` — `status='pending' OR (status='failed' AND attempts < MAX_ATTEMPTS)` 를 순회 dispatch(cron 용). `MAX_ATTEMPTS=5`.

## 7. 클라이언트 — 웹 푸시 + PWA 설치

**서비스워커** `public/sw.js`:
- `push` 이벤트 → `event.data.json()` 파싱 → `showNotification(title, { body, data:{url} })`
- `notificationclick` → 해당 `url` 로 `clients.openWindow`

**구독/권한 UI** (클라이언트 컴포넌트, 로그인 소비자·평가자에 노출):
- `Notification.permission` 확인 → 'default' 면 활성화 CTA 노출
- 허용 시: SW 등록 → `registration.pushManager.subscribe({ userVisibleOnly:true, applicationServerKey: NEXT_PUBLIC_VAPID_PUBLIC_KEY })` → 구독을 server action `savePushSubscription(sub)` 로 전송 → `push_subscriptions` upsert(endpoint 충돌 시 갱신)
- **권한 grant = opt-in.** 별도 선호도 테이블 없음(YAGNI).

**PWA 설치형:**
- `src/app/manifest.ts`(또는 기존 `public/site.webmanifest` 보강) — name/short_name/icons(192·512)/start_url/display:standalone/theme_color/background_color
- 설치 프롬프트 컴포넌트: Android/Chrome 은 `beforeinstallprompt` 캡처 후 CTA; **iOS Safari 는 `beforeinstallprompt` 미지원** → "공유 → 홈 화면에 추가" 수동 안내 노출(iOS 설치 PWA 에서만 웹푸시 동작, 16.4+)

## 8. 이벤트별 문구 (점수/등급 절대 미포함 — P2)

| type | 수신자 | title / body | url |
|---|---|---|---|
| `submission_released` | uploader(소비자) | "결과가 준비됐어요" / "확인해 보세요" | `/submissions/[id]` |
| `evaluator_assigned` | evaluator | "새 채점 배정" / "48시간 내에 채점해 주세요" | `/score/[submissionId]` |
| `submission_scored` | uploader(소비자) | "채점이 끝났어요" / "결제 후 결과가 공개됩니다" | `/submissions/[id]` |

훅 위치:
- `releaseSubmission`: status `scored→released` 갱신 tx commit 후 → uploader 에게 `submission_released`
- `submitEvaluatorScore`: primary 점수로 `assigned→scored` 후 → uploader 에게 `submission_scored`
- `assignSubmission`: primary claim 성공 후(`assigned`) → evaluator 에게 `evaluator_assigned`(redundant 라벨은 알림 없음)

## 9. env / 의존성

신규 server env: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`(mailto:/https), `FEATURE_WEB_PUSH(default false)`.
신규 client env: `NEXT_PUBLIC_VAPID_PUBLIC_KEY`.
알림톡 stub 용 optional: `KAKAO_ALIMTALK_API_KEY`, `KAKAO_ALIMTALK_SENDER_KEY`(미설정 OK — stub).
**신규 의존성 `web-push` — 사용자 승인 완료.** VAPID 키: `npx web-push generate-vapid-keys` 로 생성.

## 10. 에러 처리 / 멱등성

- `dispatchNotification` 은 이미 `sent` 인 row 는 skip(중복 발송 방지). `after()` 즉시시도와 cron 재시도가 겹쳐도 안전.
- WebPush 발송은 구독별 best-effort. 일부 구독 실패해도 나머지 발송. 전부 실패 시 `failed` + 재시도 대상.
- 404/410 구독은 즉시 삭제(영구 죽음 — 재시도 무의미).
- `enqueueNotification` 실패가 본 액션(release/assign/score) 을 깨면 안 됨 — 알림 enqueue 는 액션 tx **밖**에서, 실패해도 로깅 후 액션은 성공 유지(알림은 부가 기능).
- `FEATURE_WEB_PUSH=false` 면 **web_push 채널 enqueue 자체를 skip**한다(영구 미발송 pending 행을 만들지 않음). 즉 `enqueueNotification` 이 channel='web_push' && flag off 면 no-op 후 즉시 반환. 플래그 ON 시에만 행 생성·발송.

## 11. 테스트

- 단위: `enqueueNotification` 행 생성 / `dispatchNotification` 채널 선택·sent 전이·중복 skip / WebPushChannel 404→구독 삭제(web-push 모킹)·정상 발송 / AlimTalk stub not_configured / 문구에 숫자·등급 없음(스냅샷) / cron 라우트 인증(401/200) + drain.
- 통합(DB-gated, 기존 가드 재사용): release/assign/score 액션 호출 → 해당 `notifications` 행이 올바른 user_id·type 으로 생성됨. `push_subscriptions` upsert(endpoint 충돌 갱신) RLS 본인 한정.
- 서비스워커·브라우저 PushManager 는 단위 테스트 비대상(수동/E2E) — 발송 서버 경로만 모킹 검증.

## 12. 사이드 이펙트 점검

- 액션 3종에 enqueue 호출 추가 — tx 밖·실패 격리라 기존 동작/테스트 회귀 없음.
- 신규 테이블·enum 은 기존 스키마 비침습. RLS 추가는 신규 테이블 한정.
- 새 cron(`/api/cron/dispatch-notifications`)은 기존 sweep cron 과 독립. proxy allowlist(`/api/cron`)·CRON_SECRET 재사용.
- `web-push` 의존성 1개 추가(승인됨). `FEATURE_WEB_PUSH` 기본 false 라 미설정 환경 영향 없음. VAPID env 미설정 시 t3-env 가 어떻게 다룰지: VAPID 키는 `FEATURE_WEB_PUSH` 가 true 일 때만 필요하므로 **optional 로 두고 factory 에서 런타임 체크**(false 기본이라 빌드 깨지지 않음).

## 13. 후속 (이 토대 위에 얹힘 — 재작업 없음)

- **알림톡**: `AlimTalkChannel` 구현(대행사 HTTP) + 전화번호 수집(가입/인테이크) + 카카오 비즈채널·템플릿 심사. 채널 enum·아웃박스·dispatch 그대로 재사용.
- **네이티브 앱**: RN/Capacitor 래퍼 + `FcmChannel`/`ApnsChannel` 추가. 동일 추상화에 채널만 추가.
