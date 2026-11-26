// Único lugar con las URLs públicas. Edita estas líneas.
export const CONFIG = {
  /** Repositorio en GitHub (placeholder: cámbialo por el tuyo). */
  repoUrl: 'https://github.com/tu-usuario/kaizer',
  /** Instalador de Windows en GitHub Releases (placeholder editable). */
  windowsUrl: 'https://github.com/tu-usuario/kaizer/releases/latest/download/KAIZER-Setup.exe',
  /** APK de Android. Se sirve desde public/downloads cuando exista. */
  androidUrl: '/downloads/kaizer.apk'
}

/**
 * Devuelve la URL del APK si el archivo existe, o null.
 * Con la redirección SPA un archivo ausente devuelve index.html (200), por eso se mira el tipo.
 */
export async function apkIfAvailable(): Promise<string | null> {
  try {
    const r = await fetch(CONFIG.androidUrl, { method: 'HEAD' })
    const type = r.headers.get('content-type') ?? ''
    return r.ok && !type.includes('text/html') ? CONFIG.androidUrl : null
  } catch {
    return null
  }
}
