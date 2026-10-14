import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { prefetchTextures } from './config/textureList'
import './styles.css'

prefetchTextures()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
