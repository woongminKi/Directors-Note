# 2026-06-02 평가 기준 reference 영상 등록

## 작업 내용
원장(친구)이 보낸 평가 기준 영상 6개(상/중/하 각 2개)를 카타르시스 연기학원 reference set으로 등록. 학생 영상 분석 시 코사인 매칭의 기준이 됨.

- Academy: `554c68ef-3244-44a3-96a1-397185ad41ea` (카타르시스 연기학원)

## tier 매핑 (결정)
시스템은 A/B/C/D 4단계, 친구는 상/중/하 3단계 → **상→A, 중→B, 하→C** 로 매핑 (연속 3단계, 점수 base 8.0/6.5/5.0). 하급을 D(3.5, 낙제)로 보지 않는 해석. D 미사용.

## 등록 결과 (총 6개 — 2A / 2B / 2C, 모두 1408d Vertex 임베딩)
| 파일 | tier | scene_type | reference_video.id |
|------|------|-----------|--------------------|
| 상1 | A | modern_monologue | 2957c2e9-06af-40d4-9cea-318ffab9b25c |
| 상2 | A | modern_monologue | cd359891-5a66-41dd-b373-60e7115b898a |
| 중1 | B | modern_monologue | e7a5a235-1932-417f-b2e0-df06927bfabf |
| 중2 | B | modern_monologue | e964f8c4-a0ef-406d-982f-ba5d1bffd984 |
| 하1 | C | modern_monologue | f32bc54c-feb4-4d2c-92e6-f547edb5723f |
| 하2 | C | modern_monologue | b286cbde-201c-4253-886a-3240239d8ac8 |

- scene_type은 매칭에 영향 없음(코사인 RPC가 장면유형 무관 비교) — 전부 `modern_monologue`로 라벨링. technique_tag = "원장 기준영상 (상/중/하)".

## 사전 정리
- 기존 테스트 시드 `3b5ee32a`(tier A, 5/29 smoke-test) 삭제 → 친구 큐레이션 영상만 매칭 기준으로 남김. (사용자가 Supabase SQL Editor에서 직접 DELETE, embeddings는 CASCADE. Storage의 `…/3b5ee32a….mp4`는 orphan으로 남았으나 매칭 무관·무해)

## 등록 방법
`scripts/seed-reference-video.ts` (로컬 mp4 → Supabase Storage 업로드 → GCS staging → Vertex multimodalembedding@001 1408d → reference_videos + embeddings INSERT). 영상당 ≈$0.001.

## 파일 위치 / git
- 원본은 카톡 임시 캐시에서 수신 → 사용자가 프로젝트 `downloads/` 에 상1~하2 이름으로 정리.
- `.gitignore`에 `downloads/` 등록되어 git 추적 안 됨 (실제 연기 영상 = PIPA 민감정보, 커밋 금지). `.gitignore` 변경 미커밋 상태.

## 남은 것 / 검증 권장
- 친구가 **실제 학생 영상**(reference와 다른 영상)으로 평가 1건 돌려 등급이 합리적으로 갈리는지 확인. (reference와 동일 영상 업로드 시 코사인 100%→A 나옴 — self-match 주의)
- v1 한계: 단일 임베딩이라 3축(발성/표정/입시완성도) 독립 측정 아님 — 같은 점수로 broadcast.
