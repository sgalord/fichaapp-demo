import Link from 'next/link'
import {
  MapPin, Clock, Camera, Shield, BarChart3, Users, FileText,
  MessageSquare, Calendar, CheckCircle2, ArrowRight, Building2,
  Sparkles, Globe, Layers, ChevronRight, Star, Zap, Lock
} from 'lucide-react'

// ─── Data ───────────────────────────────────────────────────────────────────

const MODULES = [
  {
    icon: MapPin,
    title: 'Fichaje por GPS',
    desc: 'El trabajador ficha desde su móvil solo cuando está en el lugar asignado. Radio configurable por centro. Validación en tiempo real.',
    color: 'text-blue-400',
    bg: 'bg-blue-400/10',
  },
  {
    icon: Camera,
    title: 'Foto en fichaje',
    desc: 'Captura automática de foto al fichar. Evidencia visual que elimina suplantaciones y fraudes de presencia.',
    color: 'text-violet-400',
    bg: 'bg-violet-400/10',
  },
  {
    icon: Calendar,
    title: 'Gestión de ausencias',
    desc: 'Vacaciones, bajas, asuntos propios. Saldo de días por trabajador, solicitudes con justificante adjunto y flujo de aprobación.',
    color: 'text-emerald-400',
    bg: 'bg-emerald-400/10',
  },
  {
    icon: BarChart3,
    title: 'Informes y exportación',
    desc: 'Resumen diario, semanal y mensual. Exportación a Excel con hojas de fichajes, ausencias y resumen por empleado.',
    color: 'text-amber-400',
    bg: 'bg-amber-400/10',
  },
  {
    icon: Users,
    title: 'Gestión de personal',
    desc: 'Alta, baja y edición de empleados. Grupos de trabajo, asignación a centros por día o semana. Importación masiva desde Excel.',
    color: 'text-pink-400',
    bg: 'bg-pink-400/10',
  },
  {
    icon: Building2,
    title: 'Centros de trabajo',
    desc: 'Define obras, locales u oficinas con dirección, coordenadas y radio de fichaje. Ilimitados y editables en tiempo real.',
    color: 'text-cyan-400',
    bg: 'bg-cyan-400/10',
  },
  {
    icon: MessageSquare,
    title: 'Mensajería interna',
    desc: 'Canal directo entre la empresa y cada trabajador. Notificaciones en tiempo real. Historial completo por conversación.',
    color: 'text-orange-400',
    bg: 'bg-orange-400/10',
  },
  {
    icon: Shield,
    title: 'Anti-fraude de dispositivo',
    desc: 'Fingerprint de hardware por fichaje. Detecta si varios empleados fichan desde el mismo dispositivo.',
    color: 'text-red-400',
    bg: 'bg-red-400/10',
  },
  {
    icon: Layers,
    title: 'Módulos personalizados',
    desc: 'Cada empresa tiene necesidades únicas. Desarrollamos módulos a medida: partes de trabajo, control de materiales, firmas digitales y más.',
    color: 'text-indigo-400',
    bg: 'bg-indigo-400/10',
    highlight: true,
  },
]

const SECTORS = [
  { icon: '🏗️', name: 'Construcción', desc: 'Control de presencia en obra, gestión de cuadrillas y validación por coordenadas GPS.' },
  { icon: '🧹', name: 'Limpieza', desc: 'Trabajadores dispersos en múltiples edificios, turnos rotativos y fichaje sin papel.' },
  { icon: '🔧', name: 'Mantenimiento', desc: 'Técnicos desplazados a distintas instalaciones, partes de intervención y tiempos reales.' },
  { icon: '🏥', name: 'Servicios sanitarios', desc: 'Asistencia domiciliaria, centros de día y control de presencia por turno.' },
  { icon: '🚚', name: 'Logística y reparto', desc: 'Almacenes, plataformas y rutas de distribución con validación horaria.' },
  { icon: '🏭', name: 'Industria', desc: 'Plantas y naves con múltiples turnos, control de acceso y partes de producción.' },
  { icon: '🌿', name: 'Jardinería y exterior', desc: 'Equipos en campo con ubicación variable y fichaje offline cuando no hay cobertura.' },
  { icon: '🎓', name: 'Formación y educación', desc: 'Control de asistencia de monitores, coordinadores y personal de apoyo.' },
]

const PROBLEMS = [
  { q: '¿Sabes si tus empleados están realmente donde deben?', a: 'GPS + foto elimina dudas. Cada fichaje queda geovalidado.' },
  { q: '¿Sigues controlando la presencia con papel o Excel?', a: 'Todo digital, en tiempo real, desde cualquier móvil.' },
  { q: '¿Pierdes horas gestionando vacaciones y ausencias?', a: 'Flujo automatizado: solicitud → aprobación → descuento de saldo.' },
  { q: '¿Tienes trabajadores en múltiples centros a la vez?', a: 'Asigna cada empleado a su obra o local por día o semana.' },
  { q: '¿Tus informes laborales te consumen horas cada mes?', a: 'Un clic exporta todo a Excel listo para nóminas o auditorías.' },
]

const FEATURES_WORKER = [
  'Fichar entrada/salida con un toque',
  'Ver su historial de fichajes',
  'Solicitar vacaciones y ausencias',
  'Adjuntar justificantes médicos',
  'Consultar su saldo de días',
  'Chat directo con la empresa',
  'Ver su próxima asignación',
]

const FEATURES_ADMIN = [
  'Dashboard en tiempo real',
  'Ver quién está fichado ahora mismo',
  'Revisar y corregir fichajes',
  'Aprobar o rechazar ausencias',
  'Crear fichajes manuales',
  'Importar empleados desde Excel',
  'Exportar informes mensuales',
  'Detectar fraudes de dispositivo',
]

// ─── Components ─────────────────────────────────────────────────────────────

function NavBar() {
  return (
    <nav className="fixed top-0 inset-x-0 z-50 border-b border-zinc-800/60 bg-zinc-950/80 backdrop-blur-md">
      <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-blue-500 flex items-center justify-center">
            <Clock className="w-4 h-4 text-white" />
          </div>
          <span className="font-bold text-white text-lg tracking-tight">FichaApp</span>
        </div>
        <div className="hidden md:flex items-center gap-6 text-sm text-zinc-400">
          <a href="#modulos" className="hover:text-white transition-colors">Módulos</a>
          <a href="#sectores" className="hover:text-white transition-colors">Sectores</a>
          <a href="#problemas" className="hover:text-white transition-colors">Soluciones</a>
        </div>
        <Link
          href="/login"
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          Acceder <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
    </nav>
  )
}

function HeroSection() {
  return (
    <section className="pt-32 pb-20 px-4 relative overflow-hidden">
      {/* Glow background */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-blue-600/10 rounded-full blur-3xl" />
      </div>

      <div className="max-w-4xl mx-auto text-center relative">
        <div className="inline-flex items-center gap-2 bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-medium px-3 py-1.5 rounded-full mb-6">
          <Sparkles className="w-3.5 h-3.5" />
          Control de presencia inteligente para tu empresa
        </div>

        <h1 className="text-4xl md:text-6xl font-bold text-white leading-tight mb-6">
          Sabe dónde está tu equipo.{' '}
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-violet-400">
            En todo momento.
          </span>
        </h1>

        <p className="text-lg md:text-xl text-zinc-400 max-w-2xl mx-auto mb-10 leading-relaxed">
          Fichaje por GPS y foto desde el móvil, gestión de ausencias, informes automáticos
          y mensajería interna. Todo en una sola plataforma, adaptada a tu sector.
        </p>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/login"
            className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white font-semibold px-6 py-3.5 rounded-xl transition-colors text-base"
          >
            Ver demo en vivo <ArrowRight className="w-4 h-4" />
          </Link>
          <a
            href="#modulos"
            className="flex items-center justify-center gap-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-medium px-6 py-3.5 rounded-xl transition-colors text-base"
          >
            Explorar módulos
          </a>
        </div>

        {/* Stats */}
        <div className="mt-16 grid grid-cols-3 gap-6 max-w-lg mx-auto">
          {[
            { value: '100%', label: 'Móvil nativo' },
            { value: 'GPS', label: 'Validación real' },
            { value: '∞', label: 'Empleados' },
          ].map(stat => (
            <div key={stat.label} className="text-center">
              <div className="text-2xl font-bold text-white mb-1">{stat.value}</div>
              <div className="text-xs text-zinc-500">{stat.label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function ProblemsSection() {
  return (
    <section id="problemas" className="py-20 px-4 bg-zinc-900/30">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
            Problemas que resolvemos
          </h2>
          <p className="text-zinc-400 max-w-xl mx-auto">
            Si te identificas con alguna de estas preguntas, FichaApp es para ti.
          </p>
        </div>

        <div className="space-y-4">
          {PROBLEMS.map((item, i) => (
            <div
              key={i}
              className="flex gap-4 p-5 bg-zinc-900 border border-zinc-800 rounded-xl hover:border-zinc-700 transition-colors"
            >
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center mt-0.5">
                <span className="text-red-400 text-sm font-bold">?</span>
              </div>
              <div>
                <p className="text-zinc-200 font-medium mb-1">{item.q}</p>
                <p className="text-zinc-500 text-sm flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                  {item.a}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function ModulesSection() {
  return (
    <section id="modulos" className="py-20 px-4">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-14">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
            Módulos incluidos
          </h2>
          <p className="text-zinc-400 max-w-xl mx-auto">
            Una plataforma completa desde el primer día. Sin necesidad de integrar
            herramientas externas.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {MODULES.map((mod) => {
            const Icon = mod.icon
            return (
              <div
                key={mod.title}
                className={`relative p-5 rounded-xl border transition-all ${
                  mod.highlight
                    ? 'bg-indigo-950/30 border-indigo-500/30 hover:border-indigo-400/50'
                    : 'bg-zinc-900 border-zinc-800 hover:border-zinc-700'
                }`}
              >
                {mod.highlight && (
                  <div className="absolute -top-2.5 left-4 bg-indigo-500 text-white text-xs font-semibold px-2.5 py-0.5 rounded-full flex items-center gap-1">
                    <Sparkles className="w-3 h-3" /> Personalizable
                  </div>
                )}
                <div className={`w-10 h-10 rounded-lg ${mod.bg} flex items-center justify-center mb-3`}>
                  <Icon className={`w-5 h-5 ${mod.color}`} />
                </div>
                <h3 className="font-semibold text-white mb-2">{mod.title}</h3>
                <p className="text-sm text-zinc-400 leading-relaxed">{mod.desc}</p>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}

function SectorsSection() {
  return (
    <section id="sectores" className="py-20 px-4 bg-zinc-900/30">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-14">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
            Para cualquier sector con personal
          </h2>
          <p className="text-zinc-400 max-w-xl mx-auto">
            Si tienes empleados en distintos lugares y necesitas saber que están
            donde tienen que estar, FichaApp funciona para ti.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {SECTORS.map((sector) => (
            <div
              key={sector.name}
              className="p-5 bg-zinc-900 border border-zinc-800 rounded-xl hover:border-zinc-600 transition-colors"
            >
              <div className="text-3xl mb-3">{sector.icon}</div>
              <h3 className="font-semibold text-white mb-2">{sector.name}</h3>
              <p className="text-sm text-zinc-500 leading-relaxed">{sector.desc}</p>
            </div>
          ))}
        </div>

        <div className="mt-8 p-5 bg-zinc-900 border border-zinc-700 border-dashed rounded-xl text-center">
          <Globe className="w-6 h-6 text-zinc-500 mx-auto mb-2" />
          <p className="text-zinc-400 text-sm">
            ¿Tu sector no aparece?{' '}
            <span className="text-white font-medium">
              FichaApp se adapta a cualquier empresa con trabajadores en campo.
            </span>{' '}
            Solo necesitas empleados y centros de trabajo.
          </p>
        </div>
      </div>
    </section>
  )
}

function PerspectivesSection() {
  return (
    <section className="py-20 px-4">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-14">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
            Dos vistas, una sola plataforma
          </h2>
          <p className="text-zinc-400 max-w-xl mx-auto">
            El trabajador tiene su app móvil. La empresa tiene su panel de control.
            Todo sincronizado en tiempo real.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {/* Trabajador */}
          <div className="p-6 bg-zinc-900 border border-zinc-800 rounded-2xl">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
                <Users className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <div className="text-xs text-zinc-500 uppercase tracking-wider">Vista</div>
                <div className="font-semibold text-white">Trabajador</div>
              </div>
            </div>
            <ul className="space-y-2.5">
              {FEATURES_WORKER.map((f) => (
                <li key={f} className="flex items-center gap-3 text-sm text-zinc-300">
                  <CheckCircle2 className="w-4 h-4 text-blue-400 flex-shrink-0" />
                  {f}
                </li>
              ))}
            </ul>
          </div>

          {/* Admin */}
          <div className="p-6 bg-zinc-900 border border-zinc-800 rounded-2xl">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 rounded-xl bg-violet-500/10 flex items-center justify-center">
                <Shield className="w-5 h-5 text-violet-400" />
              </div>
              <div>
                <div className="text-xs text-zinc-500 uppercase tracking-wider">Vista</div>
                <div className="font-semibold text-white">Empresa / Admin</div>
              </div>
            </div>
            <ul className="space-y-2.5">
              {FEATURES_ADMIN.map((f) => (
                <li key={f} className="flex items-center gap-3 text-sm text-zinc-300">
                  <CheckCircle2 className="w-4 h-4 text-violet-400 flex-shrink-0" />
                  {f}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  )
}

function CustomSection() {
  return (
    <section className="py-20 px-4 bg-gradient-to-b from-indigo-950/20 to-zinc-950">
      <div className="max-w-4xl mx-auto">
        <div className="p-8 md:p-12 bg-zinc-900 border border-indigo-500/20 rounded-2xl relative overflow-hidden">
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-600/5 rounded-full blur-3xl" />
          </div>

          <div className="relative">
            <div className="inline-flex items-center gap-2 bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs font-medium px-3 py-1.5 rounded-full mb-6">
              <Zap className="w-3.5 h-3.5" />
              Módulos personalizados
            </div>

            <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
              Tu empresa tiene necesidades únicas.{' '}
              <span className="text-indigo-400">Las cubrimos.</span>
            </h2>

            <p className="text-zinc-400 text-lg mb-8 leading-relaxed max-w-2xl">
              La plataforma base cubre el 80% de los casos. Para el resto, desarrollamos
              módulos a medida que se integran en la misma app que ya conocen tus empleados.
            </p>

            <div className="grid sm:grid-cols-2 gap-4 mb-8">
              {[
                { icon: FileText, label: 'Partes de trabajo digitales' },
                { icon: CheckCircle2, label: 'Firmas digitales por tarea' },
                { icon: Layers, label: 'Control de materiales o stock' },
                { icon: BarChart3, label: 'KPIs e indicadores específicos' },
                { icon: Star, label: 'Valoraciones y calidad de servicio' },
                { icon: Lock, label: 'Control de acceso a instalaciones' },
              ].map(({ icon: Icon, label }) => (
                <div key={label} className="flex items-center gap-3 text-sm text-zinc-300">
                  <Icon className="w-4 h-4 text-indigo-400 flex-shrink-0" />
                  {label}
                </div>
              ))}
            </div>

            <p className="text-zinc-500 text-sm">
              ¿Tienes un proceso específico que quieres digitalizar?{' '}
              <span className="text-zinc-300">Cuéntanoslo y lo analizamos juntos.</span>
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}

function CTASection() {
  return (
    <section className="py-20 px-4">
      <div className="max-w-2xl mx-auto text-center">
        <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
          Prueba la demo ahora
        </h2>
        <p className="text-zinc-400 mb-8 text-lg">
          Accede al panel de administración y a la vista del trabajador.
          Sin formularios, sin esperas.
        </p>
        <Link
          href="/login"
          className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white font-semibold px-8 py-4 rounded-xl transition-colors text-base"
        >
          Entrar a la demo <ChevronRight className="w-5 h-5" />
        </Link>
        <p className="mt-4 text-xs text-zinc-600">
          Datos de acceso facilitados por el equipo de ventas
        </p>
      </div>
    </section>
  )
}

function Footer() {
  return (
    <footer className="border-t border-zinc-800 py-8 px-4">
      <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-zinc-600">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded bg-blue-500 flex items-center justify-center">
            <Clock className="w-3 h-3 text-white" />
          </div>
          <span className="text-zinc-500">FichaApp — Control de presencia inteligente</span>
        </div>
        <div className="flex items-center gap-4">
          <Link href="/privacidad" className="hover:text-zinc-400 transition-colors">
            Política de privacidad
          </Link>
          <Link href="/login" className="hover:text-zinc-400 transition-colors">
            Acceder
          </Link>
        </div>
      </div>
    </footer>
  )
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <NavBar />
      <main>
        <HeroSection />
        <ProblemsSection />
        <ModulesSection />
        <SectorsSection />
        <PerspectivesSection />
        <CustomSection />
        <CTASection />
      </main>
      <Footer />
    </div>
  )
}
