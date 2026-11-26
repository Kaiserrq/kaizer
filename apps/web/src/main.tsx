import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

const root = document.getElementById('root') as HTMLElement

// Dos páginas, dos paquetes: la UI de la demo trae estilos globales que no deben tocar la landing.
if (location.pathname.replace(/\/+$/, '') === '/demo') {
  document.title = 'KAIZER - Demo'
  void import('./demo').then((m) => m.mountDemo(root))
} else {
  void import('./landing/Landing').then(({ Landing }) => {
    createRoot(root).render(
      <StrictMode>
        <Landing />
      </StrictMode>
    )
  })
}
