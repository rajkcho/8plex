import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import AccessProvider from './components/AccessProvider.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AccessProvider />
  </StrictMode>,
)
