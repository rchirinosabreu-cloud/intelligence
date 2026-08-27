import { normalizeServiceSearchText } from '../utils/serviceCatalogSearch.js';

const term = (id, group, title, text) => ({ id, group, title, text });

export const CONTRACT_TERM_LIBRARY = [
  term('general-contact', 'General', 'Delegado del cliente', 'El cliente tendrá un delegado que será el contacto directo con Brain Studio y se encargará de brindar la información necesaria para el desarrollo de los servicios.'),
  term('general-communication', 'General', 'Canales de comunicación', 'La comunicación, el envío de contenidos y los comentarios se realizarán a través de WhatsApp o correo electrónico para garantizar claridad y trazabilidad.'),
  term('general-contract', 'General', 'Contrato de prestación', 'Para iniciar el proyecto se deberá firmar un contrato de prestación de servicios a nombre de persona natural o jurídica, según corresponda.'),
  term('general-contract-data', 'General', 'Información contractual', 'Para elaborar el contrato, el cliente deberá suministrar nombre completo o razón social, NIT o documento de identidad, correo electrónico, dirección y datos de contacto.'),
  term('general-payment', 'General', 'Forma de pago', 'Para iniciar el proyecto, el cliente realizará un abono del 50% del servicio. El saldo se pagará al finalizar la primera etapa o período y los servicios recurrentes se pagarán con la periodicidad acordada.'),
  term('general-extra-services', 'General', 'Servicios adicionales', 'Cualquier producto, pieza, aplicación o servicio que no esté incluido expresamente en la propuesta tendrá un valor adicional.'),
  term('general-validity', 'General', 'Vigencia', 'La propuesta tiene una vigencia de 15 días calendario.'),
  term('billing-electronic', 'Facturación', 'Factura electrónica', 'Los valores presentados no incluyen IVA. En caso de requerir factura electrónica, se adicionará el 19% correspondiente.'),
  term('ads-investment', 'Pauta', 'Inversión publicitaria', 'La inversión publicitaria no está incluida dentro de los honorarios de Brain Studio y será asumida directamente por el cliente.'),
  term('ads-results', 'Pauta', 'Resultados de campañas', 'La administración de pauta comprende configuración, segmentación, seguimiento y optimización, pero no garantiza resultados comerciales específicos porque estos dependen del presupuesto, la oferta, la competencia, la atención de leads y el comportamiento del mercado.'),
  term('marketing-community', 'Marketing', 'Atención de comunidad', 'La gestión de redes no incluye atención de comentarios o mensajes directos, community management, atención de WhatsApp, gestión de leads, llamadas, seguimiento comercial ni cierre de ventas, salvo cotización expresa.'),
  term('marketing-adjustments', 'Marketing', 'Ajustes de contenido', 'Cada contenido incluye hasta dos rondas de ajustes. Los cambios solicitados después de aprobado el contenido podrán generar costos adicionales.'),
  term('marketing-inputs', 'Marketing', 'Entrega de insumos', 'Si el cliente no entrega información, aprobaciones, accesos o materiales oportunamente, el cronograma de publicación, producción o pauta podrá ajustarse.'),
  term('marketing-included-work', 'Marketing', 'Alcance de contenidos', 'El servicio de redes sociales incluye únicamente las piezas, videos y textos descritos expresamente en el alcance aprobado.'),
  term('marketing-monthly', 'Marketing', 'Planificación mensual', 'La planificación de contenidos será mensual. Una vez aprobada la parrilla, cualquier cambio estructural podrá afectar los tiempos de entrega y publicación.'),
  term('production-client-material', 'Producción', 'Material suministrado', 'Cuando no se incluya jornada de producción, la edición de videos se realizará sobre material suministrado por el cliente y no incluirá grabación, fotografía, reportería, modelos, maquillaje, locaciones ni desplazamientos.'),
  term('production-session', 'Producción', 'Jornada de producción', 'La jornada de producción deberá programarse previamente según la disponibilidad del cliente y del equipo de Brain Studio y tendrá la duración indicada en el alcance del servicio.'),
  term('production-files-only', 'Producción', 'Entrega de archivos', 'Cuando captions, publicación o programación estén a cargo del cliente, Brain Studio entregará únicamente los archivos finales listos para publicar; no se incluye copy, programación, publicación ni calendario editorial.'),
  term('branding-inputs', 'Branding', 'Información de marca', 'El cliente entregará la información base de la marca, actividad comercial, público objetivo, referentes visuales, usos esperados y materiales previos necesarios para iniciar.'),
  term('branding-scope', 'Branding', 'Alcance de identidad', 'El branding se desarrollará según el alcance aprobado. Cualquier pieza, aplicación, documento, versión o desarrollo no incluido expresamente se cotizará por separado.'),
  term('branding-legal', 'Branding', 'Registro y disponibilidad legal', 'El servicio no incluye registro de marca, antecedentes marcarios, trámites legales, estudio jurídico de disponibilidad ni inscripción ante entidades oficiales.'),
  term('branding-adjustments', 'Branding', 'Rondas de ajustes', 'Cada entregable incluye hasta dos rondas de ajustes razonables. Un cambio completo de dirección creativa, concepto, estilo o nombre no se considera un ajuste y podrá generar costos adicionales.'),
  term('branding-unused-concepts', 'Branding', 'Propuestas no seleccionadas', 'Las propuestas, conceptos, logos o rutas visuales no seleccionadas no podrán utilizarse, modificarse, reproducirse ni entregarse a terceros sin autorización de Brain Studio.'),
  term('branding-final-files', 'Branding', 'Archivos finales y editables', 'Los archivos finales se entregarán después de la aprobación y el pago completo. Los editables se entregarán únicamente cuando estén contemplados en el alcance o exista acuerdo expreso.'),
  term('branding-production-exclusions', 'Branding', 'Producción física', 'El servicio no incluye impresión, producción física, señalética, uniformes, empaques, merchandising, fotografía, video, pauta, web ni aplicaciones adicionales, salvo indicación expresa.'),
  term('branding-third-party-assets', 'Branding', 'Licencias y recursos', 'Las fuentes, licencias, mockups, imágenes, ilustraciones, íconos premium u otros recursos pagos necesarios serán asumidos por el cliente.'),
  term('branding-review-data', 'Branding', 'Revisión de información', 'El cliente es responsable de revisar nombres, textos, datos de contacto y demás información antes de aprobar. Las correcciones posteriores podrán generar costos adicionales.'),
  term('branding-rights', 'Branding', 'Derechos de uso', 'Los derechos de uso de la identidad final aprobada se cederán al cliente una vez pagado el proyecto. Brain Studio podrá mostrarlo en su portafolio salvo acuerdo previo de confidencialidad.'),
  term('branding-naming', 'Branding', 'Naming', 'Las propuestas de naming son creativas y comerciales; Brain Studio no garantiza disponibilidad legal, de dominio, en redes sociales ni aprobación de registro marcario.'),
  term('branding-slogan', 'Branding', 'Slogan', 'El slogan, concepto verbal o mensaje de marca se entrega como propuesta creativa. La validación legal o regulatoria de su uso será responsabilidad del cliente.'),
  term('branding-rebranding', 'Branding', 'Rebranding', 'El rebranding actualiza una identidad existente y no incluye creación desde cero, naming, registro de marca, estudio jurídico, producción física, impresión o instalación, salvo alcance expreso.'),
  term('web-access', 'Web', 'Accesos y respaldos', 'El cliente entregará los accesos requeridos a sitio, WordPress, hosting, dominio, correos, plugins y plataformas. Antes de intervenir se procurará realizar una copia de seguridad.'),
  term('web-existing-site', 'Web', 'Sitio existente', 'El servicio se realizará sobre el sitio existente y no incluye reconstrucción completa, migración, cambio de hosting, dominio, plantillas premium, licencias ni herramientas pagas, salvo indicación expresa.'),
  term('web-extra-features', 'Web', 'Funcionalidades adicionales', 'Nuevas páginas, landing pages, tienda virtual, pagos, reservas, CRM, automatizaciones, intranet, áreas privadas, integraciones o desarrollos a medida se cotizarán por separado.'),
  term('web-content', 'Web', 'Contenido y textos legales', 'El servicio no incluye redacción completa, traducciones, fotografía, bancos de imágenes pagos ni contenidos legales. Los textos médicos, de privacidad, cookies o avisos legales deberán ser aprobados por el cliente o su asesor.'),
  term('web-adjustments', 'Web', 'Ajustes web', 'Cada entrega incluye hasta dos rondas de ajustes. Los cambios posteriores a la aprobación, nuevas páginas, secciones o modificaciones estructurales podrán generar costos y plazos adicionales.'),
  term('web-third-party-issues', 'Web', 'Limitaciones técnicas externas', 'Problemas de hosting, servidor, licencias, malware, plugins pagos o servicios de terceros serán informados y podrán requerir una cotización adicional.'),
  term('web-third-party-results', 'Web', 'Resultados SEO', 'Se procurará conservar URLs, estructura e indexación existentes, pero no se garantizan posiciones específicas, tráfico orgánico ni resultados SEO determinados.'),
  term('web-client-delays', 'Web', 'Demoras del cliente', 'Si el cliente no entrega información, accesos, aprobaciones o materiales oportunamente, el cronograma podrá ajustarse.'),
  term('international-fees', 'Pagos', 'Pagos internacionales', 'Las comisiones por transacción, conversión o retiro en PayPal u otras plataformas internacionales estarán a cargo del cliente y se adicionarán para que Brain Studio reciba el monto total acordado.'),
  term('brochure-update', 'Editorial', 'Actualización de brochure', 'El cliente suministrará oportunamente la información del brochure. El servicio contempla hasta dos rondas de ajustes sobre el diseño existente y no incluye un rediseño total.'),
];

const GENERAL_IDS = CONTRACT_TERM_LIBRARY.filter(({ group }) => group === 'General').map(({ id }) => id);
const idsByGroup = (group) => CONTRACT_TERM_LIBRARY.filter((entry) => entry.group === group).map(({ id }) => id);
const append = (target, ids) => ids.forEach((id) => target.add(id));

export const resolveSuggestedContractTermIds = (services = [], context = {}) => {
  const selected = new Set(GENERAL_IDS);
  const normalizedServices = services.map((service) => ({
    category: normalizeServiceSearchText(service?.category || ''),
    title: normalizeServiceSearchText(service?.name || ''),
    description: normalizeServiceSearchText(service?.description || '')
  }));
  const categoryIs = (category) => normalizedServices.some((service) => (
    service.category === normalizeServiceSearchText(category)
  ));
  const titleHas = (...patterns) => normalizedServices.some(({ title }) => (
    patterns.some((pattern) => title.includes(normalizeServiceSearchText(pattern)))
  ));
  const serviceHas = (...patterns) => normalizedServices.some(({ title, description }) => (
    patterns.some((pattern) => `${title} ${description}`.includes(normalizeServiceSearchText(pattern)))
  ));

  if (context.currency === 'COP' && context.isTaxExempt) selected.add('billing-electronic');
  if (categoryIs('ADS') || titleHas('pauta', 'campaña publicitaria', 'meta ads', 'google ads')) append(selected, idsByGroup('Pauta'));
  if (categoryIs('MARKETING') || titleHas('gestión de redes', 'gestion de redes', 'redes sociales', 'social media', 'parrilla de contenido')) append(selected, idsByGroup('Marketing'));
  if (categoryIs('PRODUCCION_AUDIOVISUAL') || titleHas('produccion audiovisual', 'grabacion', 'jornada')) selected.add('production-session');
  if (serviceHas('edicion de video', 'edicion de vídeo') && !serviceHas('no incluye edicion', 'no incluye edición', 'sin edicion', 'sin edición')) selected.add('production-client-material');
  if (serviceHas('solo entrega de archivos', 'unicamente archivos finales', 'únicamente archivos finales', 'publicacion a cargo del cliente', 'publicación a cargo del cliente')) selected.add('production-files-only');
  if (categoryIs('BRANDING') || titleHas('identidad visual', 'logo', 'marca')) append(selected, idsByGroup('Branding').filter((id) => !['branding-naming', 'branding-slogan', 'branding-rebranding'].includes(id)));
  if (serviceHas('naming', 'creacion de nombre')) selected.add('branding-naming');
  if (serviceHas('slogan')) selected.add('branding-slogan');
  if (serviceHas('rebranding', 'rediseño de marca')) selected.add('branding-rebranding');
  if (categoryIs('WEB') || titleHas('sitio web', 'pagina web', 'wordpress', 'landing page')) append(selected, idsByGroup('Web'));
  if (context.currency === 'USD') selected.add('international-fees');
  if (serviceHas('actualizacion de brochure', 'actualización de brochure')) selected.add('brochure-update');

  return CONTRACT_TERM_LIBRARY.map(({ id }) => id).filter((id) => selected.has(id));
};

export const sanitizeContractTermsText = (value) => String(value || '')
  .split(/\r?\n/)
  .map((line) => line.replace(/^[●•]\s*/, '').replace(/\s+/g, ' ').trim())
  .filter(Boolean)
  .slice(0, 100)
  .map((line) => `● ${line.slice(0, 2000)}`)
  .join('\n');

export const buildContractTermsText = (selectedIds = [], customTerms = []) => {
  const libraryById = new Map(CONTRACT_TERM_LIBRARY.map((entry) => [entry.id, entry]));
  return sanitizeContractTermsText([
    ...selectedIds.map((id) => libraryById.get(id)?.text).filter(Boolean),
    ...customTerms
  ].join('\n'));
};

export const parseContractTermsText = (value) => String(value || '')
  .split(/\r?\n/)
  .map((line) => line.replace(/^[●•]\s*/, '').trim())
  .filter(Boolean);
