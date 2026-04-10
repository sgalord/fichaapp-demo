-- ============================================================
-- GESTIÓN DE AUSENCIAS / VACACIONES
-- Ejecutar en Supabase SQL Editor
-- ============================================================

-- Tabla principal de ausencias
CREATE TABLE IF NOT EXISTS absences (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  worker_id    UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  type         TEXT NOT NULL CHECK (type IN ('vacation', 'personal_day', 'sick_leave', 'other')),
  date_from    DATE NOT NULL,
  date_to      DATE NOT NULL,
  reason       TEXT,
  document_url TEXT,            -- URL del justificante subido a Storage
  status       TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at  TIMESTAMPTZ,
  review_notes TEXT,            -- Motivo de rechazo o nota del admin
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT valid_date_range CHECK (date_to >= date_from)
);

-- Índices para rendimiento
CREATE INDEX IF NOT EXISTS absences_worker_id_idx ON absences(worker_id);
CREATE INDEX IF NOT EXISTS absences_date_from_idx ON absences(date_from);
CREATE INDEX IF NOT EXISTS absences_status_idx ON absences(status);

-- Row Level Security
ALTER TABLE absences ENABLE ROW LEVEL SECURITY;

-- Los trabajadores pueden VER sus propias ausencias
CREATE POLICY "workers_read_own_absences"
ON absences FOR SELECT TO authenticated
USING (worker_id = auth.uid());

-- Los trabajadores pueden CREAR sus propias ausencias
CREATE POLICY "workers_insert_own_absences"
ON absences FOR INSERT TO authenticated
WITH CHECK (worker_id = auth.uid());

-- Los trabajadores pueden ACTUALIZAR sus ausencias pendientes (cancelar)
CREATE POLICY "workers_update_own_pending_absences"
ON absences FOR UPDATE TO authenticated
USING (worker_id = auth.uid() AND status = 'pending')
WITH CHECK (worker_id = auth.uid());

-- Los trabajadores pueden ELIMINAR sus ausencias pendientes
CREATE POLICY "workers_delete_own_pending_absences"
ON absences FOR DELETE TO authenticated
USING (worker_id = auth.uid() AND status = 'pending');

-- Los admins pueden hacer TODO
CREATE POLICY "admins_all_absences"
ON absences FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role IN ('admin', 'superadmin')
  )
);

-- ============================================================
-- STORAGE BUCKET: absence-documents
-- Ejecutar en Supabase Dashboard > Storage > New Bucket
-- Nombre: absence-documents
-- Public: false (privado, requiere URL firmada o service role)
-- O ejecutar el siguiente SQL:
-- ============================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'absence-documents',
  'absence-documents',
  false,
  10485760,   -- 10 MB
  ARRAY['image/jpeg','image/png','image/webp','application/pdf']
)
ON CONFLICT (id) DO NOTHING;

-- Política Storage: trabajadores suben sus propios justificantes
CREATE POLICY "workers_upload_own_documents"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'absence-documents'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Política Storage: trabajadores y admins leen documentos
CREATE POLICY "workers_read_own_documents"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'absence-documents'
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('admin', 'superadmin')
    )
  )
);

-- Política Storage: admins eliminan cualquier documento
CREATE POLICY "admins_delete_documents"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'absence-documents'
  AND EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role IN ('admin', 'superadmin')
  )
);
