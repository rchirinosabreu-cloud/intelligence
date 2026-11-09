import './financial-integrity.jsx';
import axios from 'axios';
const fallback = axios.defaults.adapter, request = axios.getAdapter('xhr');
axios.defaults.adapter = config => {
  const url = new URL(config.url, location.origin), path = url.pathname.replace('/api/financials', '');
  if (/^\/(payroll|payroll-ledger|payroll-contracts|payroll-transactions|payroll-adjustments|accounts|records|dashboard|receivables-ledger)(\/|$)/.test(path)) return request({ ...config, url: `${location.origin}/preview-api${path}${url.search}` });
  if (config.method !== 'get') return Promise.reject(Object.assign(new Error('Fuera de la muestra'), { response: { status: 400, data: { message: 'Acción fuera de la muestra local.' } } }));
  return fallback(config);
};
new MutationObserver(() => {
  const paragraph = document.querySelector('#root > div > div > p');
  if (paragraph?.textContent.includes('datos ficticios en memoria')) paragraph.textContent = new URLSearchParams(location.search).has('contractFlow') ? 'Nómina en local · misma pantalla y servicios de la plataforma · datos de prueba aislados' : 'Muestra local · Jesu y Melissa son ejemplos ficticios · fechas e importes por confirmar · sin acceso a datos reales';
}).observe(document.getElementById('root'), { childList: true, subtree: true });
