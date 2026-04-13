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
/admin/mensajes     → mensajes directos con trabajadores (lista conversaciones + chat)
/worker/mensajes    → chat directo con la administración
/forgot-password    → recuperar contraseña
/reset-password     → nueva contraseña (PKCE flow)
/auth/callback      → callback de Supabase auth
/privacidad         → Política de privacidad (RGPD, GPS, foto)
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
GET/PUT/DELETE /api/checkins/[id]  (PUT acepta within_radius para corregir errores GPS)
GET  /api/obras                  → lista obras
POST /api/obras                  → crear obra
PUT/DELETE /api/obras/[id]
GET  /api/obra-assignments       → asignaciones (filtros: date, date_from, date_to, worker_id, obra_id)
POST /api/obra-assignments       → crear asignación (detecta conflicto, ?force=1 para ignorarlo)
DELETE /api/obra-assignments/[id]
GET  /api/admin/import-workers   → preview de los 20 trabajadores a importar
POST /api/admin/import-workers   → ejecuta la importación (crea users + obras)
GET  /api/absences               → lista ausencias (workers: solo las suyas; admins: todas + filtros status/date)
POST /api/absences               → crear solicitud de ausencia (detecta solapamiento)
GET/PUT/DELETE /api/absences/[id] → ver/aprobar-rechazar/eliminar ausencia
GET  /api/absence-allowances?year → saldo vacaciones+asuntos propios por trabajador (calculado)
PUT  /api/absence-allowances     → upsert días asignados a un trabajador para un año
GET  /api/my-balance?year        → saldo del trabajador autenticado (vacaciones, asuntos propios, bajas)
POST /api/checkins               → admin crea fichaje manual para cualquier empleado
GET  /api/geocode?address=...   → geocodificación de dirección
GET/POST /api/locations          → ubicaciones legacy (sistema antiguo)
GET/PUT/DELETE /api/locations/[id]
GET/POST /api/groups
GET  /api/messages               → admin: lista conversaciones (con unread_count); worker: su conversación
GET  /api/messages?worker_id=UUID → admin: conversación de un trabajador (marca como leído)
POST /api/messages               → enviar mensaje (worker: body; admin: body + worker_id)
DELETE /api/messages/[id]        → solo admins
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

## Módulo de Ausencias (feature/absences-management)
### Tablas
```sql
-- absences: solicitudes de ausencia
id, worker_id, type (vacation|personal_day|sick_leave|other),
date_from, date_to, reason, document_url, status (pending|approved|rejected),
reviewed_by, reviewed_at, review_notes, created_at, updated_at

-- absence_allowances: días disponibles por trabajador/año
id, worker_id, year, vacation_days (default 22), personal_days (default 6)
UNIQUE(worker_id, year)
```
### Columnas adicionales en absences
- `admin_note TEXT` — nota interna del admin, **nunca visible para el trabajador**
- `review_notes TEXT` — nota de revisión visible para el trabajador

### Páginas
- `/admin/ausencias` → 2 tabs: Solicitudes + Gestión de días libres (editable)
  - Botón "Nueva ausencia": admin crea en nombre de cualquier trabajador
  - `pre_approved=true` → se crea directamente como `status='approved'`
  - Icono StickyNote por fila → edición inline de admin_note sin recargar
  - Modal Revisar: dos campos separados (review_notes para trabajador, admin_note interno)
  - Botón Editar (lápiz) en TODAS las filas → modal edita tipo/fechas/motivo sin cambiar estado
- `/worker/ausencias` → ver saldo de días (vacaciones/asuntos propios), solicitar ausencias, editar pendientes, solicitar modificación de aprobadas (envía mensaje al admin)

### Módulo de Mensajes
- Tabla `messages`: sender_id, worker_id (siempre el trabajador), body, is_from_admin, read_at
- RLS: trabajadores solo ven/envían en su propia conversación; admins ven todo
- `/admin/mensajes` → lista de conversaciones con unread badge + chat en tiempo real (Realtime)
- `/worker/mensajes` → chat directo con la administración (Realtime)
- Dashboard admin muestra solicitudes de ausencia pendientes + badge de mensajes no leídos
### API absences
- POST acepta `worker_id?` (admin), `pre_approved?` (bool), `admin_note?` (interno)
- PUT `status` es **opcional** — se puede actualizar solo admin_note sin cambiar estado
- PUT solo actualiza `reviewed_by/reviewed_at` cuando se proporciona `status`
### Lógica saldos
- GET /api/absence-allowances calcula en tiempo real: total (de allowances o default) - consumido (absences aprobadas del año)
- Defaults: 22 días vacaciones, 6 días asuntos propios
- Admin puede editar el total por trabajador/año desde la tab Saldos
### Informes
- /admin/reports ahora incluye columnas: Vacaciones, As. propios, Bajas, Otras ausencias
- Excel exporta 3 hojas: Resumen, Fichajes, Ausencias

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

## Estado de la BD (verificado 2026-04-13)
Todas las tablas y funciones necesarias están desplegadas en producción:
- `profiles`, `obras`, `obra_assignments`, `check_ins`, `work_locations`, `location_assignments`
- `groups`, `user_groups`
- `absences`, `absence_allowances` (con RLS completa)
- `messages` (con RLS: workers solo su conversación, admins todo)
- `audit_logs` (RLS: solo admins pueden leer; INSERT solo vía service role)
- Función `get_daily_summary(p_date)` — SECURITY DEFINER, STABLE
- Función `is_admin()` — SECURITY DEFINER, STABLE (usada en RLS de check_ins y profiles)
- Storage buckets: `checkin-photos`, `avatars`, `absence-documents`

## Nuevos módulos (2026-04-13)
- **Sentry**: `@sentry/nextjs` instalado. Config en `sentry.client.config.ts`, `sentry.server.config.ts`, `sentry.edge.config.ts`, `instrumentation.ts`. Activar añadiendo `NEXT_PUBLIC_SENTRY_DSN` a Vercel.
- **Importación dinámica**: `POST /api/admin/import-workers` acepta `{ workers, obras, email_domain }` — reemplaza los datos hardcodeados. UI en `/admin/import` con upload Excel, preview editable y exportación de credenciales.
- **Fichaje manual admin**: `POST /api/checkins` — admin crea fichajes para cualquier empleado con obra, timestamp, estado GPS manual.
- **`within_radius` editable**: `PUT /api/checkins/[id]` ahora acepta `within_radius` (bool) para corregir errores GPS desde el panel admin.
- **Módulo ausencias → Gestión de personal**: renombrado en nav, títulos y worker page (rutas `/admin/ausencias` y `/worker/ausencias` sin cambio para evitar breaking changes).
- **RGPD**: página `/privacidad` con política completa de GPS, foto y datos laborales.

## SQL ejecutado en Supabase (histórico)
```sql
-- check_ins (columnas añadidas)
ALTER TABLE check_ins ADD COLUMN IF NOT EXISTS photo_url TEXT;
ALTER TABLE check_ins ADD COLUMN IF NOT EXISTS device_fingerprint TEXT;

-- check_ins obra_id (migración 2026-04-13)
ALTER TABLE public.check_ins ADD COLUMN IF NOT EXISTS obra_id UUID REFERENCES public.obras(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS check_ins_obra_id_idx ON public.check_ins(obra_id);

-- profiles (columnas añadidas)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS birthday DATE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS dni TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS specialty TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS username TEXT UNIQUE;

-- Fix FK: absences.worker_id apunta a public.profiles (necesario para joins PostgREST)
ALTER TABLE public.absences DROP CONSTRAINT absences_worker_id_fkey;
ALTER TABLE public.absences ADD CONSTRAINT absences_worker_id_fkey
  FOREIGN KEY (worker_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

-- messages (2026-04-12)
CREATE TABLE IF NOT EXISTS public.messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  sender_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  worker_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  body TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
  is_from_admin BOOLEAN NOT NULL DEFAULT false,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
-- RLS aplicada: workers_own_messages + admins_all_messages
```

## Patrones adicionales (2026-04-13)
- **Fichajes page**: vista por rango de fechas (2 días por defecto), botones prev/next día, modal nuevo fichaje admin, modal edición con toggle `within_radius`.
- **GPS errors**: `worker/page.tsx` diferencia `PERMISSION_DENIED`, `POSITION_UNAVAILABLE` y `TIMEOUT` con mensajes específicos.
- **`obra_id` en `check_ins`**: columna añadida via migración. `POST /api/checkin` la persiste. Queries de checkins y reports hacen join a `obras(id, name)` para mostrar nombre en UI y Excel.

## Pendiente SQL (deuda técnica menor)
```sql
-- Limpiar políticas RLS duplicadas en obra_assignments (Fase 4 — ver sección manual steps)
-- 4 políticas → 2: las "Admin full access" y "Worker read own assignments" son las antiguas,
-- las "admins_all_assignments" y "workers_read_own_assignments" son las nuevas equivalentes.
```

## Logo/icono
- `public/logo.png` → LOGO.png de la empresa (usado en login y sidebars)
- `public/icon.png` → ICONO.png (favicon)

## CI/CD
- **GitHub Actions** (`.github/workflows/ci.yml`): corre `npm ci`, `npm run build`, `npm run lint` en cada push a `main` y en PRs. Usa vars de entorno placeholder — solo valida que el build compile.
- **Vercel** auto-despliega desde `main` tras el CI.

## Notas de deploy
- Variables de entorno necesarias en Vercel: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_APP_URL`
- Rate limiter (`src/lib/rate-limit.ts`): in-memory, sin Redis. Aceptable para ≤50 workers. Si escala, migrar a Upstash Redis añadiendo `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`.
