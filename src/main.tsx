import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { loadState, setPreloaded } from './storage'

// Load saved maps (IndexedDB is asynchronous) before the store is created.
async function start() {
  setPreloaded(await loadState())
  const { default: App } = await import('./App.tsx')
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}
void start()
