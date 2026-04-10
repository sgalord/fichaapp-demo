# APP PARA FICHAR — Contexto del proyecto

## INSTRUCCIÓN PERMANENTE: Auto-actualización de este archivo
Actualiza este archivo CLAUDE.md **inmediatamente** después de cualquier cambio que:
- Cree una nueva ruta API (`/api/...`) o página de admin/worker
- Modifique el esquema de la BD (nuevas tablas, columnas, RLS)
- Introduzca un nuevo patrón, convención o dependencia clave
- Cambie la configuración de Supabase, Storage o Auth
- Añada o elimine módulos principales del proyecto

Cuando actualices CLAUDE.md, haz también `git add CLAUDE.md && git commit -m "docs: update CLAUDE.md"` en el mismo push que los demás cambios.

## Stack
- **Next.js 16** App Router + Turbopack
- **Supabase** (PostgreSQL + Auth + Realtime + Storage)
- **Tailwind CSS** dark theme (zinc palette, BUILT branding)
- Desplegado en **Vercel** desde `main` branch
- Repo: `https://github.com/sgalord/fichaapp.git`

## Ejecutar build
```
node "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" run build
```
Usar Desktop Commander `start_process` con `cmd.exe`, luego `interact_with_process`.

## Arquitectura de rutas
```
/login              → login por email O usuario (campo username en profiles)
/worker             → pantalla principal trabajador (GPS + foto + fichar)
/worker/history     → historial de fichajes
/worker/profile     → editar perfil (nombre, DNI, cumpleaños, especialidad, contraseña)
/admin              → dashboard admin
/admin/workers      → CRUD trabajadores
/admin/obras        → CRUD obras (centros de trabajo permanentes)
/admin/asignaciones → asignar trabajadores a obras por día/semana
/admin/checkins     → historial fichajes + detección fraude dispositivo
/admin/ausencias    → gestión de ausencias/vacaciones (aprobar/rechazar)
/admin/groups       → grupos de trabajadores
/admin/reports      → informes
/worker/ausencias   → solicitar y ver ausencias (trabajador)
/admin/import       → importar 20 trabajadores desde Excel (un clic)
/forgot-password    → recuperar contraseña
/reset-password     → nueva contraseña (PKCE flow)
/auth/callback      → callback de Supabase auth
```

## API Routes
```
POST /api/auth/username          → busca email por username
GET  /api/workers                → lista trabajadores activos
POST /api/workers                → crear trabajador (genera username auto)
GET  /api/workers/[id]           → devuelve email del trabajador
PUT  /api/workers/[id]           → actualiza perfil + auth + grupos + username
DELETE /api/workers/[id]         → solo superadmin
POST /api/checkin                → registrar fichaje (lat/lng/foto/fingerprint/obra_id)
GET/PUT/DELETE /api/checkins/[id]
GET  /api/obras                  → lista obras
POST /api/obras                  → crear obra
PUT/DELETE /api/obras/[id]
GET  /api/obra-assignments       → asignaciones (filtros: date, date_from, date_to, worker_id, obra_id)
POST /api/obra-assignments       → crear asignación (detecta conflicto, ?force=1 para ignorarlo)
DELETE /api/obra-assignments/[id]
GET  /api/admin/import-workers   → preview de los 20 trabajadores a importar
POST /api/admin/import-workers   → ejecuta la importación (crea users + obras)
GET  /api/absences               → lista ausencias (workers: solo las suyas; admins: todas + filtros)
POST /api/absences               → crear solicitud de ausencia
GET/PUT/DELETE /api/absences/[id] → ver/aprobar-rechazar/eliminar ausencia
GET  /api/geocode?address=...    → geocodificación de dirección
GET/POST /api/locations          → ubicaciones legacy (sistema antiguo)
GET/PUT/DELETE /api/locations/[id]
GET/POST /api/groups
```

## Base de datos — tablas clave

### profiles (extendida de auth.users)
```sql
id UUID, full_name TEXT, username TEXT UNIQUE, phone TEXT,
role TEXT ('worker'|'admin'|'superadmin'), active BOOLEAN,
avatar_url TEXT, birthday DATE, dni TEXT, specialty TEXT,
created_at, updated_at
```

### obras (centros de trabajo permanentes)
```sql
id UUID, name TEXT, address TEXT,
latitude DOUBLE PRECISION, longitude DOUBLE PRECISION,
radius INTEGER DEFAULT 200, active BOOLEAN, created_at, updated_at
```

### obra_assignments (trabajador → obra → día)
```sql
id UUID, obra_id UUID→obras, worker_id UUID→profiles,
group_id UUID→groups, date DATE, created_at
```

### check_ins
```sql
id UUID, worker_id UUID, work_location_id UUID (legacy),
type 'in'|'out', latitude, longitude, distance_meters,
within_radius BOOLEAN, notes TEXT, manually_modified BOOLEAN,
photo_url TEXT, device_fingerprint TEXT, timestamp, created_at
```

### work_locations (sistema legacy, todavía activo)
```sql
id UUID, name TEXT, address TEXT, date DATE,
latitude, longitude, radius INTEGER, active BOOLEAN, created_by UUID
```

## Storage buckets
- `checkin-photos` → fotos de fichajes (`{worker_id}/{timestamp}.jpg`)
- `avatars` → fotos de perfil (`{worker_id}/avatar.jpg`, siempre upsert:true)
- `absence-documents` → justificantes de ausencias (`{worker_id}/{timestamp}.{ext}`, privado, max 10 MB)

## Patrones importantes
- **upsert:true** siempre en uploads de avatars (evita error "file already exists")
- **createAdminClient()** (service role) para bypass de RLS en operaciones admin
- **`const sb = supabase as any`** para queries con joins que causan "Type instantiation is excessively deep"
- Login: si el campo no contiene `@` → fetch POST /api/auth/username → obtiene email → auth normal
- Fingerprint del dispositivo: SHA-256 de hardware+canvas → 24 chars → guarda en check_ins
- Username format: `nombre.apellido` (primera palabra de cada uno, sin tildes, lowercase)
- **Contraseñas de importación**: se generan aleatoriamente con `crypto.randomBytes` — se devuelven UNA VEZ en la respuesta POST y no se almacenan. Mostrar al admin en `/admin/import`.
- **Validación**: usar **Zod** en todos los API routes. Patrón: `Schema.safeParse(body)` → devolver `{ error: message }` con 400 si falla.
- **Audit logging**: llamar `logAudit()` de `@/lib/audit` tras cada operación admin destructiva. Falla silenciosamente.
- **Rate limiting**: usar `rateLimit()` de `@/lib/rate-limit` en endpoints públicos sensibles. 10 req / 15 min por IP en `/api/auth/username`.
- **obra_id en checkin**: `POST /api/checkin` acepta `obra_id` (sistema nuevo, busca en `obras`) y `work_location_id` (legacy). Si `obra_id` presente, calcula distancia con `createAdminClient()` contra tabla `obras`.
- **worker/page.tsx usa Server Action** `getWorkerObras()` de `src/app/worker/actions.ts` para obtener obras de hoy/mañana. Corre en el servidor con `createAdminClient()` → bypass total de RLS, sin problemas de cookies ni tokens.
- **tomorrowISO()** exportada desde `@/lib/utils` usando date-fns (hora local, no UTC).
- **GET /api/obra-assignments**: admins ven todo; workers solo sus propias filas (forzado server-side). Soporta Bearer token + fallback cookie.

## Seguridad — reglas clave
- Todos los endpoints de admin requieren `requireAdmin()` — incluido GET `/api/admin/import-workers`
- `/api/auth/username` tiene rate limiting (10/15min por IP) y devuelve mensaje genérico para evitar enumeración
- Datos de trabajadores en `src/data/import-data.ts` (no inline en el route)

## Nuevos módulos (auditoría 2026-04)
```
src/data/import-data.ts   → IMPORT_WORKERS + IMPORT_OBRAS (datos del Excel, fuera del route)
src/lib/rate-limit.ts     → rateLimit(key, limit, windowMs) — in-memory, sliding window
src/lib/audit.ts          → logAudit(entry) — escribe en tabla audit_logs vía service role
```

## Trabajadores importados (Excel: "Planilla personal 04-2026.xlsx")
20 trabajadores con username formato `nombre.apellido@built.work` como email.
Usernames: nicolas.quispe, elisban.montanez, eudes.grandez, bill.jara, carlos.contreras,
alejandro.fornerino, ramiro.agullo, francisco.diaz, daniel.ametrano, bill.torres,
david, cesar, tacuru, andres, alex, samuel, candido.gonzalez, yohan.fonseca, ignacio, juan.ballona

## Obras del Excel
AGUILERA, ESTETICA, PARDILLO, COLLADO, PALANCA, SILICEO, SANTA ENGRACIA, CHULENGO

## SQL ejecutado en Supabase (acumulado)
```sql
-- check_ins
ALTER TABLE check_ins ADD COLUMN IF NOT EXISTS photo_url TEXT;
ALTER TABLE check_ins ADD COLUMN IF NOT EXISTS device_fingerprint TEXT;
-- profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS birthday DATE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS dni TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS specialty TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS username TEXT UNIQUE;
-- obras + obra_assignments (ejecutar si no está hecho)
CREATE TABLE IF NOT EXISTS obras (...);
CREATE TABLE IF NOT EXISTS obra_assignments (...);
-- RLS policies para obras/obra_assignments
-- Storage buckets: checkin-photos, avatars

-- ⚠️ PENDIENTE CRÍTICO: ejecutar en Supabase SQL Editor para que
-- los trabajadores puedan ver sus propias asignaciones de obra:
CREATE POLICY "workers_read_own_assignments"
ON public.obra_assignments FOR SELECT TO authenticated
USING (worker_id = auth.uid());

CREATE POLICY "admins_all_assignments"
ON public.obra_assignments FOR ALL TO authenticated
USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','superadmin'))
);

-- ⚠️ PENDIENTE CRÍTICO: ausencias (ejecutar migrations/absences.sql en Supabase SQL Editor)
-- Crea tabla absences + RLS policies + storage bucket absence-documents
-- Ver archivo completo en: migrations/absences.sql

-- audit_logs (PENDIENTE de ejecutar en Supabase)
CREATE TABLE IF NOT EXISTS audit_logs (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  admin_id    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action      TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id   TEXT,
  target_name TEXT,
  details     JSONB,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can view audit logs" ON audit_logs FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'superadmin')
  ));
```

## Logo/icono
- `public/logo.png` → LOGO.png de la empresa (usado en login y sidebars)
- `public/icon.png` → ICONO.png (favicon)

## Notas de deploy
- Vercel auto-despliega desde `main`
- Variables de entorno necesarias: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
