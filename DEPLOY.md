# Guía de despliegue — FichaApp

## PASO 1 — Crear proyecto en Supabase

1. Ve a **supabase.com** → Sign up (gratis)
2. **New project** → pon un nombre (ej: `fichaapp`) → elige región Europa (Frankfurt)
3. Espera ~2 min a que se cree

### Obtener credenciales
Settings → **API** → copia:
- `Project URL` → esto es tu `NEXT_PUBLIC_SUPABASE_URL`
- `anon / public key` → esto es tu `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `service_role key` → esto es tu `SUPABASE_SERVICE_ROLE_KEY` (⚠️ nunca lo expongas)

---

## PASO 2 — Ejecutar el schema SQL

1. Supabase → **SQL Editor** → **New Query**
2. Pega el contenido de `supabase/schema.sql`
3. Pulsa **Run** (debe ejecutarse sin errores)

---

## PASO 3 — Crear el superadmin

1. Supabase → **Authentication** → **Users** → **Add user**
   - Email: el tuyo (ej: `admin@tuempresa.com`)
   - Password: elige una segura
   - ✅ Auto Confirm User

2. Supabase → **SQL Editor** → ejecuta:
```sql
UPDATE public.profiles SET role = 'superadmin'
WHERE id = (SELECT id FROM auth.users WHERE email = 'admin@tuempresa.com');
```

---

## PASO 4 — Subir código a GitHub

```bash
cd "APP PARA FICHAR"
git init
git add .
git commit -m "Initial commit - FichaApp"
```

Crea un repositorio en **github.com** (privado) y sigue las instrucciones para subir.

---

## PASO 5 — Desplegar en Vercel

1. Ve a **vercel.com** → Sign up con GitHub
2. **New Project** → importa tu repositorio
3. En **Environment Variables** añade:
   ```
   NEXT_PUBLIC_SUPABASE_URL     = https://xxxx.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY = eyJ...
   SUPABASE_SERVICE_ROLE_KEY    = eyJ...
   ```
4. **Deploy** → en ~2 min tendrás tu URL pública

---

## PASO 6 — Configurar URL en Supabase

1. Supabase → **Authentication** → **URL Configuration**
2. **Site URL**: tu URL de Vercel (ej: `https://fichaapp.vercel.app`)
3. **Redirect URLs**: añade `https://fichaapp.vercel.app/**`

---

## Estructura de roles

| Rol | Acceso |
|-----|--------|
| `worker` | Ver obra del día, fichar entrada/salida, historial propio |
| `admin` | Todo lo anterior + gestionar trabajadores, ubicaciones, ver/editar todos los fichajes |
| `superadmin` | Todo lo anterior + eliminar usuarios y fichajes |

---

## Crear trabajadores

Una vez desplegado, el superadmin entra en `/admin/workers` y crea los usuarios directamente desde la app. No hace falta tocar Supabase.

---

## Desarrollo local

```bash
cp .env.example .env.local
# Edita .env.local con tus credenciales de Supabase
npm install
npm run dev
# Abre http://localhost:3000
```
