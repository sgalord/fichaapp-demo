import Link from 'next/link'

export const metadata = {
  title: 'Política de Privacidad — FichaApp',
}

export default function PrivacidadPage() {
  return (
    <div className="min-h-screen bg-zinc-950 py-12 px-4">
      <div className="max-w-2xl mx-auto space-y-8">

        {/* Header */}
        <div>
          <div className="inline-flex items-center border-2 border-dashed border-zinc-700 rounded-lg px-4 py-2 bg-zinc-900/50 mb-6">
            <span className="text-zinc-500 text-sm italic">Aquí va tu logo personalizado de tu empresa</span>
          </div>
          <h1 className="text-3xl font-bold text-white">Política de Privacidad</h1>
          <p className="text-zinc-500 text-sm mt-2">Última actualización: abril de 2026</p>
        </div>

        <div className="space-y-6 text-zinc-400 text-sm leading-relaxed">

          <section className="space-y-3">
            <h2 className="text-base font-semibold text-zinc-200">1. Responsable del tratamiento</h2>
            <p>
              El responsable del tratamiento de los datos personales recogidos a través de esta aplicación es la
              empresa que contrata el servicio BUILT (en adelante, «la Empresa»). El proveedor tecnológico
              actúa como encargado del tratamiento.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-base font-semibold text-zinc-200">2. Datos que recogemos</h2>
            <ul className="list-disc list-inside space-y-1.5">
              <li><strong className="text-zinc-300">Datos de identificación:</strong> nombre completo, DNI, fecha de nacimiento, teléfono, email.</li>
              <li><strong className="text-zinc-300">Datos de localización (GPS):</strong> latitud y longitud en el momento de cada fichaje.</li>
              <li><strong className="text-zinc-300">Fotografía:</strong> imagen capturada en cada fichaje para verificación de presencia.</li>
              <li><strong className="text-zinc-300">Huella de dispositivo:</strong> identificador técnico del dispositivo móvil (no datos personales biométricos).</li>
              <li><strong className="text-zinc-300">Datos de fichaje:</strong> horas de entrada/salida, centro de trabajo, distancia al radio de la obra.</li>
              <li><strong className="text-zinc-300">Datos de ausencias:</strong> solicitudes de vacaciones, bajas médicas y justificantes.</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-base font-semibold text-zinc-200">3. Finalidad y base jurídica</h2>
            <p>Los datos se tratan para:</p>
            <ul className="list-disc list-inside space-y-1.5">
              <li>
                <strong className="text-zinc-300">Control horario obligatorio</strong> — cumplimiento del artículo 34.9 del Estatuto de los Trabajadores
                (RDL 8/2019). Base jurídica: obligación legal.
              </li>
              <li>
                <strong className="text-zinc-300">Gestión de la relación laboral</strong> — gestión de vacaciones, ausencias y comunicaciones.
                Base jurídica: ejecución del contrato laboral.
              </li>
              <li>
                <strong className="text-zinc-300">Prevención del fraude</strong> — verificación de la presencia física mediante GPS y foto.
                Base jurídica: interés legítimo del empleador.
              </li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-base font-semibold text-zinc-200">4. Conservación de los datos</h2>
            <p>
              Los registros de fichajes se conservan durante el tiempo mínimo exigido por la legislación laboral
              española (4 años según el Estatuto de los Trabajadores) y posteriormente se eliminan de forma segura.
              Las fotografías de fichaje se conservan el mismo período.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-base font-semibold text-zinc-200">5. Destinatarios</h2>
            <p>
              Los datos no se ceden a terceros salvo obligación legal. El proveedor tecnológico (Supabase Inc.)
              actúa como encargado del tratamiento y almacena los datos en servidores ubicados en la Unión Europea
              bajo las garantías del RGPD.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-base font-semibold text-zinc-200">6. Derechos de los interesados</h2>
            <p>Como empleado tienes derecho a:</p>
            <ul className="list-disc list-inside space-y-1">
              <li>Acceder a tus datos personales</li>
              <li>Rectificar datos inexactos</li>
              <li>Solicitar la limitación del tratamiento</li>
              <li>Oponerte al tratamiento en los casos previstos por la ley</li>
            </ul>
            <p>
              Para ejercer estos derechos, dirígete al responsable de RRHH de tu empresa.
              También puedes reclamar ante la{' '}
              <span className="text-zinc-300">Agencia Española de Protección de Datos (www.aepd.es)</span>.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-base font-semibold text-zinc-200">7. Consentimiento para GPS y fotografía</h2>
            <p>
              El uso de esta aplicación implica la aceptación de la recogida de geolocalización y fotografía
              durante el fichaje, en el marco del control horario legalmente obligatorio. Este tratamiento
              está amparado por obligación legal y no requiere consentimiento adicional, si bien el trabajador
              debe ser informado mediante su contrato o anexo laboral específico.
            </p>
          </section>

        </div>

        <div className="pt-4 border-t border-zinc-800">
          <Link href="/login" className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors">
            ← Volver al acceso
          </Link>
        </div>
      </div>
    </div>
  )
}
