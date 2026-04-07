export type Role = 'worker' | 'admin' | 'superadmin'
export type CheckInType = 'in' | 'out'

export interface Profile {
  id: string
  full_name: string
  phone: string | null
  role: Role
  active: boolean
  created_at: string
  updated_at: string
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
  timestamp: string
  created_at: string
  // Joins
  worker?: Pick<Profile, 'id' | 'full_name'>
  work_location?: Pick<WorkLocation, 'id' | 'name' | 'address'>
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
