-- 0016_storage_bucket_submission_videos.sql
-- 적용 시점: 0015 이후. B2C 소비자 영상 업로드 버킷 (WS2.6).
-- Source: work-log/2026-06-04 B2C Phase A 구현 명세.md — WS2.6.
-- 의미: 0009(student-videos) 일반화. 소비자 업로드용 신규 private 버킷.
--   academy_id prefix 대신 uploader(auth.uid()) prefix 기반 RLS isolation.
--   Service-role 은 RLS bypass — upload-action 의 서명 업로드는 영향 X.
--
--   Path convention (WS3.1): "{uploaderId}/{submissionId}.mp4"
--   → storage.foldername(name)[1] = auth.uid()::text

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'submission-videos',
  'submission-videos',
  false,  -- private; signed URL 로만 access
  524288000,  -- 500 MB 제한 (0009 와 동일)
  ARRAY['video/mp4', 'video/quicktime', 'video/webm', 'video/x-matroska']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types,
  updated_at = now();

-- ─── Uploader isolation 정책 (storage.objects) ───────────────────────
-- 주의: 최신 Supabase 는 storage.objects 의 owner 가 supabase_storage_admin 이라
--   postgres 풀러 연결/대시보드 SQL Editor 에서 CREATE POLICY 시 42501
--   "must be owner of relation objects" 로 막힌다. 따라서 이 정책은 SQL 마이그
--   레이션으로 적용 불가 → Supabase 대시보드 Storage → Policies UI 로 생성.
--
-- 단, 이 정책은 기능상 필수가 아닌 defense-in-depth: 업로드/다운로드는 전부
--   service-role 서명 URL(RLS bypass) + 앱 레이어 인가로 처리되므로 authenticated
--   클라이언트가 storage.objects 에 직접 접근하지 않는다. Phase A 는 없어도 동작.
--
-- UI 로 추가할 정책 (bucket: submission-videos, target role: authenticated, FOR ALL):
--   USING / WITH CHECK:
--     bucket_id = 'submission-videos'
--     AND (storage.foldername(name))[1] = auth.uid()::text
--   → uploader(auth.uid()) 폴더 prefix isolation.
