// Los tipos de aviso que Bria puede mandar por WhatsApp (22 de octubre de 2026), en un archivo sin dependencias para
// que lo lean la pantalla de Perfil y el servidor. La regla completa vive en whatsappAlerts.js.
export const ALERT_KINDS = Object.freeze(['ACCESS', 'DAILY', 'PULSE']);
export const ALERT_KIND_LABELS = Object.freeze({
  ACCESS: Object.freeze({ label: 'Pedidos de acceso', hint: 'Cuando alguien pide una contraseña o un módulo. Puedes decidir desde ahí.' }),
  DAILY: Object.freeze({ label: 'Mañana y cierre del día', hint: 'La lectura de las 7:30 y el cierre de las 5 de la tarde.' }),
  PULSE: Object.freeze({ label: 'Avisos del día', hint: 'Los que salen encima de Bria; como mucho tres al día.' })
});
