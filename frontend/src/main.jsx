import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import { AuthProvider } from './context/AuthContext.jsx'
import { LocaleProvider } from './context/LocaleContext.jsx'
import './index.css'

// LocaleProvider sits outermost: it only reads localStorage and sets <html lang>,
// so it must be available to everything below including the auth screens.
ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
        <LocaleProvider>
            <AuthProvider>
                <App />
            </AuthProvider>
        </LocaleProvider>
    </React.StrictMode>,
)
