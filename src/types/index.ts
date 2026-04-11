export type Role = 'worker' | 'admin' | 'superadmin'
export type CheckInType = 'in' | 'out'

export interface Profile {
  id: string
  full_name: string
  username: string | null
  phone: string | null
  role: Role
  active: boolean
  avatar_url: string | null
  birthday: string | null   // ISO date YYYY-MM-DD
  dni: string | null
  specialty: string | null
  created_at: string
  updated_at: string
}

export interface Obra {
  id: string
  name: string
  address: string | null
  latitude: number | null
  longitude: number | null
  radius: number           // metros
  active: boolean
  created_at: string
  updated_at: string
}

export interface ObraAssignment {
  id: string
  obra_id: string
  worker_id: string | null
  group_id: string | null
  date: string             // ISO date YYYY-MM-DD
  created_at: string
  // Joins
  obra?: Pick<Obra, 'id' | 'name' | 'address'>
  worker?: Pick<Profile, 'id' | 'full_name'>
}

export interface Group {
  id: string
  name: string
  description: string | null
  created_at: string
}

export interface UserGroup {
  user_id: string
  group_id: string
}

export interface WorkLocation {
  id: string
  name: string
  address: string | null
  date: string          // ISO date: 'YYYY-MM-DD'
  latitude: number
  longitude: number
  radius: number        // metros
  active: boolean
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface LocationAssignment {
  id: string
  work_location_id: string
  worker_id: string | null
  group_id: string | null
}

export interface CheckIn {
  id: string
  worker_id: string
  work_location_id: string | null
  type: CheckInType
  latitude: number | null
  longitude: number | null
  distance_meters: number | null
  within_radius: boolean
  notes: string | null
  manually_modified: boolean
  modified_by: string | null
  modified_at: string | null
  photo_url: string | null
  device_fingerprint: string | null
  timestamp: string
  created_at: string
  // Joins
  worker?: Pick<Profile, 'id' | 'full_name'>
  work_location?: Pick<WorkLocation, 'id' | 'name' | 'address'>
}

// ── Ausencias / Vacaciones ──────────────────────────────────────────────────
export type AbsenceType = 'vacation' | 'personal_day' | 'sick_leave' | 'other'
export type AbsenceStatus = 'pending' | 'approved' | 'rejected'

export const ABSENCE_TYPE_LABELS: Record<AbsenceType, string> = {
  vacation:    'Vacaciones',
  personal_day: 'Asunto propio',
  sick_leave:  'Baja / Enfermedad',
  other:       'Otro',
}

export const ABSENCE_STATUS_LABELS: Record<AbsenceStatus, string> = {
  pending:  'Pendiente',
  approved: 'Aprobado',
  rejected: 'Rechazado',
}

export interface Absence {
  id: string
  worker_id: string
  type: AbsenceType
  date_from: string           // ISO date YYYY-MM-DD
  date_to: string             // ISO date YYYY-MM-DD
  reason: string | null
  document_url: string | null // URL del justificante (Storage)
  status: AbsenceStatus
  reviewed_by: string | null
  reviewed_at: string | null
  review_notes: string | null
  admin_note: string | null
  created_at: string
  updated_at: string
  // Joins
  worker?: Pick<Profile, 'id' | 'full_name' | 'avatar_url'>
}

// Tipos para las respuestas de la API
export interface ApiResponse<T = unknown> {
  data?: T
  error?: string
}

export interface DailySummary {
  total_workers: number
  checked_in_today: number
  checked_out_today: number
  pending: number
}

export interface WorkerWithStatus extends Profile {
  last_check_in?: CheckIn | null
  groups?: Group[]
}

// Para el formulario de nueva ubicación
export interface WorkLocationForm {
  name: string
  address: string
  date: string
  latitude: number
  longitude: number
  radius: number
  assignTo: 'all' | 'groups' | 'workers'
  groupIds: string[]
  workerIds: string[]
}
