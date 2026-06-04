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

-- Uploader isolation — authenticated 클라이언트는 자기 폴더(auth.uid())만.
DROP POLICY IF EXISTS "submission_videos_uploader_isolation" ON storage.objects;
CREATE POLICY "submission_videos_uploader_isolation"
ON storage.objects
FOR ALL
TO authenticated
USING (
  bucket_id = 'submission-videos'
  AND (storage.foldername(name))[1] = auth.uid()::text
)
WITH CHECK (
  bucket_id = 'submission-videos'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

COMMENT ON POLICY "submission_videos_uploader_isolation" ON storage.objects IS
  'submission-videos 버킷 uploader(auth.uid()) 폴더 prefix isolation. service_role 은 RLS bypass — 실제 모든 쓰기는 service-role 핸들러 경유 (0009 패턴 일반화).';
