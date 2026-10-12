// Sesión de muestra para las vistas locales de Gobierno de IA: un token sin firma que solo entiende el
// servidor de la muestra (scripts/preview-ai-governance.js). Nunca sirve contra la plataforma real.
const encode = (value) => btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
export function startPreviewSession(user) {
  const token = `${encode({ alg: 'none' })}.${encode({ userId: user.id, exp: Math.floor(Date.now() / 1000) + 3600 })}.muestra`;
  localStorage.setItem('authToken', token);
  localStorage.setItem('currentUser', JSON.stringify(user));
}
