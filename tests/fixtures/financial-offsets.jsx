import './financial-integrity.jsx';
import axios from 'axios';

const fallback = axios.defaults.adapter;
const request = axios.getAdapter('xhr');
axios.defaults.adapter = config => {
  const url = new URL(config.url, location.origin);
  const path = url.pathname.replace('/api/financials', '');
  const native = /^\/(accounts|records|dashboard|periods|payables-ledger|receivables-ledger|receivable-adjustments|third-parties|receivables\/[^/]+\/(offset-options|settlements)|offsets\/[^/]+(?:\/reverse)?)$/.test(path);
  if (native) return request({ ...config, url: `${location.origin}/preview-api${path}${url.search}` });
  if (config.method !== 'get') return Promise.reject(Object.assign(new Error('Fuera de la muestra'), { response: { status: 400, data: { message: 'Esta muestra permite registrar y revertir cruces ficticios.' } } }));
  return fallback(config);
};
const observer = new MutationObserver(() => {
  const paragraph = document.querySelector('#root > div > div > p');
  if (paragraph?.textContent.includes('datos ficticios en memoria')) paragraph.textContent = 'Muestra local · cruce y reversión con obligaciones ficticias · base aislada · sin acceso a datos reales';
});
observer.observe(document.getElementById('root'), { childList: true, subtree: true });
