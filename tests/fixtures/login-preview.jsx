import React from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import Login from '../../src/components/Login';
import '../../src/index.css';

// Muestra local de la dirección principal sin sesión (25 de noviembre de 2026): el inicio de sesión y,
// debajo, la presentación pública del producto. `?dark` la muestra en oscuro.
if (new URLSearchParams(window.location.search).has('dark')) document.documentElement.classList.add('dark');

createRoot(document.getElementById('root')).render(
  <MemoryRouter>
    <Login onLogin={() => {}} />
  </MemoryRouter>
);
