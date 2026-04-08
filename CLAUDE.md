# APP PARA FICHAR — Contexto del proyecto

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
/admin/groups       → grupos de trabajadores
/admin/reports      → informes
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

## Patrones importantes
- **upsert:true** siempre en uploads de avatars (evita error "file already exists")
- **createAdminClient()** (service role) para bypass de RLS en operaciones admin
- **`const sb = supabase as any`** para queries con joins que causan "Type instantiation is excessively deep"
- Login: si el campo no contiene `@` → fetch POST /api/auth/username → obtiene email → auth normal
- Fingerprint del dispositivo: SHA-256 de hardware+canvas → 24 chars → guarda en check_ins
- Username format: `nombre.apellido` (primera palabra de cada uno, sin tildes, lowercase)
- Default password trabajadores importados: `Built2026!`

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
```

## Logo/icono
- `public/logo.png` → LOGO.png de la empresa (usado en login y sidebars)
- `public/icon.png` → ICONO.png (favicon)

## Notas de deploy
- Vercel auto-despliega desde `main`
- Variables de entorno necesarias: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
