DO $$
BEGIN
  INSERT INTO storage.buckets (id, name, public) 
  VALUES ('legal-attachments', 'legal-attachments', false)
  ON CONFLICT (id) DO NOTHING;
END $$;

DROP POLICY IF EXISTS "Authenticated users can upload legal-attachments" ON storage.objects;
CREATE POLICY "Authenticated users can upload legal-attachments" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'legal-attachments');

DROP POLICY IF EXISTS "Authenticated users can select legal-attachments" ON storage.objects;
CREATE POLICY "Authenticated users can select legal-attachments" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'legal-attachments');

DROP POLICY IF EXISTS "Authenticated users can delete legal-attachments" ON storage.objects;
CREATE POLICY "Authenticated users can delete legal-attachments" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'legal-attachments');

ALTER TABLE public.process_attachments 
  DROP CONSTRAINT IF EXISTS process_attachments_process_id_fkey;

ALTER TABLE public.process_attachments 
  ADD CONSTRAINT process_attachments_process_id_fkey 
  FOREIGN KEY (process_id) REFERENCES public.processes(id) ON DELETE CASCADE;

DROP POLICY IF EXISTS "authenticated_all_process_attachments" ON public.process_attachments;
CREATE POLICY "authenticated_all_process_attachments" ON public.process_attachments
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
