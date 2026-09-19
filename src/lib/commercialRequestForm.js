// Formulario de solicitud comercial · Brain Studio.
// The whole form is data: steps, questions, conditional blocks, and the mapping to the CRM lead and to the
// quotation catalog. The React component only renders what this file says; the API will validate with it too.

export const SERVICE_CATEGORIES = Object.freeze([
  { value: 'BRANDING', label: 'Branding', description: 'Creación y evolución de marcas: identidad visual, logotipos, naming, manuales de marca, rebranding y sistemas visuales.' },
  { value: 'DISENO', label: 'Diseño', description: 'Piezas gráficas, presentaciones, brochures, flyers, campañas, plegables, pendones y materiales digitales o impresos.' },
  { value: 'COMUNICACION_CORPORATIVA', label: 'Comunicación corporativa', description: 'Estrategias de comunicación, posicionamiento, campañas, relacionamiento con medios, comunicados, vocería y acompañamiento institucional.' },
  { value: 'PRODUCCION_AUDIOVISUAL', label: 'Producción audiovisual', description: 'Fotografía, video, reels, edición, grabaciones, drone, guiones, cobertura, producción y postproducción.' },
  { value: 'MARKETING', label: 'Marketing', description: 'Estrategia digital, gestión de redes sociales, planeación de contenidos, copywriting, community management y campañas.' },
  { value: 'ADS', label: 'Ads', description: 'Meta Ads, Google Ads, TikTok Ads, SEM, performance y administración de publicidad digital.' },
  { value: 'EDITORIAL', label: 'Editorial', description: 'Informes, revistas, libros, catálogos, memorias, documentos institucionales y publicaciones.' },
  { value: 'WEB', label: 'Web', description: 'Sitios web, landing pages, e-commerce, rediseño, UX/UI, mantenimiento y actualización.' },
  { value: 'DESARROLLO', label: 'Desarrollo', description: 'Software, plataformas, automatizaciones, soluciones con inteligencia artificial, dashboards, Power BI e integraciones.' },
  { value: 'MERCHANDISING_IMPRESION', label: 'Merchandising e impresión', description: 'Material POP, señalética, merchandising, impresión y materiales para eventos.' },
  { value: 'NO_ESTOY_SEGURO', label: 'No estoy seguro / necesito asesoría', description: 'Cuéntanos qué quieres lograr y nosotros te orientamos.' },
  { value: 'OTRO', label: 'Otro servicio', description: 'Algo que no aparece en la lista.' }
]);

// ---- question helpers ----------------------------------------------------------------------------------

const opt = (value, label = value) => ({ value, label });
const OTHER = opt('OTRO', 'Otro');
const YES_NO = [opt('SI', 'Sí'), opt('NO', 'No')];
const q = (id, label, type, extra = {}) => ({ id, label, type, ...extra });
const single = (id, label, options, extra = {}) => q(id, label, 'single', { options, ...extra });
const multi = (id, label, options, extra = {}) => q(id, label, 'multi', { options, ...extra });
const text = (id, label, extra = {}) => q(id, label, 'text', extra);
const area = (id, label, extra = {}) => q(id, label, 'textarea', extra);
const is = (id, ...values) => answers => values.includes(answers[id]);
const has = (id, value) => answers => Array.isArray(answers[id]) && answers[id].includes(value);

// ---- steps -----------------------------------------------------------------------------------------------

const CONTACT = {
  id: 'contacto', title: 'Tus datos', eyebrow: 'Paso 1', intro: 'Para saber quién eres y por dónde escribirte.',
  questions: [
    text('contactName', 'Nombre y apellido', { required: true, autoComplete: 'name', placeholder: 'Ej. Francisco Villa' }),
    text('company', 'Empresa / organización / marca', { required: true, autoComplete: 'organization', placeholder: 'Ej. Brainstudio Agencia' }),
    text('jobTitle', 'Cargo', { placeholder: 'Ej. Gerente de mercadeo' }),
    q('email', 'Correo electrónico', 'email', { required: true, autoComplete: 'email', placeholder: 'nombre@empresa.com' }),
    q('phone', 'WhatsApp / teléfono', 'phone', { required: true, autoComplete: 'tel', placeholder: '+57 300 000 0000' }),
    text('location', 'Ciudad y país', { required: true, placeholder: 'Ej. Bogotá, Colombia' }),
    q('website', 'Página web o redes sociales', 'url', { placeholder: 'https://', help: 'Opcional.' })
  ]
};

const NEED = {
  id: 'necesidad', title: 'Cuéntanos qué necesitas', eyebrow: 'Paso 2', intro: 'Con el mayor detalle posible. Si ya conoces cantidades, entregables, plataformas o referencias, inclúyelas aquí.',
  questions: [
    area('need', '¿Qué proyecto, necesidad o idea quieres desarrollar con Brain Studio?', { required: true, rows: 6, placeholder: 'Qué estás buscando, qué necesitas resolver o qué quieres desarrollar…' }),
    single('hasKeyDate', '¿Hay alguna fecha importante que debamos tener en cuenta?', [opt('SI', 'Sí'), opt('NO', 'No'), opt('NO_DEFINIDA', 'Aún no está definida')], { required: true }),
    q('keyDate', '¿Cuál es la fecha?', 'date', { showIf: is('hasKeyDate', 'SI'), required: true }),
    text('keyDateNote', '¿Qué sucede ese día?', { showIf: is('hasKeyDate', 'SI'), placeholder: 'Ej. Lanzamiento del producto, evento, cierre de convocatoria' }),
    single('startWhen', '¿Cuándo te gustaría iniciar?', [
      opt('ASAP', 'Lo antes posible'), opt('DOS_SEMANAS', 'En las próximas 2 semanas'), opt('PROXIMO_MES', 'Durante el próximo mes'),
      opt('UNO_A_TRES_MESES', 'En 1 a 3 meses'), opt('MAS_ADELANTE', 'Más adelante'), opt('NO_DEFINIDO', 'Aún no lo tengo definido')
    ], { required: true })
  ]
};

const SERVICES = {
  id: 'servicios', title: '¿En qué podemos ayudarte?', eyebrow: 'Paso 3', intro: 'Selecciona uno o varios servicios. Después te haremos solo las preguntas de lo que elijas.',
  questions: [multi('services', 'Servicios', SERVICE_CATEGORIES, { required: true, layout: 'cards', exclusive: ['NO_ESTOY_SEGURO'] })]
};

// One short block per service. `catalog` says which quotation catalog item each answer suggests
// (a catalog name, or a custom line when the catalog has no equivalent yet).
export const SERVICE_BLOCKS = Object.freeze({
  BRANDING: {
    title: 'Branding', questions: [
      multi('branding.needs', '¿Qué necesitas principalmente?', [
        opt('MARCA_NUEVA', 'Crear una marca desde cero'), opt('LOGOTIPO', 'Diseño de logotipo'), opt('NAMING', 'Naming / creación de nombre'),
        opt('IDENTIDAD', 'Identidad visual'), opt('MANUAL', 'Manual de marca'), opt('REBRANDING', 'Rebranding'), opt('ACTUALIZACION', 'Actualización de una marca existente'), OTHER
      ], { required: true }),
      single('branding.exists', '¿La marca ya existe?', [opt('SI', 'Sí'), opt('NO', 'No'), opt('EN_CONSTRUCCION', 'Está en construcción')], { required: true }),
      area('branding.detail', 'Cuéntanos brevemente qué necesitas desarrollar o transformar.', { rows: 3 })
    ],
    catalog: { 'branding.needs': { MARCA_NUEVA: 'Marca Plan Estándar', LOGOTIPO: 'Marca Plan Básico', NAMING: 'Naming', IDENTIDAD: 'Rediseño de identidad visual', MANUAL: 'Manual corporativo', REBRANDING: 'Rebranding de marca corporativa', ACTUALIZACION: 'Aplicación adicional de marca', OTRO: null } }
  },
  DISENO: {
    title: 'Diseño', questions: [
      multi('design.pieces', '¿Qué tipo de piezas necesitas?', [
        opt('FLYERS', 'Flyers'), opt('BROCHURE', 'Brochure'), opt('PRESENTACION', 'Presentación'), opt('CAMPANA', 'Piezas para campaña'), opt('REDES', 'Piezas para redes'),
        opt('PENDONES', 'Pendones'), opt('PLEGABLES', 'Trípticos / plegables'), opt('IMPRESO', 'Material impreso'), OTHER
      ], { required: true }),
      text('design.quantity', '¿Cuántas piezas aproximadamente necesitas?', { placeholder: 'Ej. 12 piezas al mes, 3 flyers…' }),
      single('design.usage', '¿Las piezas serán para uso…?', [opt('DIGITAL', 'Digital'), opt('IMPRESO', 'Impreso'), opt('AMBOS', 'Ambos')], { required: true })
    ],
    catalog: { 'design.pieces': { FLYERS: 'Pieza gráfica individual', BROCHURE: 'Brochure de servicios hasta 8 páginas', PRESENTACION: 'Presentación corporativa', CAMPANA: 'Pieza gráfica individual', REDES: 'Carrusel de hasta 10 slides', PENDONES: 'Pieza gráfica individual', PLEGABLES: 'Diseño y diagramación de tríptico institucional de 6 caras', IMPRESO: 'Diseño de material POP', OTRO: null } }
  },
  COMUNICACION_CORPORATIVA: {
    title: 'Comunicación corporativa', questions: [
      multi('comms.needs', '¿Qué tipo de apoyo necesitas?', [
        opt('ESTRATEGIA', 'Estrategia de comunicación'), opt('PLANEACION', 'Planeación de comunicaciones'), opt('CAMPANA', 'Campaña'), opt('CORPORATIVA', 'Comunicación corporativa'),
        opt('INTERNA', 'Comunicación interna'), opt('MEDIOS', 'Relaciones con medios'), opt('COMUNICADOS', 'Comunicados de prensa'), opt('VOCERIA', 'Vocería'),
        opt('MENSUAL', 'Acompañamiento mensual'), opt('EQUIPO_EXTERNO', 'Equipo externo de comunicaciones'), OTHER
      ], { required: true }),
      area('comms.detail', 'Cuéntanos brevemente cuál es la necesidad o reto de comunicación.', { rows: 3 })
    ],
    catalog: { 'comms.needs': { MENSUAL: 'Apoyo mensual en comunicación interna y diseño corporativo', INTERNA: 'Apoyo mensual en comunicación interna y diseño corporativo', EQUIPO_EXTERNO: 'Apoyo mensual en comunicación interna y diseño corporativo' } }
  },
  PRODUCCION_AUDIOVISUAL: {
    title: 'Producción audiovisual', questions: [
      multi('av.needs', '¿Qué necesitas?', [
        opt('VIDEO', 'Video'), opt('VIDEO_CORPORATIVO', 'Video corporativo'), opt('REELS', 'Reels / contenido vertical'), opt('FOTOGRAFIA', 'Fotografía'), opt('EDICION', 'Edición'),
        opt('DRONE', 'Drone'), opt('GUION', 'Guion'), opt('COBERTURA', 'Cobertura de evento'), opt('INTEGRAL', 'Producción audiovisual integral'), OTHER
      ], { required: true }),
      text('av.quantity', '¿Cuántas piezas aproximadamente necesitas?', { placeholder: 'Ej. 4 reels y 20 fotos' }),
      text('av.location', '¿Dónde se realizaría la producción?', { placeholder: 'Ciudad, lugar o locación' }),
      multi('av.extras', '¿Necesitas alguno de estos servicios adicionales?', [
        opt('DRONE', 'Drone'), opt('TALENTO', 'Modelos / talento'), opt('LOCUCION', 'Locución'), opt('GUION', 'Guion'), opt('MAQUILLAJE', 'Maquillaje'),
        opt('ANIMACION', 'Animación / motion graphics'), opt('NO_SEGURO', 'No estoy seguro'), OTHER
      ])
    ],
    catalog: {
      'av.needs': { VIDEO: 'Video individual grabado y editado', VIDEO_CORPORATIVO: 'Video corporativo', REELS: 'Edición de reel', FOTOGRAFIA: 'Sesión fotográfica de 2 horas', EDICION: 'Edición de reel', DRONE: null, GUION: 'Guion para reel', COBERTURA: 'Cobertura digital de evento', INTEGRAL: 'Producción de fotografía y video básica', OTRO: null },
      'av.extras': { DRONE: null, TALENTO: null, LOCUCION: null, GUION: 'Guion para reel', MAQUILLAJE: null, ANIMACION: 'Reel animado' }
    }
  },
  MARKETING: {
    title: 'Marketing', questions: [
      multi('mkt.needs', '¿Qué necesitas principalmente?', [
        opt('REDES', 'Manejo de redes sociales'), opt('ESTRATEGIA', 'Estrategia de marketing'), opt('PLANEACION', 'Planeación de contenidos'), opt('PARRILLA', 'Parrilla de contenidos'),
        opt('DISENO_PUBLICACIONES', 'Diseño de publicaciones'), opt('COPY', 'Copywriting'), opt('COMMUNITY', 'Community management'), opt('COMUNIDAD', 'Gestión de comunidad'),
        opt('CAMPANA', 'Campaña puntual'), opt('INTEGRAL', 'Acompañamiento integral'), OTHER
      ], { required: true }),
      multi('mkt.networks', '¿Qué redes utiliza actualmente tu marca?', [
        opt('INSTAGRAM', 'Instagram'), opt('FACEBOOK', 'Facebook'), opt('LINKEDIN', 'LinkedIn'), opt('TIKTOK', 'TikTok'), opt('YOUTUBE', 'YouTube'), opt('OTRA', 'Otra'), opt('NINGUNA', 'Actualmente no tenemos redes')
      ], { exclusive: ['NINGUNA'] }),
      single('mkt.mode', '¿Buscas un servicio…?', [opt('MENSUAL', 'Mensual'), opt('CAMPANA', 'Para una campaña específica'), opt('PUNTUAL', 'Para un proyecto puntual'), opt('NO_SEGURO', 'No estoy seguro')], { required: true })
    ],
    catalog: { 'mkt.needs': { REDES: 'Marketing Básico – 8 contenidos', ESTRATEGIA: 'Estrategia de contenidos', PLANEACION: 'Calendario de contenidos', PARRILLA: 'Calendario de contenidos', DISENO_PUBLICACIONES: 'Pieza gráfica individual', COPY: 'Copy para publicación', COMMUNITY: 'Community management', COMUNIDAD: 'Community management', CAMPANA: 'Desarrollo de campaña digital', INTEGRAL: 'Estrategia 360', OTRO: null } }
  },
  ADS: {
    title: 'Ads', questions: [
      multi('ads.platforms', '¿En qué plataformas quieres pautar?', [
        opt('META', 'Meta / Facebook / Instagram'), opt('GOOGLE', 'Google'), opt('TIKTOK', 'TikTok'), opt('LINKEDIN', 'LinkedIn'), opt('YOUTUBE', 'YouTube'), opt('RECOMENDACION', 'Necesito recomendación'), opt('OTRA', 'Otra')
      ], { required: true }),
      single('ads.accounts', '¿Ya tienes cuentas publicitarias activas?', [opt('SI', 'Sí'), opt('NO', 'No'), opt('NO_SEGURO', 'No estoy seguro')], { required: true }),
      q('ads.budget', '¿Tienes un presupuesto aproximado destinado exclusivamente a inversión en pauta?', 'money', { help: 'Este valor corresponde a inversión en medios y no necesariamente a los honorarios de gestión de Brain Studio.', allowUndefined: 'Aún no está definido' })
    ],
    catalog: { 'ads.platforms': { META: 'Administración de Meta Ads', GOOGLE: 'Administración de Google Ads', TIKTOK: null, LINKEDIN: null, YOUTUBE: 'Administración de Google Ads', RECOMENDACION: 'Configuración inicial de campaña', OTRA: null } }
  },
  EDITORIAL: {
    title: 'Editorial', questions: [
      multi('editorial.needs', '¿Qué necesitas desarrollar?', [
        opt('INFORME', 'Informe'), opt('REVISTA', 'Revista'), opt('LIBRO', 'Libro'), opt('CATALOGO', 'Catálogo'), opt('PRESENTACION', 'Presentación'), opt('INSTITUCIONAL', 'Documento institucional'), opt('MEMORIA', 'Memoria'), OTHER
      ], { required: true }),
      text('editorial.pages', '¿Cuántas páginas aproximadamente tendrá?', { placeholder: 'Ej. 40' }),
      single('editorial.content', '¿El contenido ya está listo?', [opt('SI', 'Sí'), opt('PARCIAL', 'Parcialmente'), opt('APOYO', 'Necesitamos apoyo para organizarlo o redactarlo'), opt('NO', 'Aún no tenemos el contenido')], { required: true })
    ],
    catalog: { 'editorial.needs': { INFORME: 'Informe corporativo hasta 60 páginas', REVISTA: 'Diseño editorial por página', LIBRO: 'Diseño editorial por página', CATALOGO: 'Catálogo digital de productos o servicios', PRESENTACION: 'Presentación corporativa', INSTITUCIONAL: 'Manual corporativo', MEMORIA: 'Informe corporativo hasta 60 páginas', OTRO: null } }
  },
  WEB: {
    title: 'Web', questions: [
      multi('web.needs', '¿Qué necesitas?', [
        opt('CORPORATIVA', 'Sitio web corporativo'), opt('LANDING', 'Landing page'), opt('ECOMMERCE', 'E-commerce'), opt('REDISENO', 'Rediseño web'), opt('ACTUALIZACION', 'Actualización'), opt('MANTENIMIENTO', 'Mantenimiento'), opt('UXUI', 'UX/UI'), OTHER
      ], { required: true }),
      single('web.hasSite', '¿Actualmente tienes página web?', YES_NO, { required: true }),
      q('web.url', 'Compártenos el enlace', 'url', { showIf: is('web.hasSite', 'SI'), placeholder: 'https://' }),
      multi('web.features', '¿Necesitas alguna funcionalidad específica?', [
        opt('FORMULARIOS', 'Formularios'), opt('WHATSAPP', 'WhatsApp'), opt('PAGOS', 'Pagos'), opt('RESERVAS', 'Reservas'), opt('CATALOGO', 'Catálogo'), opt('ECOMMERCE', 'E-commerce'),
        opt('BLOG', 'Blog'), opt('MULTIIDIOMA', 'Multidioma'), opt('INTEGRACIONES', 'Integraciones'), opt('OTRA', 'Otra'), opt('NO_SEGURO', 'No estoy seguro')
      ])
    ],
    catalog: {
      'web.needs': { CORPORATIVA: 'Web corporativa', LANDING: 'Landing page', ECOMMERCE: 'Tienda virtual - E commerce', REDISENO: 'Rediseño de sitio web', ACTUALIZACION: 'Actualización web básica', MANTENIMIENTO: 'Mantenimiento web mensual', UXUI: 'Diseño UX/UI para sitio web', OTRO: null },
      'web.features': { FORMULARIOS: 'Integración de formulario web', WHATSAPP: 'Integración de WhatsApp en sitio web', PAGOS: 'Integración de pasarela de pagos', RESERVAS: 'Sistema de reservas o citas', CATALOGO: 'Carga de productos en tienda virtual', ECOMMERCE: 'Tienda virtual - E commerce', BLOG: null, MULTIIDIOMA: null, INTEGRACIONES: 'Integración con servicios externos' }
    }
  },
  DESARROLLO: {
    title: 'Desarrollo', questions: [
      area('dev.problem', 'Describe el proceso, problema o necesidad que quieres resolver.', { required: true, rows: 5 }),
      text('dev.users', '¿Quién utilizaría la solución?', { placeholder: 'Ej. el equipo comercial, los clientes, toda la empresa' }),
      single('dev.integrations', '¿Necesitas conexión con otros sistemas o plataformas?', [opt('SI', 'Sí'), opt('NO', 'No'), opt('NO_SEGURO', 'No estoy seguro')], { required: true }),
      text('dev.integrationsDetail', '¿Con cuáles?', { showIf: is('dev.integrations', 'SI'), placeholder: 'Ej. CRM, facturación, WhatsApp, Google Workspace' })
    ],
    catalog: { 'dev.problem': { '*': 'Desarrollo e implementación de plataformas digitales a medida' }, 'dev.integrations': { SI: 'Integración con servicios externos' } }
  },
  MERCHANDISING_IMPRESION: {
    title: 'Merchandising e impresión', questions: [
      area('merch.items', '¿Qué necesitas producir?', { required: true, rows: 3, placeholder: 'Ej. 200 trípticos, 50 camisetas, señalética para el evento' }),
      text('merch.quantity', '¿Qué cantidad aproximada necesitas?', { placeholder: 'Ej. 150 unidades' }),
      single('merch.designs', '¿Ya cuentas con los diseños?', [opt('SI', 'Sí'), opt('NO', 'No'), opt('ALGUNOS', 'Tengo algunos elementos'), opt('DISENAR', 'También necesito que Brain Studio los diseñe')], { required: true })
    ],
    catalog: { 'merch.items': { '*': 'Impresión trípticos 150 unidades' }, 'merch.designs': { DISENAR: 'Diseño de merchandising', ALGUNOS: 'Diseño de merchandising' } }
  },
  NO_ESTOY_SEGURO: {
    title: 'Necesito asesoría', questions: [
      area('unsure.goal', 'No hay problema. Cuéntanos qué quieres lograr o qué necesitas resolver.', { required: true, rows: 5 })
    ],
    catalog: {}
  },
  OTRO: {
    title: 'Otro servicio', questions: [
      area('other.detail', 'Cuéntanos qué servicio necesitas.', { required: true, rows: 4 })
    ],
    catalog: {}
  }
});

const EVENT = {
  id: 'evento', title: '¿Tu proyecto está relacionado con un evento o activación?', eyebrow: 'Evento', intro: 'Un evento puede combinar diseño, audiovisual, comunicación, contenido y merchandising.',
  questions: [
    single('event.related', '¿Está relacionado con un evento o activación?', YES_NO, { required: true }),
    multi('event.needs', '¿Qué necesitas para el evento?', [
      opt('CONCEPTO', 'Concepto creativo'), opt('LINEA_GRAFICA', 'Línea gráfica'), opt('PIEZAS', 'Piezas gráficas'), opt('SENALETICA', 'Señalética'), opt('FOTOGRAFIA', 'Fotografía'), opt('VIDEO', 'Video'),
      opt('COBERTURA', 'Cobertura'), opt('REDES', 'Redes sociales'), opt('ACTIVACION', 'Activación'), opt('MERCHANDISING', 'Merchandising'), opt('POP', 'Material POP'), opt('CAMPANA', 'Campaña de comunicación'), OTHER
    ], { showIf: is('event.related', 'SI'), required: true })
  ]
};

// Names and one-line descriptions as published on amc.brainstudioagencia.com (September 2026). Prices stay out on purpose.
export const AMC_PLANS = Object.freeze([
  { value: 'START', label: 'AMC Start', description: 'Para emprendimientos que necesitan construir una presencia profesional desde el comienzo: marca emprendedor, marketing básico, landing page y Meta Ads.' },
  { value: 'BOOST', label: 'AMC Boost', description: 'Para negocios que no necesitan tanto desarrollo de marca pero sí contenidos más sólidos: marca emprendedor, marketing estándar, landing page y Meta Ads.' },
  { value: 'GROWTH', label: 'AMC Growth', description: 'Para negocios que quieren una identidad más completa, contenido constante y web corporativa: marca estándar, marketing estándar, web corporativa y Meta Ads.' },
  { value: 'IMPACT', label: 'AMC Impact', description: 'Para empresas que necesitan presencia robusta, más contenidos, comercio electrónico y pauta en varias plataformas: marca pro, marketing pro, e-commerce, Meta + Google Ads.' },
  { value: 'RECOMENDACION', label: 'No estoy seguro / quiero recomendación', description: 'Cuéntanos lo que buscas y te proponemos la alternativa que mejor encaje.' }
]);

export const AMC_SUMMARY = Object.freeze({
  what: 'La tríada AMC conecta estrategia, marca, contenido, desarrollo web y pauta digital en un ecosistema coherente y preparado para crecer. Durante 3 meses avanzamos contigo por tres momentos:',
  moments: [
    { name: 'Arranque', text: 'Construimos o fortalecemos las bases de tu marca.' },
    { name: 'Conversión', text: 'Activamos tu presencia digital y desarrollamos tu ecosistema.' },
    { name: 'Maduración', text: 'Activamos la pauta digital para atraer público, generar resultados y crecer.' }
  ],
  closing: 'No importa si empiezas desde cero o si ya tienes marca: partimos de lo que tienes y potenciamos lo que necesitas.'
});

const AMC = {
  id: 'amc', title: '¿Buscas una solución más integral?', eyebrow: 'Estrategia AMC',
  intro: 'Además de nuestros servicios específicos, en Brain Studio contamos con la estrategia AMC, diseñada para marcas que quieren integrar comunicación, marketing, contenido y crecimiento en una misma estrategia.',
  summary: AMC_SUMMARY,
  link: { label: 'Ver la estrategia AMC completa', href: 'https://amc.brainstudioagencia.com/' },
  questions: [
    single('amc.interest', '¿Te interesa que tu propuesta considere nuestra estrategia AMC?', [
      opt('SI', 'Sí, quiero que mi propuesta considere AMC'), opt('CONOCER', 'Quiero conocer primero las opciones'), opt('NO', 'No por ahora'), opt('RECOMENDACION', 'No estoy seguro, quiero una recomendación')
    ], { required: true }),
    single('amc.plan', '¿Qué alternativa AMC te interesa?', AMC_PLANS, { showIf: is('amc.interest', 'SI', 'CONOCER'), required: true }),
    text('amc.why', '¿Qué fue lo que más te interesó de la estrategia AMC?', { showIf: is('amc.interest', 'SI', 'CONOCER') })
  ]
};

const BUDGET = {
  id: 'presupuesto', title: 'Presupuesto', eyebrow: 'Presupuesto', intro: 'Nos ayuda a proponerte algo realista. Un presupuesto mensual y uno por proyecto son cosas muy distintas.',
  questions: [
    single('budget.has', '¿Tienes un presupuesto aproximado para este proyecto?', [opt('SI', 'Sí'), opt('NO', 'No'), opt('NO_DEFINIDO', 'Aún no está definido'), opt('RECOMENDACION', 'Quiero recibir una recomendación')], { required: true }),
    q('budget.amount', '¿Cuál es el presupuesto aproximado?', 'money', { showIf: is('budget.has', 'SI'), required: true }),
    single('budget.currency', '¿En qué moneda?', [opt('COP', 'COP'), opt('USD', 'USD'), opt('EUR', 'EUR'), opt('OTRA', 'Otra')], { showIf: is('budget.has', 'SI'), required: true }),
    single('budget.scope', 'Ese presupuesto corresponde a:', [
      opt('PROYECTO', 'Un proyecto / pago único'), opt('MENSUAL', 'Presupuesto mensual'), opt('ANUAL', 'Presupuesto anual'), opt('CAMPANA', 'Una campaña o etapa específica'), OTHER, opt('NO_SEGURO', 'No estoy seguro')
    ], { showIf: is('budget.has', 'SI'), required: true }),
    single('budget.adsIncluded', 'Si tu proyecto incluye pauta digital, ¿la inversión en medios está incluida dentro del presupuesto anterior?', [
      opt('SI', 'Sí'), opt('NO', 'No'), opt('NO_APLICA', 'No aplica'), opt('NO_DEFINIDO', 'Aún no está definido')
    ], { showIf: is('budget.has', 'SI') }),
    q('budget.adsExtra', '¿Cuál sería aproximadamente el presupuesto adicional destinado a pauta?', 'money', { showIf: answers => answers['budget.has'] === 'SI' && answers['budget.adsIncluded'] === 'NO' })
  ]
};

const TIMING = {
  id: 'momento', title: 'Momento de contratación', eyebrow: 'Momento', intro: 'Para acompañarte al ritmo que necesitas.',
  questions: [
    single('stage', '¿En qué etapa estás actualmente?', [
      opt('EXPLORANDO', 'Estoy explorando posibilidades'), opt('BUSCANDO', 'Estoy buscando proveedores'), opt('COMPARANDO', 'Estoy comparando propuestas'),
      opt('APROBADO', 'El proyecto ya está aprobado internamente'), opt('PRONTO', 'Necesito contratar pronto'), opt('PRECIOS', 'Solo quiero conocer precios por ahora')
    ], { required: true }),
    single('decision.others', '¿Hay otras personas que participen en la decisión de contratación?', YES_NO, { required: true }),
    text('decision.who', '¿Quiénes participan?', { showIf: is('decision.others', 'SI'), placeholder: 'Ej. gerencia general, área financiera' }),
    single('proposal.when', '¿Cuándo te gustaría recibir nuestra propuesta?', [
      opt('ASAP', 'Lo antes posible'), opt('TRES_DIAS', 'En los próximos 3 días hábiles'), opt('ESTA_SEMANA', 'Durante esta semana'), opt('DOS_SEMANAS', 'En las próximas 2 semanas'), opt('SIN_FECHA', 'No tengo una fecha específica')
    ], { required: true })
  ]
};

const SOURCE = {
  id: 'origen', title: '¿Cómo llegaste a Brain Studio?', eyebrow: 'Último paso', intro: 'Ya casi. Esto nos ayuda a saber qué canales funcionan.',
  questions: [
    single('source', '¿Cómo nos conociste?', [
      opt('REFERIDO', 'Referido / recomendación'), opt('CLIENTE_ACTUAL', 'Soy cliente actual'), opt('CLIENTE_ANTERIOR', 'Fui cliente anteriormente'), opt('INSTAGRAM', 'Instagram'), opt('LINKEDIN', 'LinkedIn'),
      opt('GOOGLE', 'Google'), opt('WEB', 'Página web'), opt('WHATSAPP', 'WhatsApp'), opt('EVENTO', 'Evento'), opt('CONVOCATORIA', 'Convocatoria'), opt('FRANCISCO', 'Contacto directo con Francisco'), OTHER
    ], { required: true }),
    single('workedBefore', '¿Has trabajado anteriormente con Brain Studio?', YES_NO, { required: true }),
    area('extra', '¿Hay algo más que consideres importante que sepamos antes de preparar la propuesta?', { rows: 3 })
  ]
};

export const WELCOME = Object.freeze({
  title: 'Cuéntanos qué necesitas y construyamos algo juntos',
  paragraphs: [
    'Somos Brain Studio, una agencia colombiana de comunicación, creatividad y marketing 360°, con más de seis años de experiencia acompañando marcas, empresas y organizaciones. Integramos estrategia, creatividad, contenido, diseño, tecnología y ejecución para construir soluciones de comunicación coherentes y conectadas con los objetivos de cada proyecto.',
    'Trabajamos desde necesidades específicas hasta proyectos integrales de comunicación, marketing, branding, producción audiovisual, desarrollo digital y experiencias.'
  ],
  link: { label: 'Conoce más sobre Brain Studio', href: 'https://brainstudioagencia.com' },
  closing: 'Completa esta información para que podamos conocer mejor tu proyecto y preparar una propuesta acorde con lo que necesitas.',
  estimatedMinutes: 5
});

export const THANKS = Object.freeze({
  title: '¡Gracias por compartirnos tu proyecto!',
  body: 'Nuestro equipo revisará la información y se pondrá en contacto contigo para validar los detalles necesarios y avanzar con la propuesta.',
  signature: 'Brain Studio',
  tagline: 'Comunicación, creatividad y marketing 360° para marcas que quieren trascender.'
});

const FIXED_BEFORE = [CONTACT, NEED, SERVICES];
const FIXED_AFTER = [EVENT, AMC, BUDGET, TIMING, SOURCE];

// ---- runtime -------------------------------------------------------------------------------------------

export const selectedServices = answers => (Array.isArray(answers.services) ? answers.services.filter(value => SERVICE_BLOCKS[value]) : []);

/** Ordered steps for the current answers: fixed steps plus one block per selected service. */
export const visibleSteps = (answers = {}) => {
  const services = selectedServices(answers);
  const unsureOnly = services.includes('NO_ESTOY_SEGURO');
  const dynamic = (unsureOnly ? ['NO_ESTOY_SEGURO'] : services).map(value => ({
    id: `servicio:${value}`, service: value, title: SERVICE_BLOCKS[value].title, eyebrow: 'Sobre este servicio', questions: SERVICE_BLOCKS[value].questions
  }));
  // "No estoy seguro" skips the service detail of everything else but still asks event, AMC, budget, timing and source.
  return [...FIXED_BEFORE, ...dynamic, ...FIXED_AFTER];
};

export const visibleQuestions = (step, answers = {}) => step.questions.filter(question => !question.showIf || question.showIf(answers));

const filled = value => {
  if (value === null || value === undefined) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') return Object.values(value).some(filled);
  return String(value).trim() !== '';
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE = /[0-9]{7,}/;

/** { questionId: message } for the questions of one step. Empty object when the step is complete. */
export const validateStep = (step, answers = {}) => {
  const errors = {};
  for (const question of visibleQuestions(step, answers)) {
    const value = answers[question.id];
    if (question.required && !filled(value) && !(question.type === 'money' && value?.undefined)) {
      errors[question.id] = question.type === 'multi' ? 'Elige al menos una opción.' : 'Este campo es necesario para continuar.';
      continue;
    }
    if (!filled(value)) continue;
    if (question.type === 'email' && !EMAIL.test(String(value).trim())) errors[question.id] = 'Revisa el formato del correo.';
    if (question.type === 'phone' && !PHONE.test(String(value).replace(/\D/g, ''))) errors[question.id] = 'Incluye un número de al menos 7 dígitos.';
    if (question.type === 'url' && !/^(https?:\/\/)?[\w.-]+\.[a-z]{2,}([/?#].*)?$/i.test(String(value).trim())) errors[question.id] = 'Escribe una dirección web o un usuario de redes válido.';
  }
  return errors;
};

/** Progress 0..1 over the visible steps; the welcome screen counts as 0 and the thanks screen as 1. */
export const progressFor = (answers, stepIndex) => {
  const total = visibleSteps(answers).length;
  return Math.max(0, Math.min(1, stepIndex / total));
};

export const encouragement = ratio => {
  if (ratio >= 0.999) return '¡Listo!';
  if (ratio >= 0.75) return 'Último tramo';
  if (ratio >= 0.5) return 'Vas por la mitad';
  if (ratio >= 0.25) return 'Buen ritmo';
  return 'Empecemos';
};

// ---- mapping to the CRM and to the quotation catalog ---------------------------------------------------------

const labelOf = (options, value) => options.find(option => option.value === value)?.label ?? value;
const questionById = new Map([...FIXED_BEFORE, ...FIXED_AFTER, ...Object.values(SERVICE_BLOCKS)].flatMap(step => step.questions).map(question => [question.id, question]));

export const answerLabel = (id, value) => {
  const question = questionById.get(id);
  if (!question) return value;
  if (Array.isArray(value)) return value.map(item => labelOf(question.options || [], item)).join(', ');
  if (question.options) return labelOf(question.options, value);
  return value;
};

const SOURCE_TO_ORIGIN = {
  REFERIDO: 'REFERIDO', CLIENTE_ACTUAL: 'CLIENTE_ANTERIOR', CLIENTE_ANTERIOR: 'CLIENTE_ANTERIOR', INSTAGRAM: 'FORMULARIO', LINKEDIN: 'LINKEDIN', GOOGLE: 'FORMULARIO',
  WEB: 'FORMULARIO', WHATSAPP: 'WHATSAPP', EVENTO: 'ALIADO', CONVOCATORIA: 'CONVOCATORIA', FRANCISCO: 'CONTACTO_DIRECTO', OTRO: 'FORMULARIO'
};

const HIGH_PRIORITY_STAGES = new Set(['APROBADO', 'PRONTO']);
const LOW_PRIORITY_STAGES = new Set(['PRECIOS', 'EXPLORANDO']);

const money = value => {
  if (!value || value.undefined) return null;
  // People type "8.000.000" or "8,000,000": separators are noise, amounts are whole units.
  const number = Number(String(value.amount ?? value).replace(/[^0-9]/g, ''));
  return Number.isFinite(number) && number > 0 ? number : null;
};

/** Suggested quotation lines from the answers: catalog names when they exist, custom lines otherwise. */
export const suggestQuotationItems = (answers = {}) => {
  const lines = [];
  const seen = new Set();
  const push = (category, name, detail, custom = false) => {
    const key = `${category}:${name}`;
    if (seen.has(key)) return;
    seen.add(key);
    lines.push({ category, name, custom, detail: detail || null, quantity: 1 });
  };
  for (const service of selectedServices(answers)) {
    const block = SERVICE_BLOCKS[service];
    for (const [questionId, mapping] of Object.entries(block.catalog || {})) {
      const value = answers[questionId];
      if (mapping['*'] !== undefined) {
        if (filled(value)) push(service, mapping['*'], typeof value === 'string' ? value.slice(0, 140) : null);
        continue;
      }
      const values = Array.isArray(value) ? value : (value ? [value] : []);
      for (const chosen of values) {
        if (!(chosen in mapping)) continue;
        const catalogName = mapping[chosen];
        if (catalogName) push(service, catalogName, answerLabel(questionId, chosen));
        else push(service, answerLabel(questionId, chosen), 'Sin equivalente en el catálogo: línea personalizada.', true);
      }
    }
  }
  if (answers['event.related'] === 'SI') push('MARKETING', 'Cobertura digital de evento', answerLabel('event.needs', answers['event.needs'] || []));
  return lines;
};

const nextBusinessDay = (from = new Date()) => {
  const date = new Date(from);
  do { date.setUTCDate(date.getUTCDate() + 1); } while ([0, 6].includes(date.getUTCDay()));
  return date.toISOString().slice(0, 10);
};

/** The CRM lead the API creates from a submission, plus the request record kept with it. */
export const buildLeadDraft = (answers = {}, { receivedAt = new Date() } = {}) => {
  const services = selectedServices(answers);
  const serviceLabels = services.map(value => labelOf(SERVICE_CATEGORIES, value));
  const budget = answers['budget.has'] === 'SI' ? money(answers['budget.amount']) : null;
  const priority = HIGH_PRIORITY_STAGES.has(answers.stage) || answers.startWhen === 'ASAP' ? 'ALTA' : LOW_PRIORITY_STAGES.has(answers.stage) ? 'BAJA' : 'MEDIA';
  const summary = [
    `Necesidad: ${answers.need || '—'}`,
    `Servicios: ${serviceLabels.join(', ') || '—'}`,
    answers.startWhen ? `Inicio deseado: ${answerLabel('startWhen', answers.startWhen)}` : null,
    answers['hasKeyDate'] === 'SI' ? `Fecha clave: ${answers.keyDate || '—'} · ${answers.keyDateNote || ''}`.trim() : null,
    answers.stage ? `Etapa de contratación: ${answerLabel('stage', answers.stage)}` : null,
    answers['proposal.when'] ? `Propuesta esperada: ${answerLabel('proposal.when', answers['proposal.when'])}` : null,
    answers['budget.has'] === 'SI' && budget ? `Presupuesto: ${budget.toLocaleString('es-CO')} ${answers['budget.currency'] || 'COP'} (${answerLabel('budget.scope', answers['budget.scope'])})` : answers['budget.has'] ? `Presupuesto: ${answerLabel('budget.has', answers['budget.has'])}` : null,
    answers['amc.interest'] ? `AMC: ${answerLabel('amc.interest', answers['amc.interest'])}${answers['amc.plan'] ? ` · ${answerLabel('amc.plan', answers['amc.plan'])}` : ''}` : null,
    answers.extra ? `Nota del cliente: ${answers.extra}` : null
  ].filter(Boolean).join('\n');

  return {
    lead: {
      origin: SOURCE_TO_ORIGIN[answers.source] || 'FORMULARIO',
      originDetail: `Formulario de solicitud comercial · ${answerLabel('source', answers.source || 'OTRO')}`,
      contactName: answers.contactName?.trim() || null,
      company: answers.company?.trim() || null,
      jobTitle: answers.jobTitle?.trim() || null,
      email: answers.email?.trim().toLowerCase() || null,
      phone: answers.phone?.trim() || null,
      linkedinUrl: answers.website?.trim() || null,
      serviceInterest: serviceLabels.join(' + ') || null,
      language: 'Español',
      allowedContact: 'Correo y WhatsApp indicados en el formulario',
      priority,
      publishedAt: null,
      callDeadlineAt: answers['hasKeyDate'] === 'SI' && answers.keyDate ? answers.keyDate : null,
      quotedValue: budget && (answers['budget.currency'] === 'COP' || answers['budget.currency'] === 'USD') ? budget : null,
      currency: ['COP', 'USD'].includes(answers['budget.currency']) ? answers['budget.currency'] : 'COP',
      nextAction: 'Revisar la solicitud y hacer el primer contacto (llamada o WhatsApp).',
      nextFollowUpAt: nextBusinessDay(receivedAt),
      notes: summary
    },
    request: {
      version: 1,
      receivedAt: receivedAt.toISOString(),
      answers,
      services,
      suggestedItems: suggestQuotationItems(answers),
      location: answers.location || null,
      workedBefore: answers.workedBefore === 'SI'
    }
  };
};

export const ALL_STEPS_FOR_REFERENCE = Object.freeze({ FIXED_BEFORE, FIXED_AFTER });
