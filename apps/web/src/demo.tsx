import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from '@kaizer/ui'
import { apkIfAvailable } from './config'
import { createWebAdapter } from './webAdapter'

export async function mountDemo(root: HTMLElement): Promise<void> {
  const adapter = createWebAdapter(await apkIfAvailable())
  createRoot(root).render(
    <StrictMode>
      <App adapter={adapter} />
    </StrictMode>
  )
}
