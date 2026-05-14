-- 0009_storage_bucket_student_videos.sql
-- 적용 시점: D6 PIPA 게이트 제거 후 영상 분석 path 켜기 위한 첫 단계.
-- 의미: student 영상 업로드용 Supabase Storage bucket + academy_id prefix
--   기반 RLS isolation. Service-role 은 RLS bypass 라 upload-action.ts 의
--   createSignedUploadUrl 은 영향 X — RLS 는 미래의 authenticated 클라이언트
--   액세스 경로에 대한 defense-in-depth.
--
--   Path convention (upload-action.ts:23): "{academyId}/{evaluationId}.mp4"
--   → storage.foldername(name)[1] = academy_id

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'student-videos',
  'student-videos',
  false,  -- private; signed URL 로만 access
  524288000,  -- 500 MB 제한
  ARRAY['video/mp4', 'video/quicktime', 'video/webm', 'video/x-matroska']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types,
  updated_at = now();

-- Academy isolation — authenticated 클라이언트는 자기 학원 폴더만
DROP POLICY IF EXISTS "student_videos_academy_isolation" ON storage.objects;
CREATE POLICY "student_videos_academy_isolation"
ON storage.objects
FOR ALL
TO authenticated
USING (
  bucket_id = 'student-videos'
  AND (storage.foldername(name))[1] = (
    SELECT academy_id::text FROM public.users WHERE id = auth.uid()
  )
)
WITH CHECK (
  bucket_id = 'student-videos'
  AND (storage.foldername(name))[1] = (
    SELECT academy_id::text FROM public.users WHERE id = auth.uid()
  )
);

COMMENT ON POLICY "student_videos_academy_isolation" ON storage.objects IS
  'student-videos bucket academy_id 폴더 prefix isolation. service_role 은 RLS bypass — 실제 모든 쓰기는 service-role 핸들러 경유.';
