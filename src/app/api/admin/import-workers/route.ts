import { NextResponse } from 'next/server'
import { createClient, createAdminClient } from '@/lib/supabase/server'

const DEFAULT_PASSWORD = 'Built2026!'

// Trabajadores extraídos de "Planilla personal 04-2026.xlsx"
const WORKERS = [
  { nombre: 'NICOLAS IVAN', apellido: 'QUISPE RAMIREZ',        phone: '+34641717450' },
  { nombre: 'ELISBAN',      apellido: 'MONTAÑEZ MONTALVO',     phone: '+34613219995' },
  { nombre: 'EUDES AMARILDO', apellido: 'GRANDEZ TOMANGUILLA', phone: '+34631989703' },
  { nombre: 'BILL SLEITHER', apellido: 'JARA RIOJAS',          phone: '+34661809531' },
  { nombre: 'CARLOS ENRIQUE', apellido: 'CONTRERAS GARZON',    phone: '+34614662387' },
  { nombre: 'ALEJANDRO REYES', apellido: 'FORNERINO ALARCA',   phone: '+34641412303' },
  { nombre: 'RAMIRO MAURICIO', apellido: 'AGULLO',             phone: '+34622901155' },
  { nombre: 'FRANCISCO',    apellido: 'DIAZ VALDEZ',           phone: '+34600674096' },
  { nombre: 'DANIEL EDUARDO', apellido: 'AMETRANO',            phone: '+34661003687' },
  { nombre: 'BILL',         apellido: 'TORRES CHUQUILIN',      phone: '+34622945013' },
  { nombre: 'DAVID',        apellido: null,                     phone: '+34610162225' },
  { nombre: 'CESAR',        apellido: null,                     phone: '+34642549624' },
  { nombre: 'TACURU',       apellido: null,                     phone: '+34643741329' },
  { nombre: 'ANDRES',       apellido: null,                     phone: '+34602665613' },
  { nombre: 'ALEX',         apellido: null,                     phone: '+34613573386' },
  { nombre: 'SAMUEL',       apellido: null,                     phone: '+34611218793' },
  { nombre: 'CANDIDO',      apellido: 'GONZALEZ',              phone: '+34632265430' },
  { nombre: 'YOHAN SEBASTIAN', apellido: 'FONSECA SERRANO',    phone: '+34613850110' },
  { nombre: 'IGNACIO',      apellido: null,                     phone: '+34661547383' },
  { nombre: 'JUAN',         apellido: 'BALLONA',               phone: '+34641942475' },
]

// Obras extraídas de la hoja "OBRAS"
const OBRAS = [
  { name: 'AGUILERA',      address: 'Calle de Albeto Aguilera 4' },
  { name: 'ESTETICA',      address: 'Av de Europa 7' },
  { name: 'PARDILLO',      address: 'Calle San Isidro 1' },
  { name: 'COLLADO',       address: 'Calle Arroyo de la Fuenfria 106' },
  { name: 'PALANCA',       address: 'Calle del General Palanca 7' },
  { name: 'SILICEO',       address: 'Calle del Cardenal Siliceo 7' },
  { name: 'SANTA ENGRACIA', address: 'Calle de Santa Engracia 132' },
  { name: 'CHULENGO',      address: 'Calle Playa de la concha 2' },
]

function generateUsername(nombre: string, apellido: string | null): string {
  const n = nombre.trim().toLowerCase().split(/\s+/)[0]
  if (!apellido) return n
  const a = apellido.trim().toLowerCase().split(/\s+/)[0]
  // Normalize accents/special chars for the username
  const normalize = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '')
  return `${normalize(n)}.${normalize(a)}`
}

function generateEmail(username: string): string {
  return `${username}@built.work`
}

function capitalize(s: string): string {
  return s.toLowerCase().split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
}

export async function GET() {
  // Preview: devuelve la lista de trabajadores que se van a importar sin crear nada
  const preview = WORKERS.map(w => {
    const username = generateUsername(w.nombre, w.apellido)
    const fullName = capitalize([w.nombre, w.apellido].filter(Boolean).join(' '))
    return { full_name: fullName, username, email: generateEmail(username), phone: w.phone }
  })
  return NextResponse.json({ workers: preview, obras: OBRAS })
}

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: adminProfile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()
  if (!['admin', 'superadmin'].includes(adminProfile?.role ?? '')) {
    return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 })
  }

  const admin = await createAdminClient()
  const results: { name: string; status: 'created' | 'skipped' | 'error'; detail?: string }[] = []

  // 1. Importar obras
  const obraResults: { name: string; status: string }[] = []
  for (const obra of OBRAS) {
    const { data: existing } = await admin.from('obras').select('id').ilike('name', obra.name).maybeSingle()
    if (existing) {
      obraResults.push({ name: obra.name, status: 'skipped' })
      continue
    }
    const { error } = await admin.from('obras').insert({
      name: obra.name,
      address: obra.address,
      latitude: null, longitude: null,
      radius: 200,
      active: true,
    })
    obraResults.push({ name: obra.name, status: error ? 'error' : 'created' })
  }

  // 2. Importar trabajadores
  for (const w of WORKERS) {
    const username = generateUsername(w.nombre, w.apellido)
    const email    = generateEmail(username)
    const fullName = capitalize([w.nombre, w.apellido].filter(Boolean).join(' '))

    // Comprobar si username ya existe
    const { data: existing } = await admin.from('profiles').select('id').eq('username', username).maybeSingle()
    if (existing) {
      results.push({ name: fullName, status: 'skipped', detail: 'Usuario ya existe' })
      continue
    }

    // Crear usuario en auth
    const { data: authUser, error: authError } = await admin.auth.admin.createUser({
      email,
      password: DEFAULT_PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: fullName, role: 'worker' },
    })

    if (authError) {
      // Si el email ya existe, saltar
      if (authError.message.includes('already registered')) {
        results.push({ name: fullName, status: 'skipped', detail: 'Email ya registrado' })
      } else {
        results.push({ name: fullName, status: 'error', detail: authError.message })
      }
      continue
    }

    // Actualizar perfil
    await admin.from('profiles').update({
      full_name: fullName,
      phone: w.phone,
      role: 'worker',
      username,
      active: true,
    }).eq('id', authUser.user.id)

    results.push({ name: fullName, status: 'created' })
  }

  return NextResponse.json({ results, obras: obraResults })
}
