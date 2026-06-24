DO $$
BEGIN
  -- Add DELETE policy for storage process-attachments if it doesn't exist.
  DROP POLICY IF EXISTS "Allow authenticated to delete process attachments" ON storage.objects;
  CREATE POLICY "Allow authenticated to delete process attachments"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'process-attachments');
END $$;
