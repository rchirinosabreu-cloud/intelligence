
import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import AppLayout from './components/layout/AppLayout';
import Dashboard from './components/modules/Dashboard';
import Tasks from './components/modules/Tasks';
import Chat from './components/modules/Chat';
import Clients from './components/modules/Clients';
import ClientDetailWrapper from './components/modules/ClientDetailWrapper';
import { ThemeProvider } from './context/ThemeContext';

function App() {
  return (
    <ThemeProvider>
      <Router>
        <AppLayout>
          <Routes>
            {/* Rutas Principales */}
            <Route path="/" element={<Dashboard />} />
            <Route path="/inicio" element={<Navigate to="/" replace />} />

            <Route path="/bria" element={<Chat />} />
            <Route path="/pendientes" element={<Tasks />} />

            <Route path="/clientes" element={<Clients />} />
            <Route path="/cliente/:clientId" element={<ClientDetailWrapper />} />

            {/* Fallback para rutas no encontradas - redirigir a inicio */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AppLayout>
      </Router>
    </ThemeProvider>
  );
}

export default App;
