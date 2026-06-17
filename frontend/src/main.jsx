import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './styles/tokens.css'
import { ToastProvider } from './context/ToastContext'

console.time('2. Cargar y Renderizar React (main.jsx)');

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ToastProvider>
      <App />
    </ToastProvider>
  </React.StrictMode>,
)
console.timeEnd('2. Cargar y Renderizar React (main.jsx)');
