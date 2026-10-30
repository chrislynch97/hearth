import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Fonts are bundled and served from our own origin rather than fetched from
// Google Fonts (#54): a self-hosted instance should make zero third-party
// requests, and an offline LAN deployment has no route to a CDN. Using a new
// weight means adding its import here, or the browser will synthesize it.
import '@fontsource/hanken-grotesk/400.css'
import '@fontsource/hanken-grotesk/500.css'
import '@fontsource/hanken-grotesk/600.css'
import '@fontsource/hanken-grotesk/700.css'
import '@fontsource/spectral/400.css'
import '@fontsource/spectral/500.css'
import '@fontsource/spectral/600.css'
import '@fontsource/space-mono/400.css'
import '@fontsource/space-mono/700.css'
// Only the stylesheets the charts we actually use need — microcharts splits
// them per chart, and `styles.css` would pull in all 106 (#184).
import '@microcharts/react/styles/core.css'
import '@microcharts/react/styles/sparkline.css'
// Design-system tokens + Tailwind utilities.
import './design-system.css'
import './mobile.css'
import './microcharts.css'
import { App } from './App'
import { AppProviders } from './providers'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppProviders>
      <App />
    </AppProviders>
  </StrictMode>,
)
