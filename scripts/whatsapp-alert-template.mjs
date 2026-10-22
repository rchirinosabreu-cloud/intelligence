#!/usr/bin/env node
// La plantilla con que Bria avisa por WhatsApp fuera de la ventana de 24 horas (22 de octubre de 2026). Meta solo deja
// escribirle primero a alguien con una plantilla aprobada; esta es una sola, genérica de utilidad, con un botón
// «Ver aviso» que trae el aviso completo. Su texto vive en src/lib/whatsappAlerts.js.
//
//   node scripts/whatsapp-alert-template.mjs                     muestra lo que se enviaría, sin tocar Meta
//   node scripts/whatsapp-alert-template.mjs --estado            dice si Meta ya la aprobó
//   node scripts/whatsapp-alert-template.mjs --confirmar ENVIAR  la envía a revisión
//
// Lee META_WHATSAPP_TOKEN y, si existe, META_WHATSAPP_BUSINESS_ACCOUNT_ID (si no, la cuenta de Brain Studio). El token
// va en la cabecera y nunca se imprime.
import { ALERT_TEMPLATE, ALERT_TEMPLATE_BODY, ALERT_TEMPLATE_EXAMPLE } from '../src/lib/whatsappAlerts.js';
import { META_GRAPH_ORIGIN, META_GRAPH_VERSION } from '../src/services/metaGraphService.js';

const BRAIN_STUDIO_WABA = '4718657265088198';

export const templateDefinition = () => ({
  name: ALERT_TEMPLATE.name,
  language: ALERT_TEMPLATE.language,
  category: ALERT_TEMPLATE.category,
  components: [
    { type: 'BODY', text: ALERT_TEMPLATE_BODY, example: { body_text: [[...ALERT_TEMPLATE_EXAMPLE]] } },
    { type: 'BUTTONS', buttons: [{ type: 'QUICK_REPLY', text: ALERT_TEMPLATE.button }] }
  ]
});

const graph = async (path, { method = 'GET', body } = {}) => {
  const token = process.env.META_WHATSAPP_TOKEN;
  if (!token) throw new Error('Falta META_WHATSAPP_TOKEN en el entorno.');
  const response = await fetch(`${META_GRAPH_ORIGIN}/${META_GRAPH_VERSION}/${path}`, {
    method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}), redirect: 'error'
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.error) throw new Error(data.error?.message || `Meta respondió ${response.status}`);
  return data;
};

const main = async (argv) => {
  const waba = process.env.META_WHATSAPP_BUSINESS_ACCOUNT_ID || BRAIN_STUDIO_WABA;
  const definition = templateDefinition();
  if (argv.includes('--estado')) {
    const { data = [] } = await graph(`${waba}/message_templates?name=${encodeURIComponent(definition.name)}&fields=name,status,category,language,rejected_reason`);
    if (!data.length) { console.log(`La plantilla «${definition.name}» todavía no está en Meta.`); return; }
    for (const row of data) console.log(`${row.name} (${row.language}): ${row.status}${row.category ? ` · ${row.category}` : ''}${row.rejected_reason && row.rejected_reason !== 'NONE' ? ` · motivo: ${row.rejected_reason}` : ''}`);
    return;
  }
  const index = argv.indexOf('--confirmar');
  if (index === -1 || argv[index + 1] !== 'ENVIAR') {
    console.log('Simulación: esto es lo que se enviaría a revisión. Para enviarla: --confirmar ENVIAR');
    console.log(JSON.stringify({ cuenta: waba, ...definition }, null, 2));
    return;
  }
  const created = await graph(`${waba}/message_templates`, { method: 'POST', body: definition });
  console.log(`Enviada a revisión: ${definition.name} · id ${created.id} · estado ${created.status || 'PENDING'}${created.category ? ` · ${created.category}` : ''}.`);
};

if (process.argv[1]?.endsWith('whatsapp-alert-template.mjs')) {
  main(process.argv.slice(2)).catch((failure) => { console.error(`No se pudo: ${failure.message}`); process.exitCode = 1; });
}
