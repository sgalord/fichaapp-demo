/**
 * Audit logging para acciones de administración.
 *
 * Requiere ejecutar en Supabase:
 *
 * CREATE TABLE IF NOT EXISTS audit_logs (
 *   id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
 *   admin_id    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
 *   action      TEXT NOT NULL,
 *   target_type TEXT NOT NULL,
 *   target_id   TEXT,
 *   target_name TEXT,
 *   details     JSONB,
 *   created_at  TIMESTAMPTZ DEFAULT NOW()
 * );
 * ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
 * CREATE POLICY "Admins can view audit logs" ON audit_logs FOR SELECT
 *   USING (EXISTS (
 *     SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'superadmin')
 *   ));
 * -- Solo service role puede insertar (sin política INSERT = denegado a anon/user)
 */

import { createAdminClient } from '@/lib/supabase/server'

export type AuditAction =
  | 'create_worker'
  | 'update_worker'
  | 'delete_worker'
  | 'toggle_worker_active'
  | 'edit_checkin'
  | 'delete_checkin'
  | 'import_workers'
  | 'create_obra'
  | 'update_obra'
  | 'delete_obra'

export type AuditTargetType = 'worker' | 'checkin' | 'obra' | 'import'

export interface AuditEntry {
  adminId: string
  action: AuditAction
  targetType: AuditTargetType
  targetId?: string
  targetName?: string
  details?: Record<string, unknown>
}

/**
 * Registra una acción de administración en audit_logs.
 * Falla silenciosamente para no interrumpir la operación principal.
 */
export async function logAudit(entry: AuditEntry): Promise<void> {
  try {
    const admin = await createAdminClient()
    await admin.from('audit_logs').insert({
      admin_id:    entry.adminId,
      action:      entry.action,
      target_type: entry.targetType,
      target_id:   entry.targetId ?? null,
      target_name: entry.targetName ?? null,
      details:     entry.details ?? null,
    })
  } catch {
    // No propagamos el error — el audit no debe bloquear la operación principal
    console.error('[audit] Failed to write audit log:', entry.action, entry.targetId)
  }
}
