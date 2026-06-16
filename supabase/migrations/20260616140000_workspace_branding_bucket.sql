-- Create storage bucket for workspace branding
INSERT INTO storage.buckets (id, name, public)
VALUES ('workspace-branding', 'workspace-branding', false)
ON CONFLICT (id) DO NOTHING;

-- RLS policies for the bucket objects
DROP POLICY IF EXISTS "Authenticated users can manage workspace branding" ON storage.objects;
CREATE POLICY "Authenticated users can manage workspace branding" ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id = 'workspace-branding')
  WITH CHECK (bucket_id = 'workspace-branding');

-- Add DELETE policy for workspace_branding table since it was missing
DROP POLICY IF EXISTS "wb_delete_own" ON public.workspace_branding;
CREATE POLICY "wb_delete_own" ON public.workspace_branding
  FOR DELETE TO authenticated
  USING (workspace_id IN ( SELECT profiles.workspace_id FROM profiles WHERE (profiles.id = auth.uid())));
