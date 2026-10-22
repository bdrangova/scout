import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { ThemeProvider } from './theme/ThemeProvider'
import { ScoutPalette } from './components/brand/ScoutPalette'
import './index.css'

const container = document.getElementById('root')
if (!container) throw new Error('index.html has no #root element')

createRoot(container).render(
  <StrictMode>
    <ThemeProvider>
      <ScoutPalette />
      <App />
    </ThemeProvider>
  </StrictMode>,
)
