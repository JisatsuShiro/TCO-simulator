import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Polices auto-hostées via @fontsource (woff2 vendorés dans node_modules,
// pas d'appel réseau au runtime). On limite au subset `latin` (suffisant
// pour le français — é/à/ô etc. sont dans Latin-1 Supplement, inclus) et
// aux graisses utilisées dans `design/tokens.ts` : 400/500/600/700 pour
// l'UI, 400/500 pour le mono.
import '@fontsource/inter/latin-400.css'
import '@fontsource/inter/latin-500.css'
import '@fontsource/inter/latin-600.css'
import '@fontsource/inter/latin-700.css'
import '@fontsource/ibm-plex-mono/latin-400.css'
import '@fontsource/ibm-plex-mono/latin-500.css'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
