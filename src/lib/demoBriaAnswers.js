// Bria en la demo (Rodny, 13 de noviembre de 2026: «actívalo con respuestas inventadas»). La demo no tiene llave de
// OpenAI, así que Bria contesta con respuestas de muestra según el tema de la pregunta, sobre la Agencia Faro inventada.
// Nunca dice que hizo algo que no hizo: para crear o cambiar datos indica dónde hacerlo en la plataforma.

const TOPICS = [
  {
    test: /(cr[eé]a|crear|cr[eé]ame|agrega|añade|asigna|mueve|cambia|elimina|borra|programa)\b/i,
    answer: (n) => `Claro, ${n}. En esta demo no hago cambios desde el chat, pero lo puedes hacer en un minuto: en **Gestión** pulsa **Nueva tarea**, elige el cliente y la persona, y queda creado con su fecha. En la plataforma real te lo dejo preparado aquí mismo y solo confirmas.`
  },
  {
    test: /(amaneci|lectura|resumen|c[oó]mo (va|est[aá]) la agencia|buen(os)? d[ií]as|hola|qu[eé] (pas[oó]|hay) hoy)/i,
    answer: (n) => `Buenos días, ${n}. Así amaneció la agencia:\n\n- **Hotel Mar Azul** y **Gimnasio Vital** van en riesgo: tienen piezas que pasaron su fecha sin publicar.\n- **Café Altura** va al día, pero su pauta va por debajo del ritmo del presupuesto.\n- El equipo tiene pendientes que vencen hoy; Laura y Andrés son los más cargados esta semana.\n\nYo empezaría por el hotel: hablar hoy con Laura y cerrar los reels de la terraza.`
  },
  {
    test: /(pendiente|tarea|qu[eé] tengo|vence|vencid|devuelt)/i,
    answer: (n) => `Hoy tienes pendientes que vencen, ${n}, y uno ya está vencido: la edición del video testimonial. Te sugiero revisarlo con Sofía antes del mediodía. Lo demás de la semana está repartido entre Laura, Juliana y Andrés; en **Gestión** los ves por persona y por fecha.`
  },
  {
    test: /(parrilla|pieza|publicaci|reel|carrusel|aprobaci|aprob[oó])/i,
    answer: () => 'La parrilla de noviembre va así: la mayoría de las piezas ya están diseñadas y varias esperan la aprobación del cliente en su portal. Las que preocupan son las que pasaron su fecha sin publicar en **Hotel Mar Azul** y **Gimnasio Vital**. Si quieres, abre la parrilla y escríbele al cliente con el enlace del portal para que apruebe lo pendiente.'
  },
  {
    test: /(cartera|cobr|deb[ea]|factur|pag[oó]|plata|dinero|financ)/i,
    answer: () => 'En cartera hay dos clientes con saldo pendiente. Ninguno está en riesgo de suspensión todavía, pero conviene escribirles esta semana: la gestión queda registrada en la cuenta del cliente y así nadie repite la llamada. En **Financiero → Cuentas por cobrar** ves cada saldo con su antigüedad.'
  },
  {
    test: /(pauta|presupuesto|meta ads|anuncio|campa[ñn]a)/i,
    answer: () => 'De las pautas, **Gimnasio Vital** se pasó del presupuesto y **Panadería La Espiga** lo está gastando demasiado rápido: a este ritmo se le acaba antes del cierre. **Café Altura**, en cambio, va por debajo del ritmo. Yo revisaría primero la del gimnasio y bajaría el tope diario de la campaña.'
  },
  {
    test: /(equipo|ritmo|carga|qui[eé]n (est[aá]|tiene)|disponible|horas)/i,
    answer: () => 'Esta semana Laura y Andrés tienen la carga más alta; Juliana tiene espacio desde el jueves. Si entra una pieza nueva de diseño, te sugiero dársela a Juliana para no atrasar los carruseles de Andrés. En **Manager → Ritmo** ves la carga día por día.'
  },
  {
    test: /(cotizaci|propuesta|crm|oportunidad|cliente nuevo|venta|lead)/i,
    answer: () => 'En ventas hay propuestas esperando respuesta: **Ferretería El Tornillo** todavía no ha tenido el primer contacto y **Constructora Piedra Alta** ya aprobó, así que toca formalizarla. Te recomiendo llamar hoy a la ferretería; en **CRM** la tienes con su próximo paso.'
  }
];

const FALLBACK = (n) => `Buena pregunta, ${n}. En esta demo respondo con ejemplos sobre la Agencia Faro: pregúntame cómo amaneció la agencia, qué pendientes vencen, cómo van las parrillas, la pauta, la cartera, el equipo o las ventas. En la plataforma real leo todos los módulos y te respondo con los datos del momento.`;

/** La respuesta de muestra de Bria para una pregunta; `person.name` da el nombre con que saluda. */
export const demoBriaAnswer = (question, person = {}) => {
  const name = String(person.name || 'colega').split(/\s+/)[0];
  const text = String(question || '');
  const topic = TOPICS.find((entry) => entry.test.test(text));
  return topic ? topic.answer(name) : FALLBACK(name);
};
