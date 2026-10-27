// La agencia inventada de la versión «Demo» (Rodny, 26 de octubre de 2026): lo que se le enseña a un
// cliente sin que sea Brain Studio. Todo aquí es ficción escrita desde cero —personas, cuentas, cifras,
// textos— y nunca una copia anonimizada de producción: anonimizar deja rastros (montos, fechas, formatos
// de piezas que identifican a un cliente). `tests/demoSeed.test.js` vigila que no entre ningún nombre real.
//
// Es un módulo puro: recibe la fecha y devuelve datos relativos a ella, para que la demo se vea viva el
// día que se enseñe (piezas de este mes, tareas que vencen hoy, un seguimiento comercial atrasado).
// Quien escribe en la base es `scripts/seed-demo.js`.

export const DEMO_AGENCY = Object.freeze({
    name: 'Agencia Faro',
    domain: 'agenciafaro.test',
    city: 'Bogotá',
    // Contraseña de todas las cuentas de la demo. En Railway se cambia con la variable `DEMO_PASSWORD`,
    // porque el enlace de la demo es público y Bria gasta créditos de OpenAI.
    defaultPassword: 'Faro.Demo.2026'
});

export const DEMO_TEAM = Object.freeze([
    { key: 'valentina', name: 'Valentina Ruiz', role: 'Directora', accountRole: 'ADMIN', email: 'valentina@agenciafaro.test', financialRole: 'ADMIN', highlightedAction: 'Lleva la relación con los clientes grandes y revisa toda parrilla antes de enviarla.' },
    { key: 'mateo', name: 'Mateo Salgado', role: 'Project Manager', accountRole: 'PROJECT_MANAGER', email: 'mateo@agenciafaro.test', highlightedAction: 'Coordina producción y entrega de las parrillas de cada mes.' },
    { key: 'laura', name: 'Laura Pineda', role: 'Community Manager', accountRole: 'EDITOR', email: 'laura@agenciafaro.test', highlightedAction: 'Escribe guiones y textos de publicación; responde a los comentarios de los clientes.' },
    { key: 'juliana', name: 'Juliana Castro', role: 'Community Manager', accountRole: 'EDITOR', email: 'juliana@agenciafaro.test', highlightedAction: 'Lleva las cuentas de alimentos y bebidas; graba historias en los locales.' },
    { key: 'andres', name: 'Andrés Cortés', role: 'Diseñador gráfico', accountRole: 'EDITOR', email: 'andres@agenciafaro.test', highlightedAction: 'Diseña carruseles y posts; mantiene las plantillas de cada marca.' },
    { key: 'sofia', name: 'Sofía Herrera', role: 'Productora audiovisual', accountRole: 'EDITOR', email: 'sofia@agenciafaro.test', highlightedAction: 'Graba y edita los reels; cuida que cada pieza salga con portada.' },
    { key: 'daniel', name: 'Daniel Mora', role: 'Ejecutivo comercial', accountRole: 'EDITOR', email: 'daniel@agenciafaro.test', modules: ['crm', 'cotizaciones', 'clientes'], highlightedAction: 'Atiende las solicitudes nuevas y hace seguimiento a las propuestas.' },
    { key: 'natalia', name: 'Natalia Vergara', role: 'Contadora', accountRole: 'EDITOR', email: 'natalia@agenciafaro.test', modules: ['financiero', 'clientes'], financialRole: 'EDITOR', highlightedAction: 'Registra movimientos, emite cuentas de cobro y lleva la cartera.' }
]);

// Qué publica cada cuenta: con esto se escriben las piezas del mes y los textos tienen sentido.
export const DEMO_CLIENTS = Object.freeze([
    {
        key: 'cafe-altura', name: 'Café Altura', slug: 'cafe-altura', legalName: 'CAFÉ ALTURA S.A.S.', documentType: 'NIT', documentNumber: '900111222-3',
        contactName: 'Marcela Díaz', email: 'marcela@cafealtura.test', phone: '+57 300 000 0001', city: 'Bogotá', country: 'Colombia',
        description: 'Cafetería de especialidad con dos sedes en Chapinero. Tuestan su propio café.', instagramUrl: 'https://instagram.com/cafealtura.demo', complexity: 'MEDIA',
        pm: 'mateo', cm: 'juliana', monthlyFee: 2800000,
        contract: { deliverables: [{ format: 'Reel', quantity: 4 }, { format: 'Carrusel', quantity: 4 }, { format: 'Post', quantity: 4 }], storiesPerWeek: 3, productionDays: 1, monthlyReport: true },
        objective: 'Llevar gente a la sede nueva de la calle 70 y vender el tostado del mes.',
        topics: ['el tostado del mes', 'cómo preparar un V60 en casa', 'la sede nueva de la calle 70', 'el brunch de los domingos', 'detrás de cámaras del tostado', 'latte art del equipo', 'café de origen Huila', 'el combo de la tarde'],
        observations: ['La dueña aprueba rápido pero pide ver el video antes del texto: enviarle primero la pieza.', 'No usar la palabra «gourmet» en ningún texto; la marca la rechazó en agosto.']
    },
    {
        key: 'clinica-sonria', name: 'Clínica Sonría', slug: 'clinica-sonria', legalName: 'CLÍNICA ODONTOLÓGICA SONRÍA LTDA.', documentType: 'NIT', documentNumber: '800333444-5',
        contactName: 'Dr. Julián Restrepo', email: 'direccion@clinicasonria.test', phone: '+57 300 000 0002', city: 'Medellín', country: 'Colombia',
        description: 'Clínica odontológica familiar. Ortodoncia, blanqueamiento y diseño de sonrisa.', instagramUrl: 'https://instagram.com/clinicasonria.demo', complexity: 'MEDIA',
        pm: 'mateo', cm: 'laura', monthlyFee: 2200000,
        contract: { deliverables: [{ format: 'Reel', quantity: 2 }, { format: 'Carrusel', quantity: 4 }, { format: 'Post', quantity: 2 }], storiesPerWeek: 2, productionDays: 0, monthlyReport: true },
        objective: 'Agendar valoraciones gratuitas de ortodoncia durante el mes.',
        topics: ['mitos del blanqueamiento', 'cuándo llevar a los niños al odontólogo', 'valoración gratis de ortodoncia', 'antes y después de un diseño de sonrisa', 'qué pasa en la primera cita', 'cuidados de los brackets', 'el equipo de la clínica', 'promoción de limpieza'],
        observations: ['Toda pieza con un antes y después necesita el consentimiento firmado del paciente; lo guarda la clínica.']
    },
    {
        key: 'gimnasio-vital', name: 'Gimnasio Vital', slug: 'gimnasio-vital', legalName: 'VITAL FITNESS S.A.S.', documentType: 'NIT', documentNumber: '901555666-7',
        contactName: 'Andrea Quintero', email: 'andrea@gimnasiovital.test', phone: '+57 300 000 0003', city: 'Cali', country: 'Colombia',
        description: 'Gimnasio de barrio con clases grupales y entrenamiento funcional. Tres sedes.', instagramUrl: 'https://instagram.com/gimnasiovital.demo', complexity: 'ALTA',
        pm: 'valentina', cm: 'laura', monthlyFee: 3100000,
        contract: { deliverables: [{ format: 'Reel', quantity: 6 }, { format: 'Post', quantity: 4 }], storiesPerWeek: 4, productionDays: 2, monthlyReport: true },
        objective: 'Llenar las clases de las 6 de la mañana con el plan trimestral.',
        topics: ['rutina de 15 minutos para empezar el día', 'el plan trimestral', 'clase de funcional de las 6 a. m.', 'testimonio de una alumna', 'cómo elegir el peso correcto', 'reto de 30 días', 'la sede del sur', 'día de puertas abiertas', 'estiramientos después de entrenar', 'nutrición básica'],
        observations: ['La gerente quiere ver el calendario del mes completo antes del día 3; si no, se atrasa la aprobación de todo.', 'Las grabaciones son los martes a las 5:30 a. m. en la sede norte.']
    },
    {
        key: 'hotel-mar-azul', name: 'Hotel Mar Azul', slug: 'hotel-mar-azul', legalName: 'INVERSIONES MAR AZUL S.A.', documentType: 'NIT', documentNumber: '890777888-9',
        contactName: 'Ricardo Peña', email: 'mercadeo@hotelmarazul.test', phone: '+57 300 000 0004', city: 'Santa Marta', country: 'Colombia',
        description: 'Hotel boutique frente al mar, 24 habitaciones. Público colombiano y europeo.', instagramUrl: 'https://instagram.com/hotelmarazul.demo', complexity: 'ALTA',
        pm: 'mateo', cm: 'laura', monthlyFee: 3500000,
        contract: { deliverables: [{ format: 'Reel', quantity: 4 }, { format: 'Carrusel', quantity: 2 }, { format: 'Post', quantity: 4 }], storiesPerWeek: 3, productionDays: 1, monthlyReport: true },
        objective: 'Vender la temporada de fin de año con reservas directas, sin intermediarios.',
        topics: ['amanecer desde la terraza', 'la tarifa de fin de año', 'el desayuno frente al mar', 'tour a la Sierra', 'una noche en la suite', 'reservas directas con descuento', 'recomendaciones de restaurantes', 'la piscina al atardecer', 'cómo llegar desde el aeropuerto', 'historia del hotel'],
        observations: ['Las piezas van en español y en inglés: el texto en inglés lo revisa el hotel.']
    },
    {
        key: 'panaderia-la-espiga', name: 'Panadería La Espiga', slug: 'panaderia-la-espiga', legalName: 'PANADERÍA LA ESPIGA S.A.S.', documentType: 'NIT', documentNumber: '901999000-1',
        contactName: 'Don Álvaro Mejía', email: 'laespiga@panaderia.test', phone: '+57 300 000 0005', city: 'Bogotá', country: 'Colombia',
        description: 'Panadería de barrio de toda la vida. Pan de masa madre y pasteles por encargo.', instagramUrl: 'https://instagram.com/laespiga.demo', complexity: 'BAJA',
        pm: 'valentina', cm: 'juliana', monthlyFee: 1600000,
        contract: { deliverables: [{ format: 'Reel', quantity: 2 }, { format: 'Post', quantity: 6 }], storiesPerWeek: 2, productionDays: 0, monthlyReport: false },
        objective: 'Que el barrio sepa que ahora toman pedidos de tortas por WhatsApp.',
        topics: ['pan de masa madre recién salido', 'tortas por encargo', 'el croissant de almendras', 'pedidos por WhatsApp', 'el horno de las 5 a. m.', 'pan para el desayuno', 'postres del fin de semana', 'galletas de la casa'],
        observations: ['Don Álvaro no usa correo: todo por WhatsApp y con llamada si es urgente.']
    },
    {
        key: 'inmobiliaria-horizonte', name: 'Inmobiliaria Horizonte', slug: 'inmobiliaria-horizonte', legalName: 'HORIZONTE BIENES RAÍCES S.A.S.', documentType: 'NIT', documentNumber: '900222333-4',
        contactName: 'Paula Giraldo', email: 'paula@horizonte.test', phone: '+57 300 000 0006', city: 'Barranquilla', country: 'Colombia',
        description: 'Inmobiliaria de vivienda nueva. Contrató página web y campaña de pauta, sin parrilla.', complexity: 'MEDIA',
        pm: 'mateo', cm: null, monthlyFee: 4000000,
        contract: { serviceType: 'SERVICIOS', deliverables: [], storiesPerWeek: 0, productionDays: 0, monthlyReport: true },
        objective: null, topics: [],
        observations: ['Proyecto de página web en curso: entrega de la primera versión a fin de mes.']
    },
    {
        key: 'taller-rueda-libre', name: 'Taller Rueda Libre', slug: 'taller-rueda-libre', legalName: 'TALLER RUEDA LIBRE', documentType: 'CC', documentNumber: '79000000',
        contactName: 'Esteban Rojas', email: 'ruedalibre@taller.test', phone: '+57 300 000 0007', city: 'Bogotá', country: 'Colombia',
        description: 'Taller de bicicletas. Parrilla en pausa mientras remodelan el local.', instagramUrl: 'https://instagram.com/ruedalibre.demo', complexity: 'BAJA',
        pm: 'mateo', cm: 'juliana', monthlyFee: 1200000,
        contract: { status: 'STAND_BY', standBySince: 'LAST_MONTH', deliverables: [{ format: 'Reel', quantity: 2 }, { format: 'Post', quantity: 4 }], storiesPerWeek: 1, productionDays: 0, monthlyReport: false },
        objective: null, topics: [],
        observations: ['En stand by desde el mes pasado por remodelación; retoman en enero.']
    }
]);

// Ritmo de publicación: en qué días del mes caen las piezas de cada formato. Se reparten para que ningún
// día lleve dos piezas de la misma cuenta y el mes se vea completo en el calendario.
const PUBLISH_DAYS = [2, 4, 6, 9, 11, 13, 16, 18, 20, 23, 25, 27];
const PUBLISH_TIMES = ['09:00', '12:30', '18:00'];
// Solo dos cuentas llevan piezas atrasadas (fecha pasada sin publicar): así el semáforo de Operación
// tiene rojos que explicar sin que toda la agencia parezca en llamas.
const LAGGARDS = new Set(['hotel-mar-azul', 'gimnasio-vital']);

const copyFor = (format, topic, client) => {
    if (format === 'Reel' || format === 'Video') {
        return `ESCENA 1: plano cerrado de ${topic} con luz natural.\nVOZ: «En ${client.name} ${topic} tiene su momento.»\nESCENA 2: equipo en acción, música suave.\nCIERRE: logo y llamado a la acción en pantalla.`;
    }
    if (format === 'Carrusel') {
        return `Portada: «${topic[0].toUpperCase()}${topic.slice(1)}».\nSlide 2–4: tres ideas cortas, una por slide, con foto propia.\nSlide 5: cierre con el llamado a la acción.`;
    }
    if (format === 'Historia') return `Historia de 15 s sobre ${topic}; sticker de pregunta al final.`;
    return `Foto principal de ${topic}; texto corto encima, en la tipografía de la marca.`;
};

const captionFor = (topic, client) => `${topic[0].toUpperCase()}${topic.slice(1)}: así se vive en ${client.name}. Escríbenos por mensaje directo y te contamos más.\n\n#${client.slug.replace(/-/g, '')} #${client.city.toLowerCase().replace(/\s+/g, '')}`;

/** Las piezas de un mes para una cuenta: cada formato las veces que dice el contrato, repartidas por el mes. */
const piecesOf = (client, { year, month, today, previous = false, next = false }) => {
    const formats = client.contract.deliverables.flatMap(({ format, quantity }) => Array.from({ length: quantity }, () => format));
    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
    // Cada cuenta parte de un punto distinto del reparto para que no todas se vean iguales en el calendario.
    const offset = DEMO_CLIENTS.findIndex((c) => c.key === client.key);
    return formats.map((format, index) => {
        const day = Math.min(PUBLISH_DAYS[index % PUBLISH_DAYS.length] + Math.floor(index / PUBLISH_DAYS.length), daysInMonth);
        const topic = client.topics[index % client.topics.length];
        const k = index + offset;
        // «Programado» no aparece: lo pone solo la cola de Meta y aquí no hay cola. Entre lo ya pasado se cuela
        // alguna pieza atrasada (en revisión o devuelta) para que el semáforo de Operación tenga algo que decir.
        let status;
        if (next) status = k % 3 === 2 ? 'EN_REVISION' : 'BORRADOR';
        else if (previous) status = 'PUBLICADO';
        else if (day < today - 1) status = LAGGARDS.has(client.key) && k % 5 === 4 ? (k % 2 ? 'DEVUELTO' : 'EN_REVISION') : 'PUBLICADO';
        else if (day <= today + 1) status = k % 2 ? 'REALIZADO' : 'APROBADO';
        else if (day <= today + 6) status = k % 4 === 1 ? 'DEVUELTO' : k % 2 ? 'REALIZADO' : 'EN_REVISION';
        else status = k % 3 === 2 ? 'EN_REVISION' : 'BORRADOR';
        return {
            objective: client.objective, format, day, time: PUBLISH_TIMES[index % PUBLISH_TIMES.length], status,
            copyText: copyFor(format, topic, client), captionText: captionFor(topic, client),
            internalNotes: index % 5 === 0 ? 'Usar las fotos de la última grabación, no las del banco de imágenes.' : null,
            comments: status === 'DEVUELTO' ? 'Cliente: me gusta la idea, pero el texto está muy largo. ¿Lo dejamos en dos líneas?' : null
        };
    });
};

const TASK_TEMPLATES = Object.freeze([
    // Cerradas con tiempo medido: dan material a Ritmo, Logros e historial. `minutes` es el tiempo de trabajo.
    { key: 't1', title: 'Reel del tostado del mes', client: 'cafe-altura', assignee: 'sofia', creator: 'mateo', status: 'REALIZADA', completedDaysAgo: 1, minutes: 190, category: 'Producción Audiovisual', complexity: 'MEDIA', priority: 'NORMAL', format: 'Reel' },
    { key: 't2', title: 'Carrusel: mitos del blanqueamiento', client: 'clinica-sonria', assignee: 'andres', creator: 'mateo', status: 'REALIZADA', completedDaysAgo: 1, minutes: 85, category: 'Creativo & Diseño', complexity: 'BAJA', priority: 'NORMAL', format: 'Carrusel' },
    { key: 't3', title: 'Guiones de la semana · Gimnasio Vital', client: 'gimnasio-vital', assignee: 'laura', creator: 'valentina', status: 'REALIZADA', completedDaysAgo: 2, minutes: 140, category: 'Creación de Contenido', complexity: 'MEDIA', priority: 'ALTA' },
    { key: 't4', title: 'Reel: amanecer desde la terraza', client: 'hotel-mar-azul', assignee: 'sofia', creator: 'mateo', status: 'REALIZADA', completedDaysAgo: 3, minutes: 240, category: 'Producción Audiovisual', complexity: 'ALTA', priority: 'NORMAL', format: 'Reel' },
    { key: 't5', title: 'Post: pan de masa madre', client: 'panaderia-la-espiga', assignee: 'andres', creator: 'valentina', status: 'REALIZADA', completedDaysAgo: 3, minutes: 40, category: 'Creativo & Diseño', complexity: 'BAJA', priority: 'NORMAL', format: 'Post' },
    { key: 't6', title: 'Informe de septiembre · Café Altura', client: 'cafe-altura', assignee: 'juliana', creator: 'mateo', status: 'REALIZADA', completedDaysAgo: 5, minutes: 110, category: 'Estratégico', complexity: 'MEDIA', priority: 'ALTA' },
    { key: 't7', title: 'Reel: clase de funcional de las 6 a. m.', client: 'gimnasio-vital', assignee: 'sofia', creator: 'valentina', status: 'REALIZADA', completedDaysAgo: 6, minutes: 205, category: 'Producción Audiovisual', complexity: 'MEDIA', priority: 'NORMAL', format: 'Reel' },
    { key: 't8', title: 'Carrusel: la tarifa de fin de año', client: 'hotel-mar-azul', assignee: 'andres', creator: 'mateo', status: 'REALIZADA', completedDaysAgo: 7, minutes: 95, category: 'Creativo & Diseño', complexity: 'MEDIA', priority: 'NORMAL', format: 'Carrusel' },
    { key: 't9', title: 'Historias de la semana · La Espiga', client: 'panaderia-la-espiga', assignee: 'juliana', creator: 'valentina', status: 'REALIZADA', completedDaysAgo: 8, minutes: 60, category: 'Marketing & Social Media', complexity: 'BAJA', priority: 'NORMAL', format: 'Historia' },
    { key: 't10', title: 'Reel: valoración gratis de ortodoncia', client: 'clinica-sonria', assignee: 'sofia', creator: 'mateo', status: 'REALIZADA', completedDaysAgo: 9, minutes: 170, category: 'Producción Audiovisual', complexity: 'MEDIA', priority: 'NORMAL', format: 'Reel' },
    { key: 't11', title: 'Post: la sede nueva de la calle 70', client: 'cafe-altura', assignee: 'andres', creator: 'mateo', status: 'REALIZADA', completedDaysAgo: 10, minutes: 45, category: 'Creativo & Diseño', complexity: 'BAJA', priority: 'NORMAL', format: 'Post' },
    { key: 't12', title: 'Reunión mensual con Gimnasio Vital', client: 'gimnasio-vital', assignee: 'valentina', creator: 'valentina', status: 'REALIZADA', completedDaysAgo: 12, minutes: 70, category: 'Operaciones & Reuniones', complexity: 'BAJA', priority: 'NORMAL' },
    { key: 't13', title: 'Reel: una noche en la suite', client: 'hotel-mar-azul', assignee: 'sofia', creator: 'mateo', status: 'REALIZADA', completedDaysAgo: 14, minutes: 260, category: 'Producción Audiovisual', complexity: 'ALTA', priority: 'ALTA', format: 'Reel' },
    { key: 't14', title: 'Carrusel: cuidados de los brackets', client: 'clinica-sonria', assignee: 'andres', creator: 'mateo', status: 'REALIZADA', completedDaysAgo: 15, minutes: 90, category: 'Creativo & Diseño', complexity: 'BAJA', priority: 'NORMAL', format: 'Carrusel' },
    { key: 't15', title: 'Textos de publicación · Hotel Mar Azul (ES/EN)', client: 'hotel-mar-azul', assignee: 'laura', creator: 'mateo', status: 'REALIZADA', completedDaysAgo: 16, minutes: 150, category: 'Creación de Contenido', complexity: 'MEDIA', priority: 'NORMAL' },
    // En proceso ahora mismo: el reloj corre.
    { key: 't16', title: 'Reel: reto de 30 días', client: 'gimnasio-vital', assignee: 'sofia', creator: 'valentina', status: 'EN_CURSO', startedMinutesAgo: 75, dueInDays: 1, category: 'Producción Audiovisual', complexity: 'MEDIA', priority: 'ALTA', format: 'Reel', description: 'Grabado el martes; falta la edición y la portada.' },
    { key: 't17', title: 'Carrusel: tortas por encargo', client: 'panaderia-la-espiga', assignee: 'andres', creator: 'valentina', status: 'EN_CURSO', startedMinutesAgo: 35, dueInDays: 0, category: 'Creativo & Diseño', complexity: 'BAJA', priority: 'NORMAL', format: 'Carrusel' },
    // Pendientes: hoy, mañana, la semana, y una vencida.
    { key: 't18', title: 'Publicar reel del tostado del mes', client: 'cafe-altura', assignee: 'juliana', creator: 'mateo', status: 'PENDIENTE', dueInDays: 0, category: 'Marketing & Social Media', complexity: 'BAJA', priority: 'URGENTE', description: 'Sale hoy a las 6 p. m. Revisar que la portada esté cargada.' },
    { key: 't19', title: 'Textos de la semana · Clínica Sonría', client: 'clinica-sonria', assignee: 'laura', creator: 'mateo', status: 'PENDIENTE', dueInDays: 0, category: 'Creación de Contenido', complexity: 'MEDIA', priority: 'ALTA' },
    { key: 't20', title: 'Reel: tour a la Sierra', client: 'hotel-mar-azul', assignee: 'sofia', creator: 'mateo', status: 'PENDIENTE', dueInDays: 2, category: 'Producción Audiovisual', complexity: 'ALTA', priority: 'NORMAL', format: 'Reel' },
    { key: 't21', title: 'Post: el croissant de almendras', client: 'panaderia-la-espiga', assignee: 'andres', creator: 'valentina', status: 'PENDIENTE', dueInDays: 3, category: 'Creativo & Diseño', complexity: 'BAJA', priority: 'NORMAL', format: 'Post' },
    { key: 't22', title: 'Primera versión de la página web', client: 'inmobiliaria-horizonte', assignee: 'andres', creator: 'mateo', status: 'PENDIENTE', dueInDays: 5, category: 'Creativo & Diseño', complexity: 'ALTA', priority: 'ALTA', description: 'Inicio, proyectos y contacto. La inmobiliaria manda las fotos el jueves.' },
    { key: 't23', title: 'Configurar campaña de pauta · Horizonte', client: 'inmobiliaria-horizonte', assignee: 'mateo', creator: 'valentina', status: 'PENDIENTE', dueInDays: 4, category: 'Marketing & Social Media', complexity: 'MEDIA', priority: 'NORMAL' },
    { key: 't24', title: 'Informe de septiembre · Hotel Mar Azul', client: 'hotel-mar-azul', assignee: 'laura', creator: 'mateo', status: 'PENDIENTE', dueInDays: -2, category: 'Estratégico', complexity: 'MEDIA', priority: 'ALTA', description: 'El hotel lo pidió para la junta del viernes pasado.' },
    { key: 't25', title: 'Grabación en la sede norte', client: 'gimnasio-vital', assignee: 'sofia', creator: 'valentina', status: 'PENDIENTE', dueInDays: 6, category: 'Producción Audiovisual', complexity: 'MEDIA', priority: 'NORMAL', isSpecial: true, description: 'Martes 5:30 a. m. Llevar el trípode grande y el micrófono de solapa.' },
    { key: 't26', title: 'Reel: pedidos por WhatsApp', client: 'panaderia-la-espiga', assignee: 'sofia', creator: 'valentina', status: 'PENDIENTE', dueInDays: 8, category: 'Producción Audiovisual', complexity: 'BAJA', priority: 'NORMAL', format: 'Reel' },
    { key: 't27', title: 'Propuesta de parrilla de noviembre · Café Altura', client: 'cafe-altura', assignee: 'juliana', creator: 'mateo', status: 'PENDIENTE', dueInDays: 7, category: 'Estratégico', complexity: 'MEDIA', priority: 'NORMAL' },
    // Devuelta: el cliente pidió un cambio.
    { key: 't28', title: 'Post: el desayuno frente al mar', client: 'hotel-mar-azul', assignee: 'andres', creator: 'mateo', status: 'DEVUELTA', dueInDays: 1, category: 'Creativo & Diseño', complexity: 'BAJA', priority: 'NORMAL', format: 'Post', returnReason: 'Cambio del cliente', returnNote: 'El hotel pide la foto del desayuno sin personas en la mesa.' }
]);

const LEADS = Object.freeze([
    { company: 'Restaurante Brasa Viva', contactName: 'Jorge Lemos', email: 'jorge@brasaviva.test', phone: '+57 300 000 0101', origin: 'REFERIDO', stage: 'PROPUESTA_ENVIADA', owner: 'daniel', quotedValue: 2600000, enteredDaysAgo: 20, proposalSentDaysAgo: 12, serviceInterest: 'Parrilla mensual y grabación de reels', activities: [{ type: 'LLAMADA', daysAgo: 18, note: 'Primera llamada: tienen dos sedes y quieren empezar en noviembre.' }, { type: 'REUNION', daysAgo: 15, note: 'Reunión en el restaurante. Les interesa el plan de 12 piezas.' }, { type: 'PROPUESTA_ENVIADA', daysAgo: 12, note: 'Propuesta enviada por correo.' }] },
    { company: 'Colegio Nuevo Amanecer', contactName: 'Rectora Luz Marina Ortiz', email: 'rectoria@nuevoamanecer.test', phone: '+57 300 000 0102', origin: 'FORMULARIO', stage: 'CITA_SOLICITADA', owner: 'daniel', quotedValue: null, enteredDaysAgo: 4, nextFollowUpInDays: 1, serviceInterest: 'Campaña de matrículas 2027', activities: [{ type: 'CORREO', daysAgo: 3, note: 'Respondimos el formulario y propusimos reunión el jueves.' }] },
    { company: 'Veterinaria Patitas', contactName: 'Dra. Carolina Ríos', email: 'carolina@patitas.test', phone: '+57 300 000 0103', origin: 'WHATSAPP', stage: 'NEGOCIACION', owner: 'daniel', quotedValue: 1900000, enteredDaysAgo: 30, proposalSentDaysAgo: 9, nextFollowUpInDays: 0, serviceInterest: 'Parrilla mensual', activities: [{ type: 'WHATSAPP', daysAgo: 28, note: 'Escribió por WhatsApp pidiendo precios.' }, { type: 'PROPUESTA_ENVIADA', daysAgo: 9, note: 'Propuesta de 8 piezas al mes.' }, { type: 'RESPUESTA_CLIENTE', daysAgo: 6, note: 'Pide bajar a 6 piezas y mantener las historias.' }] },
    { company: 'Ferretería El Tornillo', contactName: 'Hernán Suárez', email: null, phone: '+57 300 000 0104', origin: 'CONTACTO_DIRECTO', stage: 'POR_GESTIONAR', owner: 'daniel', quotedValue: null, enteredDaysAgo: 1, serviceInterest: 'No sabe todavía; quiere «estar en redes»', activities: [] },
    { company: 'Spa Serena', contactName: 'Isabel Cano', email: 'isabel@spaserena.test', phone: '+57 300 000 0105', origin: 'LINKEDIN', stage: 'SIN_RESPUESTA', owner: 'daniel', quotedValue: 2300000, enteredDaysAgo: 48, proposalSentDaysAgo: 33, serviceInterest: 'Parrilla y fotografía de producto', activities: [{ type: 'MENSAJE_LINKEDIN', daysAgo: 46, note: 'Contacto por LinkedIn.' }, { type: 'PROPUESTA_ENVIADA', daysAgo: 33, note: 'Propuesta enviada.' }, { type: 'WHATSAPP', daysAgo: 33, note: 'Confirmó que la recibió; la revisaría con su socio.' }] },
    { company: 'Constructora Piedra Alta', contactName: 'Ing. Fabio Mendoza', email: 'fmendoza@piedraalta.test', phone: '+57 300 000 0106', origin: 'CONVOCATORIA', stage: 'APROBADA', owner: 'valentina', quotedValue: 6500000, enteredDaysAgo: 40, proposalSentDaysAgo: 20, serviceInterest: 'Lanzamiento de un proyecto de vivienda', activities: [{ type: 'REUNION', daysAgo: 35, note: 'Presentación en sus oficinas.' }, { type: 'PROPUESTA_ENVIADA', daysAgo: 20, note: 'Propuesta de lanzamiento, tres meses.' }, { type: 'RESPUESTA_CLIENTE', daysAgo: 3, note: 'Aprobada. Falta firmar el contrato.' }] },
    { company: 'Librería Páginas', contactName: 'Tomás Ibáñez', email: 'tomas@paginas.test', phone: '+57 300 000 0107', origin: 'CLIENTE_ANTERIOR', stage: 'PERDIDO', owner: 'daniel', quotedValue: 1500000, enteredDaysAgo: 70, proposalSentDaysAgo: 60, closedDaysAgo: 25, lostReason: 'Sin presupuesto este año.', serviceInterest: 'Parrilla mensual', activities: [{ type: 'PROPUESTA_ENVIADA', daysAgo: 60, note: 'Propuesta enviada.' }, { type: 'RESPUESTA_CLIENTE', daysAgo: 25, note: 'Lo dejan para el próximo año.' }] },
    { company: 'Heladería Polar', contactName: 'Natalia Bermúdez', email: 'hola@polar.test', phone: '+57 300 000 0108', origin: 'FORMULARIO', stage: 'GANADO', owner: 'daniel', quotedValue: 1800000, enteredDaysAgo: 55, proposalSentDaysAgo: 45, closedDaysAgo: 30, serviceInterest: 'Parrilla mensual', activities: [{ type: 'PROPUESTA_ENVIADA', daysAgo: 45, note: 'Propuesta enviada.' }, { type: 'RESPUESTA_CLIENTE', daysAgo: 30, note: 'Aceptada; empiezan en noviembre.' }] }
]);

const THIRD_PARTIES = Object.freeze([
    { key: 'arrendador', kind: 'ARRENDADOR', name: 'Edificio Centro 93', legalName: 'INMOBILIARIA CENTRO 93 S.A.S.', documentType: 'NIT', documentNumber: '800000111-2', bankName: 'Banco Andino', bankAccountType: 'Ahorros', bankAccountNumber: '000-11111-1' },
    { key: 'imprenta', kind: 'PROVEEDOR', name: 'Imprenta Norte', legalName: 'IMPRENTA NORTE LTDA.', documentType: 'NIT', documentNumber: '800000222-3', bankName: 'Banco Andino', bankAccountType: 'Corriente', bankAccountNumber: '000-22222-2' },
    { key: 'fotografo', kind: 'CONTRATISTA', name: 'Estudio Luz · fotografía', documentType: 'CC', documentNumber: '52000000', bankName: 'Banco del Sur', bankAccountType: 'Ahorros', bankAccountNumber: '000-33333-3' },
    { key: 'software', kind: 'PROVEEDOR', name: 'Herramientas de diseño (suscripción)', documentType: null, documentNumber: null }
]);

const FACTS = Object.freeze([
    { id: 'demo-fact-01', entidad: 'Café Altura', tema: 'aprobaciones', afirmacion: 'La dueña aprueba rápido, pero quiere ver la pieza antes que el texto: se le envía primero el video o la imagen.', certeza: 'CONFIRMADO', proposito: 'operacion' },
    { id: 'demo-fact-02', entidad: 'Café Altura', tema: 'tono', afirmacion: 'No usar la palabra «gourmet» en ningún texto; la marca la rechazó expresamente.', certeza: 'CONFIRMADO', proposito: 'editorial' },
    { id: 'demo-fact-03', entidad: 'Clínica Sonría', tema: 'consentimientos', afirmacion: 'Toda pieza con antes y después necesita el consentimiento firmado del paciente; lo guarda la clínica.', certeza: 'CONFIRMADO', proposito: 'editorial' },
    { id: 'demo-fact-04', entidad: 'Gimnasio Vital', tema: 'calendario', afirmacion: 'La gerente quiere ver el calendario completo del mes antes del día 3; si no, se atrasa la aprobación de todo el mes.', certeza: 'CONFIRMADO', proposito: 'operacion' },
    { id: 'demo-fact-05', entidad: 'Gimnasio Vital', tema: 'grabaciones', afirmacion: 'Las grabaciones son los martes a las 5:30 de la mañana en la sede norte.', certeza: 'VIGENTE_DE_HECHO', proposito: 'operacion' },
    { id: 'demo-fact-06', entidad: 'Hotel Mar Azul', tema: 'idiomas', afirmacion: 'Las piezas van en español y en inglés; el texto en inglés lo revisa el hotel antes de publicar.', certeza: 'CONFIRMADO', proposito: 'editorial' },
    { id: 'demo-fact-07', entidad: 'Hotel Mar Azul', tema: 'temporada', afirmacion: 'El objetivo de octubre a diciembre es vender la temporada de fin de año con reservas directas.', certeza: 'CONFIRMADO', proposito: 'operacion' },
    { id: 'demo-fact-08', entidad: 'Panadería La Espiga', tema: 'contacto', afirmacion: 'Don Álvaro no usa correo: todo se coordina por WhatsApp, con llamada si es urgente.', certeza: 'CONFIRMADO', proposito: 'operacion' },
    { id: 'demo-fact-09', entidad: 'Taller Rueda Libre', tema: 'contrato', afirmacion: 'La parrilla está en stand by por remodelación del local; retoman en enero.', certeza: 'CONFIRMADO', proposito: 'operacion' },
    { id: 'demo-fact-10', entidad: 'Agencia Faro', tipoEntidad: 'agencia', tema: 'proceso', afirmacion: 'Toda parrilla se envía al cliente primero en texto (ideas, guiones, textos) y el material terminado llega después; el cliente aprueba las dos cosas.', certeza: 'PRACTICA', proposito: 'operacion' },
    { id: 'demo-fact-11', entidad: 'Agencia Faro', tipoEntidad: 'agencia', tema: 'informes', afirmacion: 'Los informes mensuales se entregan antes del día 10 del mes siguiente.', certeza: 'PRACTICA', proposito: 'operacion' }
]);

const ANNOUNCEMENTS = Object.freeze([
    { author: 'valentina', content: 'Esta semana cerramos las parrillas de noviembre. Cada cuenta con su calendario aprobado antes del viernes.' },
    { author: 'mateo', content: 'Recuerden cargar la portada de cada reel antes de programarlo: sin portada, Meta elige el fotograma que quiera.' }
]);

// --- Fechas relativas: todo se calcula desde `now` en reloj de Bogotá (UTC-5, sin horario de verano). ---
const BOGOTA_OFFSET_MS = 5 * 60 * 60 * 1000;
const bogotaParts = (date) => {
    const shifted = new Date(date.getTime() - BOGOTA_OFFSET_MS);
    return { year: shifted.getUTCFullYear(), month: shifted.getUTCMonth() + 1, day: shifted.getUTCDate() };
};
const bogotaDate = (year, month, day, hour = 0, minute = 0) => new Date(Date.UTC(year, month - 1, day, hour, minute) + BOGOTA_OFFSET_MS);
const pad = (n) => String(n).padStart(2, '0');
const isoDate = (year, month, day) => `${year}-${pad(month)}-${pad(day)}`;
const previousMonthOf = (year, month) => (month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 });
const daysAgo = (now, days, hour = 10, minute = 0) => { const p = bogotaParts(new Date(now.getTime() - days * 86400000)); return bogotaDate(p.year, p.month, p.day, hour, minute); };

/** El conjunto completo, listo para que `seed-demo.js` lo escriba tal cual. */
export const buildDemoDataset = ({ now = new Date() } = {}) => {
    const today = bogotaParts(now);
    const current = { year: today.year, month: today.month };
    const previous = previousMonthOf(today.year, today.month);
    const twoAgo = previousMonthOf(previous.year, previous.month);

    const clients = DEMO_CLIENTS.map((client) => ({
        ...client,
        contract: {
            serviceType: 'PARRILLA', status: 'ACTIVO', cutDay: 1, ...client.contract,
            startDate: isoDate(twoAgo.year, twoAgo.month, 1),
            standBySince: client.contract.standBySince === 'LAST_MONTH' ? isoDate(previous.year, previous.month, 15) : null
        }
    }));

    // Desde mitad de mes ya se está armando la parrilla del mes que viene, en planificación.
    const next = today.day >= 15 ? (today.month === 12 ? { year: today.year + 1, month: 1 } : { year: today.year, month: today.month + 1 }) : null;
    const plans = clients.filter((c) => c.contract.serviceType === 'PARRILLA' && c.contract.status === 'ACTIVO').flatMap((client) => [
        { client: client.key, ...current, status: 'ACTIVO', owner: client.cm, strategicObjectives: client.objective, pieces: piecesOf(client, { ...current, today: today.day }) },
        { client: client.key, ...previous, status: 'FINALIZADO', owner: client.cm, strategicObjectives: client.objective, pieces: piecesOf(client, { ...previous, today: 32, previous: true }) },
        ...(next ? [{ client: client.key, ...next, status: 'PLANIFICACION', owner: client.cm, strategicObjectives: client.objective, pieces: piecesOf(client, { ...next, today: 0, next: true }) }] : [])
    ]);

    // El informe del mes pasado ya se entregó en las cuentas que lo contratan, salvo en el hotel (lo pide su tarea vencida).
    const monthlyReports = clients.filter((c) => c.contract.monthlyReport && c.contract.status === 'ACTIVO' && c.key !== 'hotel-mar-azul')
        .map((c) => ({ client: c.key, ...previous, deliveredAt: daysAgo(now, 18, 15), deliveredBy: c.pm }));

    const tasks = TASK_TEMPLATES.map((t) => {
        const base = { ...t, description: t.description || null };
        if (t.status === 'REALIZADA') {
            const completedAt = daysAgo(now, t.completedDaysAgo, 16, 20);
            const startedAt = new Date(completedAt.getTime() - t.minutes * 60000);
            return { ...base, createdAt: daysAgo(now, t.completedDaysAgo + 3, 9), dueDate: daysAgo(now, t.completedDaysAgo, 12), completedAt, work: { startedAt, endedAt: completedAt, durationMs: t.minutes * 60000 } };
        }
        const dueDate = daysAgo(now, -t.dueInDays, 12);
        const createdAt = daysAgo(now, Math.max(2, t.dueInDays + 4), 9);
        if (t.status === 'EN_CURSO') {
            const startedAt = new Date(now.getTime() - t.startedMinutesAgo * 60000);
            return { ...base, createdAt, dueDate, startedAt, work: { startedAt, endedAt: null, durationMs: null } };
        }
        if (t.status === 'DEVUELTA') return { ...base, createdAt, dueDate, returnedAt: daysAgo(now, 0, 9, 40) };
        return { ...base, createdAt, dueDate };
    });

    const leads = LEADS.map((lead) => ({
        ...lead,
        enteredAt: daysAgo(now, lead.enteredDaysAgo, 9),
        proposalSentAt: lead.proposalSentDaysAgo != null ? daysAgo(now, lead.proposalSentDaysAgo, 11) : null,
        nextFollowUpAt: lead.nextFollowUpInDays != null ? daysAgo(now, -lead.nextFollowUpInDays, 0) : null,
        closedAt: lead.closedDaysAgo != null ? daysAgo(now, lead.closedDaysAgo, 15) : null,
        lastActivityAt: lead.activities.length ? daysAgo(now, Math.min(...lead.activities.map((a) => a.daysAgo)), 11) : null,
        activities: lead.activities.map((a) => ({ ...a, occurredAt: daysAgo(now, a.daysAgo, 11) }))
    }));

    // Finanzas: tres meses de movimientos, cartera del mes pasado cobrada y la de este mes abierta.
    const months = [twoAgo, previous, current];
    const accounts = [
        { key: 'banco', name: 'Banco Andino · Cuenta corriente', type: 'BANK', institution: 'Banco Andino', holderName: DEMO_AGENCY.name, lastFour: '4821', openingBalance: 18500000, openingBalanceDate: bogotaDate(twoAgo.year, twoAgo.month, 1) },
        { key: 'caja', name: 'Caja menor', type: 'CASH', holderName: DEMO_AGENCY.name, openingBalance: 600000, openingBalanceDate: bogotaDate(twoAgo.year, twoAgo.month, 1) }
    ];
    const records = [];
    const receivables = [];
    let receivableNumber = 1041;
    for (const [index, m] of months.entries()) {
        const isCurrent = index === months.length - 1;
        const dayCap = isCurrent ? today.day : 28;
        for (const client of clients) {
            if (client.contract.status !== 'ACTIVO') continue;
            // Cuenta de cobro del mes: las pasadas, cobradas; de este mes, dos cuentas siguen debiendo.
            const paid = !isCurrent || !['hotel-mar-azul', 'panaderia-la-espiga'].includes(client.key);
            const paidDay = Math.min(isCurrent ? 8 : 12, dayCap);
            receivables.push({
                client: client.key, year: m.year, month: m.month, number: receivableNumber++, amount: client.monthlyFee, issuedAt: bogotaDate(m.year, m.month, 1, 9),
                dueDate: bogotaDate(m.year, m.month, 15, 12), status: paid ? 'PAGADO' : 'DEBE',
                concept: client.contract.serviceType === 'SERVICIOS' ? 'Página web y campaña de pauta' : 'Parrilla mensual de contenidos',
                servicePeriod: `Del 01 al ${pad(new Date(Date.UTC(m.year, m.month, 0)).getUTCDate())} de ${MONTHS_ES[m.month - 1]} de ${m.year}`,
                payment: paid ? { paidAt: bogotaDate(m.year, m.month, paidDay, 10), account: 'banco', reference: `TRF-${m.year}${pad(m.month)}-${client.slug.slice(0, 4).toUpperCase()}` } : null
            });
        }
        // Egresos del mes.
        const expense = (day, category, section, amount, description, extra = {}) => {
            if (day > dayCap) return;
            records.push({ type: 'EXPENSE', category, section, amount, description, date: bogotaDate(m.year, m.month, day, 10), year: m.year, month: m.month, account: 'banco', ...extra });
        };
        expense(5, 'ADMINISTRATIVO', 'ADMIN_COST', 1800000, 'Arriendo de la oficina', { counterparty: 'Edificio Centro 93' });
        expense(6, 'ADMINISTRATIVO', 'ADMIN_COST', 420000, 'Suscripción a herramientas de diseño', { counterparty: 'Herramientas de diseño (suscripción)' });
        expense(15, 'NOMINA', 'PAYROLL', 5600000, 'Nómina primera quincena');
        expense(28, 'NOMINA', 'PAYROLL', 5600000, 'Nómina segunda quincena');
        expense(10, 'OPERATIVO', 'OPERATING_EXPENSE', 650000, 'Sesión de fotos de producto · Café Altura', { counterparty: 'Estudio Luz · fotografía', client: 'cafe-altura' });
        expense(18, 'PAUTA', 'OPERATING_EXPENSE', 1200000, 'Pauta en Meta · Inmobiliaria Horizonte', { counterparty: 'Meta Platforms', client: 'inmobiliaria-horizonte' });
        expense(22, 'LOGISTICA', 'OPERATING_EXPENSE', 180000, 'Transporte a grabaciones', { account: 'caja' });
        expense(12, 'OPERATIVO', 'OPERATING_EXPENSE', 240000, 'Impresión de material para el hotel', { counterparty: 'Imprenta Norte', client: 'hotel-mar-azul' });
    }

    const payables = [
        { thirdParty: 'arrendador', concept: `Arriendo de ${MONTHS_ES[current.month - 1]}`, category: 'ADMINISTRATIVO', amount: 1800000, receivedAt: bogotaDate(current.year, current.month, 1, 9), dueDate: bogotaDate(current.year, current.month, 5, 12), year: current.year, month: current.month, status: today.day >= 5 ? 'PAGADA' : 'POR_PAGAR', documentNumber: `ARR-${current.year}${pad(current.month)}` },
        { thirdParty: 'imprenta', concept: 'Impresión de menús y material POP · Hotel Mar Azul', category: 'OPERATIVO', amount: 240000, receivedAt: bogotaDate(current.year, current.month, Math.min(12, today.day), 9), dueDate: bogotaDate(current.year, current.month, 27, 12), year: current.year, month: current.month, status: 'POR_PAGAR', documentNumber: 'FV-2231' },
        { thirdParty: 'fotografo', concept: 'Sesión de fotos de producto · Café Altura', category: 'OPERATIVO', amount: 650000, receivedAt: bogotaDate(current.year, current.month, Math.min(10, today.day), 9), dueDate: bogotaDate(current.year, current.month, 25, 12), year: current.year, month: current.month, status: 'POR_PAGAR', documentNumber: 'CC-018' }
    ];

    return {
        now, today, current, previous, next,
        agency: DEMO_AGENCY, team: DEMO_TEAM, clients, plans, monthlyReports, tasks, leads,
        accounts, records, receivables, thirdParties: THIRD_PARTIES, payables,
        facts: FACTS, announcements: ANNOUNCEMENTS
    };
};

export const MONTHS_ES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/** Todo el texto del conjunto, en una sola cadena: lo que vigila la prueba contra nombres reales. */
export const demoDatasetText = (dataset = buildDemoDataset()) => JSON.stringify(dataset);
