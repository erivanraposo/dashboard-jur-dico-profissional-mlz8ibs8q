DO $$
BEGIN
  INSERT INTO storage.buckets (id, name, public) 
  VALUES ('process-attachments', 'process-attachments', false)
  ON CONFLICT (id) DO NOTHING;
END $$;

DROP POLICY IF EXISTS "authenticated_all_process_attachments_storage" ON storage.objects;
CREATE POLICY "authenticated_all_process_attachments_storage" ON storage.objects
FOR ALL TO authenticated USING (bucket_id = 'process-attachments') WITH CHECK (bucket_id = 'process-attachments');
