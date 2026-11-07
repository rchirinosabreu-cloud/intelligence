import './financial-integrity.jsx';
import axios from 'axios';

// Reuse the real financial screen. These endpoints use the native correction and
// balance services over an isolated local PostgreSQL schema; other tabs are fixtures.
const fallback = axios.defaults.adapter;
const request = axios.getAdapter('xhr');
axios.defaults.adapter = config => {
  const url = new URL(config.url, location.origin);
  const path = url.pathname.replace('/api/financials', '');
  const native = /^\/(accounts(?:\/[^/]+\/statement)?|records|dashboard|periods|payroll-ledger|payables-ledger|receivables-ledger|third-parties|payment-corrections\/[^/]+\/[^/]+)$/.test(path);
  if (native) return request({ ...config, url: `${location.origin}/preview-api${path}${url.search}` });
  if (config.method !== 'get') return Promise.reject(Object.assign(new Error('Fuera de la muestra'), { response: { status: 400, data: { message: 'Esta muestra permite guardar únicamente las correcciones del bloque 2.' } } }));
  return fallback(config);
};
const observer = new MutationObserver(() => {
  const paragraph = document.querySelector('#root > div > div > p');
  if (paragraph?.textContent.includes('datos ficticios en memoria')) paragraph.textContent = 'Muestra local · datos ficticios · saldos y correcciones en base aislada · sin acceso a producción';
});
observer.observe(document.getElementById('root'), { childList: true, subtree: true });
