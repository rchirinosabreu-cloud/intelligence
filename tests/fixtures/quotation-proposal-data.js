export const proposalDemo = {
  id: 'local-sunpartners', uuid_slug: 'local-sunpartners', consecutive: 26, consecutive_formatted: 'COT-0026 · MUESTRA',
  emisor_type: 'BRAIN_STUDIO', client_name: 'Contacto de muestra', client_company: 'SunPartners · ejemplo local', client_type: 'EMPRESA',
  client_email: 'demo@example.invalid', client_phone: '3000000000', currency: 'COP', is_tax_exempt: false, status: 'BORRADOR', duration_months: 1,
  created_at: '2026-09-08T15:00:00Z', issued_at: '2026-09-08T15:00:00Z', expires_at: '2099-09-23T15:00:00Z',
  terms_and_conditions: '● Los pagos se realizarán según el plan de pagos detallado en esta propuesta.\n● Los plazos empiezan con la entrega de accesos e insumos completos.\n● Este documento es una muestra local; no es una oferta comercial.',
  items: [
    ['Arquitectura y descubrimiento', 1200000, 'Definición de procesos y modelo de datos.', 1, 2],
    ['Implementación CRM', 2300000, 'Pipeline comercial, contactos y oportunidades.', 3, 4],
    ['Integración Meta Ads', 1700000, 'Captura de leads y trazabilidad del origen.', 2, 3],
    ['WhatsApp con IA y n8n', 2700000, 'Automatizaciones de atención y seguimiento.', 3, 4],
    ['Clasificación comercial', 2000000, 'Reglas de segmentación y asignación.', 2, 3],
    ['Pruebas y puesta en marcha', 2100000, 'Validación con el equipo y entrega.', 2, 2],
    ['Remisiones digitales', 2000000, 'Registro, consulta y trazabilidad de remisiones.', 1, 2]
  ].map(([name, price, description, min, max], i) => ({ name, price, description, descriptionHtml: `<p>${description}</p><ul><li><p><strong>Entregable:</strong> configuración y documentación.</p></li><li><p><u>Validación</u> con el equipo designado.</p></li></ul>`, quantity: 1, billingType: 'ONE_TIME', estimatedCost: null, group: i < 6 ? 'Desarrollo 1 · CRM e integraciones' : 'Desarrollo 2 · Remisiones', execution: { min, max, unit: 'WEEKS', startNote: '' } })),
  proposal_details: {
    version: 1, title: 'Sistema comercial y remisiones digitales', introductionHtml: '<p>Conectar la captación, el seguimiento comercial y la operación en una <strong>experiencia trazable</strong>.</p><p>Este ejemplo organiza el proyecto en dos desarrollos complementarios; no son opciones excluyentes.</p>',
    execution: { min: 9, max: 12, unit: 'WEEKS', startNote: 'Cronograma ilustrativo, sujeto a validación' },
    phases: ['Descubrimiento', 'Núcleo CRM', 'Integraciones', 'Validación y entrega', 'Remisiones'].map((title, i) => ({ id: `f${i}`, title, execution: { min: [1,3,3,2,1][i], max: [2,4,4,2,2][i], unit: 'WEEKS' }, starts: i === 0 ? 'AT_START' : i === 4 ? 'PARALLEL' : 'AFTER_PREVIOUS', descriptionHtml: i === 4 ? '<p>Trabajo en paralelo, únicamente a efectos de esta muestra.</p>' : '', completion: 'Validación del entregable con el cliente' })),
    bonusHtml: '<p>Adaptación responsive para uso móvil. No incluye una aplicación nativa.</p>', exclusionsHtml: '<p>Licencias de terceros y presupuesto publicitario no incluidos.</p>',
    referencesHtml: '<p>Podemos añadir aquí casos y referencias relevantes.</p><p><a href="https://example.com/">Referencia ilustrativa — sustituir por un caso real</a></p>',
    paymentTermsConfirmed: true,
    paymentPlans: [{ scenarioId: null, mode: 'PERCENTAGE', installments: [
      { id: 'p1', label: 'Inicio del proyecto', value: 50, dueType: 'MILESTONE', milestone: 'Al iniciar' },
      { id: 'p2', label: 'Núcleo CRM', value: 30, dueType: 'MILESTONE', milestone: 'Al aprobar el núcleo CRM' },
      { id: 'p3', label: 'Entrega final', value: 20, dueType: 'MILESTONE', milestone: 'Al finalizar las implementaciones' }
    ] }]
  }
};
