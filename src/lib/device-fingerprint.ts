/**
 * Genera una huella digital única del dispositivo.
 * Combina características del hardware y navegador para crear un hash SHA-256.
 * Mismo hash = mismo dispositivo físico.
 */

function getCanvasFingerprint(): string {
  try {
    const canvas = document.createElement('canvas')
    canvas.width = 220
    canvas.height = 60
    const ctx = canvas.getContext('2d')!
    ctx.textBaseline = 'alphabetic'
    ctx.fillStyle = '#f0f'
    ctx.fillRect(0, 0, 10, 10)
    ctx.fillStyle = '#069'
    ctx.font = '14px Arial'
    ctx.fillText('BUILT:device_fp_v1', 2, 20)
    ctx.fillStyle = 'rgba(102, 204, 0, 0.8)'
    ctx.font = '11px "Courier New"'
    ctx.fillText('0987654321!@#$%^&*()', 4, 40)
    return canvas.toDataURL('image/png').slice(-80)
  } catch {
    return 'no-canvas'
  }
}

export async function getDeviceFingerprint(): Promise<string> {
  try {
    const nav = navigator as Navigator & {
      deviceMemory?: number
      connection?: { effectiveType?: string }
    }

    const components = [
      nav.userAgent,
      nav.platform,
      nav.language,
      nav.languages?.join(',') ?? '',
      `${screen.width}x${screen.height}x${screen.colorDepth}`,
      String(nav.hardwareConcurrency ?? ''),
      String(nav.deviceMemory ?? ''),
      Intl.DateTimeFormat().resolvedOptions().timeZone,
      nav.connection?.effectiveType ?? '',
      String(window.devicePixelRatio ?? ''),
      getCanvasFingerprint(),
    ].join('|||')

    const encoded = new TextEncoder().encode(components)
    const buffer  = await crypto.subtle.digest('SHA-256', encoded)
    const bytes   = Array.from(new Uint8Array(buffer))
    return bytes.map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 24)
  } catch {
    // Fallback muy básico si algo falla
    return [
      navigator.userAgent.slice(0, 30),
      screen.width,
      screen.height,
    ].join('-').replace(/\s+/g, '_').slice(0, 24)
  }
}
