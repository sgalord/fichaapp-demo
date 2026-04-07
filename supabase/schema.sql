-- ============================================================
-- SCHEMA: APP FICHAR - Sistema de fichaje por geolocalización
-- Ejecutar en: Supabase > SQL Editor > New Query
-- ============================================================

-- ============================================================
-- TABLAS
-- ============================================================

-- Perfiles de usuario (extiende auth.users de Supabase)
CREATE TABLE IF NOT EXISTS public.profiles (
  id          UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  full_name   TEXT NOT NULL,
  phone       TEXT,
  role        TEXT NOT NULL DEFAULT 'worker'
                CHECK (role IN ('worker', 'admin', 'superadmin')),
  active      BOOLEAN DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Grupos de trabajadores
CREATE TABLE IF NOT EXISTS public.groups (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Relación usuario-grupo (muchos a muchos)
CREATE TABLE IF NOT EXISTS public.user_groups (
  user_id     UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  group_id    UUID REFERENCES public.groups(id)   ON DELETE CASCADE,
  PRIMARY KEY (user_id, group_id)
);

-- Ubicaciones de trabajo por día
CREATE TABLE IF NOT EXISTS public.work_locations (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name        TEXT NOT NULL,
  address     TEXT,
  date        DATE NOT NULL,
  latitude    DOUBLE PRECISION NOT NULL,
  longitude   DOUBLE PRECISION NOT NULL,
  radius      INTEGER NOT NULL DEFAULT 100,   -- metros
  active      BOOLEAN DEFAULT true,
  created_by  UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Asignaciones de ubicación (a trabajador individual o a grupo)
-- Si worker_id y group_id son NULL → asignada a TODOS los trabajadores
CREATE TABLE IF NOT EXISTS public.location_assignments (
  id                UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  work_location_id  UUID REFERENCES public.work_locations(id) ON DELETE CASCADE NOT NULL,
  worker_id         UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  group_id          UUID REFERENCES public.groups(id)   ON DELETE CASCADE
);

-- Fichajes (entradas y salidas)
CREATE TABLE IF NOT EXISTS public.check_ins (
  id                  UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  worker_id           UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  work_location_id    UUID REFERENCES public.work_locations(id) ON DELETE SET NULL,
  type                TEXT NOT NULL CHECK (type IN ('in', 'out')),
  latitude            DOUBLE PRECISION,
  longitude           DOUBLE PRECISION,
  distance_meters     INTEGER,                -- distancia al punto de trabajo al fichar
  within_radius       BOOLEAN DEFAULT true,   -- ¿estaba dentro del radio?
  notes               TEXT,                   -- notas del admin si modifica manualmente
  manually_modified   BOOLEAN DEFAULT false,
  modified_by         UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  modified_at         TIMESTAMPTZ,
  timestamp           TIMESTAMPTZ DEFAULT NOW(),
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- ÍNDICES para rendimiento óptimo
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_check_ins_worker_id       ON public.check_ins(worker_id);
CREATE INDEX IF NOT EXISTS idx_check_ins_timestamp       ON public.check_ins(timestamp DESC);
-- idx_check_ins_timestamp ya cubre filtros por fecha con rangos gte/lte
CREATE INDEX IF NOT EXISTS idx_check_ins_location_id     ON public.check_ins(work_location_id);
CREATE INDEX IF NOT EXISTS idx_work_locations_date       ON public.work_locations(date);
CREATE INDEX IF NOT EXISTS idx_work_locations_active     ON public.work_locations(date, active);
CREATE INDEX IF NOT EXISTS idx_location_assign_location  ON public.location_assignments(work_location_id);
CREATE INDEX IF NOT EXISTS idx_location_assign_worker    ON public.location_assignments(worker_id) WHERE worker_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_location_assign_group     ON public.location_assignments(group_id)  WHERE group_id  IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_user_groups_user          ON public.user_groups(user_id);
CREATE INDEX IF NOT EXISTS idx_user_groups_group         ON public.user_groups(group_id);
CREATE INDEX IF NOT EXISTS idx_profiles_role             ON public.profiles(role);
CREATE INDEX IF NOT EXISTS idx_profiles_active           ON public.profiles(active);

-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================

ALTER TABLE public.profiles           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.groups             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_groups        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_locations     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.location_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.check_ins          ENABLE ROW LEVEL SECURITY;

-- Función helper para obtener el rol (SECURITY DEFINER para evitar recursión en RLS)
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS TEXT
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$;

-- Función helper para saber si es admin
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('admin', 'superadmin')
  );
$$;

-- ---- POLICIES: profiles ----
CREATE POLICY "profiles_select_own"   ON public.profiles FOR SELECT
  USING (id = auth.uid() OR public.is_admin());

CREATE POLICY "profiles_insert_admin" ON public.profiles FOR INSERT
  WITH CHECK (public.is_admin());

CREATE POLICY "profiles_update_admin" ON public.profiles FOR UPDATE
  USING (public.is_admin());

CREATE POLICY "profiles_delete_admin" ON public.profiles FOR DELETE
  USING (public.is_admin());

-- ---- POLICIES: groups ----
CREATE POLICY "groups_select_auth"    ON public.groups FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "groups_manage_admin"   ON public.groups FOR ALL
  USING (public.is_admin());

-- ---- POLICIES: user_groups ----
CREATE POLICY "user_groups_select"    ON public.user_groups FOR SELECT
  USING (user_id = auth.uid() OR public.is_admin());

CREATE POLICY "user_groups_manage"    ON public.user_groups FOR ALL
  USING (public.is_admin());

-- ---- POLICIES: work_locations ----
CREATE POLICY "locations_select_auth" ON public.work_locations FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "locations_manage_admin" ON public.work_locations FOR ALL
  USING (public.is_admin());

-- ---- POLICIES: location_assignments ----
CREATE POLICY "assignments_select_auth"  ON public.location_assignments FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "assignments_manage_admin" ON public.location_assignments FOR ALL
  USING (public.is_admin());

-- ---- POLICIES: check_ins ----
CREATE POLICY "checkins_select"        ON public.check_ins FOR SELECT
  USING (worker_id = auth.uid() OR public.is_admin());

CREATE POLICY "checkins_insert_worker" ON public.check_ins FOR INSERT
  WITH CHECK (worker_id = auth.uid());

CREATE POLICY "checkins_update_admin"  ON public.check_ins FOR UPDATE
  USING (public.is_admin());

CREATE POLICY "checkins_delete_admin"  ON public.check_ins FOR DELETE
  USING (public.is_admin());

-- ============================================================
-- TRIGGERS
-- ============================================================

-- Actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER work_locations_updated_at
  BEFORE UPDATE ON public.work_locations
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Crear perfil automáticamente al registrar usuario en auth
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'role', 'worker')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- FUNCIÓN: obtener ubicación asignada al trabajador para una fecha
-- Optimizada para mínimas lecturas
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_worker_location_for_date(
  p_worker_id UUID,
  p_date DATE
)
RETURNS TABLE (
  id               UUID,
  name             TEXT,
  address          TEXT,
  date             DATE,
  latitude         DOUBLE PRECISION,
  longitude        DOUBLE PRECISION,
  radius           INTEGER
)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  -- 1. Buscar asignación directa al trabajador
  SELECT wl.id, wl.name, wl.address, wl.date, wl.latitude, wl.longitude, wl.radius
  FROM public.work_locations wl
  JOIN public.location_assignments la ON la.work_location_id = wl.id
  WHERE wl.date = p_date AND wl.active = true AND la.worker_id = p_worker_id

  UNION ALL

  -- 2. Buscar asignación por grupo del trabajador
  SELECT wl.id, wl.name, wl.address, wl.date, wl.latitude, wl.longitude, wl.radius
  FROM public.work_locations wl
  JOIN public.location_assignments la ON la.work_location_id = wl.id
  JOIN public.user_groups ug ON ug.group_id = la.group_id
  WHERE wl.date = p_date AND wl.active = true AND ug.user_id = p_worker_id

  UNION ALL

  -- 3. Buscar asignación global (sin worker_id ni group_id)
  SELECT wl.id, wl.name, wl.address, wl.date, wl.latitude, wl.longitude, wl.radius
  FROM public.work_locations wl
  JOIN public.location_assignments la ON la.work_location_id = wl.id
  WHERE wl.date = p_date AND wl.active = true
    AND la.worker_id IS NULL AND la.group_id IS NULL

  LIMIT 1;
$$;

-- ============================================================
-- FUNCIÓN: resumen diario para el dashboard admin
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_daily_summary(p_date DATE DEFAULT CURRENT_DATE)
RETURNS TABLE (
  total_workers    BIGINT,
  checked_in_today BIGINT,
  checked_out_today BIGINT,
  pending          BIGINT
)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT
    (SELECT COUNT(*) FROM public.profiles WHERE active = true AND role = 'worker') AS total_workers,
    (SELECT COUNT(DISTINCT worker_id) FROM public.check_ins
     WHERE DATE(timestamp) = p_date AND type = 'in') AS checked_in_today,
    (SELECT COUNT(DISTINCT worker_id) FROM public.check_ins
     WHERE DATE(timestamp) = p_date AND type = 'out') AS checked_out_today,
    (SELECT COUNT(*) FROM public.profiles WHERE active = true AND role = 'worker') -
    (SELECT COUNT(DISTINCT worker_id) FROM public.check_ins
     WHERE DATE(timestamp) = p_date AND type = 'in') AS pending;
$$;

-- ============================================================
-- PRIMER SUPERADMIN (edita el email y ejecuta DESPUÉS de crear
-- el usuario en Supabase Auth > Authentication > Users)
-- ============================================================
-- UPDATE public.profiles SET role = 'superadmin' WHERE id = (
--   SELECT id FROM auth.users WHERE email = 'admin@tuempresa.com'
-- );
