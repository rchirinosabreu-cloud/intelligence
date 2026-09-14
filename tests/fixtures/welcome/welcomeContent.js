export { welcomeCatalog, getWelcomeModules, welcomeName } from '../../../src/lib/welcomeContent.js';
export const welcomeDemoProfiles = {
  francis: { id: 'demo-francis', name: 'Francis Caballero', role: 'VIEWER', modulePermissions: { dashboard: true, gestion: true, actividad: true, parrillas: true, cotizaciones: true, clientes: true, equipo: true } },
  david: { id: 'demo-david', name: 'David Rodríguez', role: 'VIEWER', modulePermissions: { dashboard: true, gestion: true, actividad: true, equipo: true } },
  admin: { id: 'demo-admin', name: 'Rodny Chirinos', role: 'ADMIN' },
  empty: { id: 'demo-no-access', name: 'Persona de prueba', role: 'VIEWER', modulePermissions: {} },
};
