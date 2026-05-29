DO $$
BEGIN
  ALTER TABLE public.process_attachments ALTER COLUMN process_id DROP NOT NULL;
EXCEPTION
  WHEN others THEN null;
END $$;

INSERT INTO storage.buckets (id, name, public) 
VALUES ('process-attachments', 'process-attachments', false)
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
  DROP POLICY IF EXISTS "Authenticated users can upload to process-attachments" ON storage.objects;
  DROP POLICY IF EXISTS "Authenticated users can select from process-attachments" ON storage.objects;

  CREATE POLICY "Authenticated users can upload to process-attachments"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'process-attachments');

  CREATE POLICY "Authenticated users can select from process-attachments"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'process-attachments');
END $$;
