import type { KaizerApi } from '../shared/api'

declare global {
  interface Window {
    kaizer: KaizerApi
  }
}
