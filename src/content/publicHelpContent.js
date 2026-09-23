export const HELP_UPDATED_AT = 'septiembre de 2026';

export const helpGroups = [
  {
    id: 'empezar',
    label: 'Empezar',
    articles: [
      {
        id: 'primeros-pasos',
        title: 'Primeros pasos',
        summary: 'Cómo entrar, orientarte y trabajar con seguridad desde el primer día.',
        purpose: 'BrainStudio OS reúne el trabajo operativo de la agencia en un solo lugar. La navegación y las funciones visibles dependen de tu rol y de los permisos asignados.',
        access: 'Toda persona con una cuenta activa. Si un módulo no aparece, solicita acceso a tu responsable; no uses la cuenta de otra persona.',
        functions: ['Iniciar sesión y cambiar la clave temporal.', 'Abrir módulos desde el menú lateral.', 'Consultar notificaciones y tareas personales.', 'Usar el menú de perfil para ajustes y cierre de sesión.'],
        steps: ['Ingresa con tu correo corporativo.', 'Si el sistema lo solicita, crea una contraseña nueva.', 'Revisa el Dashboard y las notificaciones pendientes.', 'Abre solo el módulo relacionado con la tarea que vas a realizar.'],
        practices: ['No compartas tu contraseña ni dejes sesiones abiertas en equipos ajenos.', 'Confirma el cliente, periodo y responsable antes de guardar información.', 'Si recibes un acceso que no corresponde a tu trabajo, repórtalo.']
      },
      {
        id: 'dashboard',
        title: 'Dashboard',
        summary: 'Tu punto de partida para tareas, reuniones, anuncios y recordatorios.',
        purpose: 'Presenta un resumen personal del trabajo que requiere atención y de los avances recientes.',
        access: 'Personas con permiso de Dashboard. La información es personal y cambia según asignaciones y permisos.',
        functions: ['Consultar tareas activas, para hoy, vencidas, devueltas y logros.', 'Leer anuncios y recordatorios.', 'Ver próximos pendientes y reuniones.', 'Acceder a clientes o acciones rápidas según el rol.'],
        steps: ['Empieza por vencidas y devueltas.', 'Revisa los compromisos para hoy.', 'Consulta reuniones y recordatorios.', 'Abre la tarea o módulo correspondiente para actuar.'],
        practices: ['El Dashboard resume; las modificaciones se hacen en el módulo de origen.', 'Un bloque vacío no significa un error si no tienes información pendiente.', 'No interpretes indicadores personales como un ranking del equipo.']
      },
      {
        id: 'perfil-cuenta',
        title: 'Perfil y cuenta',
        summary: 'Datos personales, foto, contraseña, notas y preferencias de cuenta.',
        purpose: 'Permite mantener actualizada tu identidad dentro de la plataforma y proteger tu acceso.',
        access: 'Cada persona administra su propio perfil. Algunas vistas de equipo dependen de permisos adicionales.',
        functions: ['Actualizar información básica y fotografía.', 'Cambiar la contraseña.', 'Consultar o registrar información personal habilitada.', 'Cerrar la sesión de forma segura.'],
        steps: ['Abre tu foto en la barra lateral.', 'Entra a Perfil o Ajustes.', 'Modifica únicamente los datos necesarios.', 'Guarda y espera la confirmación del servidor.'],
        practices: ['Usa una fotografía reconocible y datos profesionales vigentes.', 'No reutilices contraseñas compartidas.', 'Si sospechas acceso indebido, cambia la clave y repórtalo.']
      },
      {
        id: 'notificaciones-chat',
        title: 'Notificaciones y chat',
        summary: 'Avisos operativos y comunicación contextual con el equipo.',
        purpose: 'Centraliza señales que requieren tu atención y conversaciones de trabajo dentro de la agencia.',
        access: 'Personas autenticadas; algunos avisos dependen del módulo y de los permisos vigentes.',
        functions: ['Consultar avisos no leídos.', 'Abrir el recurso relacionado desde una notificación.', 'Participar en conversaciones habilitadas.', 'Compartir archivos permitidos dentro del contexto correcto.'],
        steps: ['Abre la campana para revisar novedades.', 'Lee el contexto completo antes de actuar.', 'Sigue el enlace hacia la tarea o registro.', 'Marca como atendido cuando corresponda.'],
        practices: ['No uses el chat para compartir contraseñas o secretos.', 'Una notificación no sustituye la validación del registro original.', 'Mantén cada conversación vinculada al asunto correcto.']
      }
    ]
  },
  {
    id: 'operacion',
    label: 'Operación diaria',
    articles: [
      {
        id: 'gestion',
        title: 'Gestión',
        summary: 'Creación, asignación y seguimiento de tareas en el tablero Kanban.',
        purpose: 'Organiza el ciclo de las tareas desde Pendiente hasta Realizado, conservando responsables, fechas, prioridad, archivos y conversación.',
        access: 'Personas con permiso de Gestión. Crear, reasignar, devolver o eliminar puede depender del rol.',
        functions: ['Crear y editar tareas.', 'Mover tareas entre estados.', 'Asignar responsable, cliente, fecha y prioridad.', 'Comentar, adjuntar evidencia y consultar el historial.', 'Definir compromisos con hora cuando el rol lo permite.'],
        steps: ['Crea la tarea con un título concreto y contexto suficiente.', 'Asigna responsable, cliente y fecha realista.', 'Mueve a En proceso cuando empieces.', 'Documenta avances y entrega evidencia.', 'Marca Realizado solo cuando el trabajo esté concluido.'],
        practices: ['No uses el estado como sustituto de una explicación.', 'Una tarea devuelta debe incluir un motivo accionable.', 'Respeta el compromiso activo antes de abrir otros pendientes bloqueados.']
      },
      {
        id: 'actividad',
        title: 'Actividad',
        summary: 'Agenda, eventos y coordinación de reuniones del equipo.',
        purpose: 'Permite programar y consultar actividades relacionadas con personas, clientes y operación.',
        access: 'Personas con permiso de Actividad. La creación en calendarios conectados depende de la cuenta y sus permisos.',
        functions: ['Crear eventos y actividades.', 'Seleccionar participantes.', 'Consultar calendario y próximos eventos.', 'Conectar o utilizar calendarios autorizados.'],
        steps: ['Elige la fecha y hora desde el calendario compartido de la plataforma.', 'Agrega título, participantes y contexto.', 'Selecciona la cuenta de calendario correcta cuando aplique.', 'Guarda y confirma que el evento fue creado.'],
        practices: ['Verifica zona horaria y asistentes antes de enviar.', 'No dupliques eventos para corregirlos: edita el registro correcto.', 'Un fallo temporal de sincronización debe reportarse, no ocultarse.']
      },
      {
        id: 'manager',
        title: 'Manager',
        summary: 'Lectura de carga, tiempo registrado y distribución del trabajo.',
        purpose: 'Ayuda a observar patrones operativos y tomar decisiones de coordinación sin convertirlos en métricas aisladas de productividad.',
        access: 'Personas con permiso de Manager, normalmente responsables de coordinación.',
        functions: ['Consultar distribución por categoría, cliente, complejidad y responsable.', 'Revisar actividad registrada por periodo.', 'Detectar concentración o ausencia de información.'],
        steps: ['Selecciona el periodo que necesitas analizar.', 'Compara dimensiones relacionadas.', 'Abre el contexto antes de sacar una conclusión.', 'Convierte el hallazgo en una conversación o acción verificable.'],
        practices: ['No uses una sola métrica para evaluar a una persona.', 'Distingue falta de registro de falta de trabajo.', 'Usa tendencias y contexto, no capturas aisladas.']
      },
      {
        id: 'salud-operativa',
        title: 'Salud Operativa',
        summary: 'Diagnóstico administrativo de procesos y señales técnicas.',
        purpose: 'Ofrece a administración una vista de incidencias y trazabilidad para mantener la operación confiable.',
        access: 'Solo administradores.',
        functions: ['Consultar indicadores operativos.', 'Actualizar diagnósticos disponibles.', 'Revisar metodología y trazas relacionadas.'],
        steps: ['Identifica la señal y su alcance.', 'Consulta la metodología antes de interpretarla.', 'Verifica el recurso de origen.', 'Escala la corrección al responsable correspondiente.'],
        practices: ['No corrijas datos productivos desde una suposición.', 'Conserva evidencia del diagnóstico.', 'Distingue una alerta temporal de un fallo confirmado.']
      }
    ]
  },
  {
    id: 'contenido-clientes',
    label: 'Contenido y clientes',
    articles: [
      {
        id: 'parrillas',
        title: 'Parrillas',
        summary: 'Planeación, revisión y aprobación de contenido por cliente y periodo.',
        purpose: 'Concentra las piezas de contenido, sus textos, estados, comentarios, archivos y revisión editorial.',
        access: 'Personas con permiso de Parrillas. La validación de criterios corresponde al responsable, project managers o administradores.',
        functions: ['Crear y editar piezas.', 'Gestionar estados y observaciones.', 'Solicitar revisiones de Bria.', 'Validar criterios editoriales.', 'Compartir vistas autorizadas.'],
        steps: ['Abre el cliente y periodo correctos.', 'Completa todas las piezas activas.', 'Revisa textos, archivos y fechas.', 'Ejecuta la revisión cuando el alcance esté completo.', 'Resuelve y valida hallazgos antes de publicar.'],
        practices: ['No presentes una revisión parcial como resultado final.', 'La ausencia de un hallazgo no prueba que fue corregido.', 'Los criterios aprobados pertenecen al cliente y alcance indicados.']
      },
      {
        id: 'reportes',
        title: 'Reportes',
        summary: 'Extracción, revisión y presentación de métricas con evidencia.',
        purpose: 'Convierte fuentes visuales y datos autorizados en informes verificables para clientes.',
        access: 'Personas con permiso de Reportes.',
        functions: ['Cargar fuentes.', 'Extraer y revisar observaciones.', 'Resolver conflictos.', 'Generar narrativa con evidencia.', 'Previsualizar y descargar el informe.'],
        steps: ['Selecciona cliente y periodo.', 'Carga las fuentes completas.', 'Revisa cifras, unidades, plataforma y fechas.', 'Corrige o excluye con trazabilidad.', 'Genera el análisis de la versión actual.', 'Publica únicamente cuando no existan conflictos pendientes.'],
        practices: ['Una confianza alta de la IA no sustituye la lectura humana.', 'No mezcles periodos o cuentas diferentes.', 'La narrativa debe referirse solo a evidencia validada.']
      },
      {
        id: 'inspiracion',
        title: 'Inspiración',
        summary: 'Tableros visuales para referencias, conceptos y dirección creativa.',
        purpose: 'Organiza referencias visuales sin mezclarlas con entregables aprobados.',
        access: 'Personas con permiso de Inspiración.',
        functions: ['Crear tableros.', 'Agregar y organizar referencias.', 'Mover, ampliar y revisar elementos en el lienzo.', 'Mantener contexto visual por proyecto.'],
        steps: ['Crea o abre el tablero adecuado.', 'Agrega referencias con contexto.', 'Organiza por concepto o dirección.', 'Comparte el tablero con el equipo relacionado.'],
        practices: ['Distingue referencia de pieza final.', 'Respeta derechos de autor y procedencia.', 'Evita tableros duplicados sin propietario claro.']
      },
      {
        id: 'clientes',
        title: 'Clientes',
        summary: 'Ficha central de información, responsables, enlaces y contexto comercial.',
        purpose: 'Mantiene una fuente compartida y actualizada de información operativa por cliente.',
        access: 'Personas con permiso de Clientes; editar depende de las responsabilidades asignadas.',
        functions: ['Consultar y actualizar la ficha.', 'Gestionar responsables y enlaces clave.', 'Abrir módulos relacionados.', 'Mantener datos legales y operativos cuando corresponda.'],
        steps: ['Busca antes de crear un cliente.', 'Abre la ficha correcta.', 'Edita solo los datos confirmados.', 'Guarda y comprueba la actualización.'],
        practices: ['No crees duplicados por variaciones del nombre.', 'Distingue nombre comercial de razón social.', 'No publiques accesos o contraseñas como enlaces de la ficha.']
      },
      {
        id: 'crm',
        title: 'CRM',
        summary: 'Seguimiento de oportunidades, responsables y próximos contactos.',
        purpose: 'Ayuda a registrar el avance comercial y evitar oportunidades sin seguimiento.',
        access: 'Personas con permiso de CRM.',
        functions: ['Registrar oportunidades.', 'Asignar propietario.', 'Actualizar etapa, semáforo y seguimiento.', 'Consultar historial y contexto.'],
        steps: ['Busca si la oportunidad ya existe.', 'Registra datos verificables y propietario.', 'Define el próximo seguimiento.', 'Actualiza la etapa después de cada interacción relevante.'],
        practices: ['No inventes estados para completar la ficha.', 'Una oportunidad sin próxima acción pierde trazabilidad.', 'Mantén datos personales limitados a lo necesario.']
      },
      {
        id: 'cotizaciones',
        title: 'Cotizaciones',
        summary: 'Preparación de propuestas comerciales basadas en el catálogo vigente.',
        purpose: 'Estandariza alcance, servicios, precios y condiciones antes de compartir una propuesta.',
        access: 'Personas con permiso de Cotizaciones; aprobación o administración depende del rol.',
        functions: ['Crear y editar cotizaciones.', 'Seleccionar servicios.', 'Aplicar condiciones y detalles.', 'Previsualizar y compartir propuestas.'],
        steps: ['Selecciona o registra al cliente correcto.', 'Añade servicios y alcance.', 'Revisa precios, impuestos y condiciones.', 'Previsualiza el documento completo.', 'Comparte solo después de confirmar la versión.'],
        practices: ['No prometas entregables fuera del alcance escrito.', 'Verifica vigencia de precios.', 'Una previsualización no equivale a una cotización enviada.']
      }
    ]
  },
  {
    id: 'conocimiento',
    label: 'Conocimiento',
    articles: [
      {
        id: 'minutas',
        title: 'Minutas',
        summary: 'Reuniones, transcripciones, análisis y acuerdos recuperables.',
        purpose: 'Conserva el resultado de reuniones y convierte conversaciones en decisiones y acciones revisables.',
        access: 'Personas con permiso de Minutas.',
        functions: ['Consultar reuniones procesadas.', 'Revisar transcripción, resumen y análisis.', 'Generar documentos cuando estén habilitados.', 'Archivar o restaurar contenido.'],
        steps: ['Busca la reunión por fecha o título.', 'Verifica participantes y transcripción.', 'Revisa acuerdos y responsables.', 'Corrige el contexto mediante los flujos permitidos.', 'Usa la minuta como apoyo, no como sustituto de una decisión formal.'],
        practices: ['La transcripción puede contener errores.', 'No elimines memoria institucional por limpieza visual.', 'Confirma información sensible antes de compartir documentos.']
      },
      {
        id: 'drive',
        title: 'Drive',
        summary: 'Archivos de agencia y documentos que alimentan la memoria organizacional.',
        purpose: 'Organiza fuentes y documentos relacionados con el conocimiento utilizado por Bria y por el equipo.',
        access: 'Personas con permiso de Minutas y Drive.',
        functions: ['Consultar documentos.', 'Revisar temas, decisiones, acciones, riesgos y oportunidades.', 'Archivar y restaurar fuentes.', 'Descargar o abrir archivos autorizados.'],
        steps: ['Ubica el documento por su contexto.', 'Comprueba fecha y procedencia.', 'Revisa el contenido antes de usarlo como fuente.', 'Archiva solo cuando deje de ser información activa.'],
        practices: ['No subas archivos sin relación con el trabajo.', 'Un documento antiguo puede seguir siendo evidencia histórica.', 'No confundas archivo eliminado con decisión revocada.']
      },
      {
        id: 'seguridad-ia',
        title: 'Seguridad y uso de IA',
        summary: 'Reglas para proteger datos y revisar responsablemente resultados generados con IA.',
        purpose: 'Reduce riesgos de filtración, errores, instrucciones maliciosas y uso automático sin criterio humano.',
        access: 'Aplica a todas las personas que utilizan BrainStudio o herramientas de IA relacionadas con el trabajo.',
        functions: ['Usar IA dentro de los flujos autorizados.', 'Revisar evidencia y resultados.', 'Reportar fallos o información peligrosa.', 'Consultar el marco público de seguridad.'],
        steps: ['Clasifica la información antes de enviarla.', 'Utiliza una herramienta autorizada.', 'Revisa fuentes, cifras y afirmaciones.', 'Obtén aprobación humana cuando el impacto lo requiera.', 'Reporta cualquier incidente.'],
        practices: ['No introduzcas contraseñas, tokens ni secretos.', 'Trata la IA como apoyo, no como autoridad final.', 'No presentes contenido simulado como evidencia real.']
      }
    ]
  },
  {
    id: 'administracion',
    label: 'Administración',
    articles: [
      {
        id: 'financiero',
        title: 'Financiero',
        summary: 'Movimientos, cartera, cuentas, nómina y documentos de respaldo.',
        purpose: 'Conserva la trazabilidad financiera y calcula saldos a partir de registros verificables.',
        access: 'Administradores o personas con permiso Financiero. Las acciones disponibles dependen del nivel asignado.',
        functions: ['Registrar ingresos y egresos.', 'Gestionar cuentas y categorías.', 'Consultar cartera y registrar abonos.', 'Administrar nómina habilitada.', 'Adjuntar, emitir o anular documentos según permisos.'],
        steps: ['Selecciona periodo, cuenta y categoría.', 'Registra el movimiento con concepto explícito.', 'Adjunta el respaldo cuando corresponda.', 'Verifica el resultado en indicadores y libro.', 'Para corregir, edita o anula: no dupliques el dinero.'],
        practices: ['Un ingreso aplicado a cartera no es un segundo ingreso.', 'Los documentos financieros no se borran para ocultar errores.', 'Revisa dependencias antes de corregir registros vinculados.']
      },
      {
        id: 'radar-merito',
        title: 'Radar de Mérito',
        summary: 'Información de desarrollo y reconocimiento del equipo.',
        purpose: 'Apoya conversaciones de crecimiento y visibilidad de aportes sin reemplazar la evaluación humana.',
        access: 'Personas con permiso de Radar; algunas acciones se restringen a responsables autorizados.',
        functions: ['Consultar información habilitada del equipo.', 'Revisar señales y reconocimientos.', 'Gestionar datos permitidos según el rol.'],
        steps: ['Selecciona a la persona correcta.', 'Revisa el periodo y el origen de la señal.', 'Contrasta con el trabajo real.', 'Usa la información como apoyo para una conversación.'],
        practices: ['No conviertas señales en etiquetas permanentes.', 'Evita comparaciones sin contexto.', 'Protege información personal y laboral.']
      },
      {
        id: 'equipo',
        title: 'Equipo',
        summary: 'Personas, cuentas, roles, permisos y acceso inicial.',
        purpose: 'Administra quién puede ingresar y qué módulos o acciones puede utilizar.',
        access: 'Personas con permiso de Equipo; crear cuentas o modificar permisos requiere administración.',
        functions: ['Registrar integrantes.', 'Crear o vincular cuentas.', 'Asignar roles y permisos.', 'Preparar acceso inicial.', 'Activar o desactivar accesos.'],
        steps: ['Busca a la persona antes de crearla.', 'Define rol humano y rol técnico.', 'Asigna solo los módulos necesarios.', 'Entrega la clave temporal por un canal seguro.', 'Revisa permisos cuando cambie la función.'],
        practices: ['Aplica mínimo privilegio.', 'No compartas claves temporales en espacios públicos.', 'Desactivar una cuenta debe revocar también sus sesiones.']
      }
    ]
  }
];

export const helpArticles = helpGroups.flatMap((group) => group.articles.map((article) => ({ ...article, groupId: group.id, groupLabel: group.label })));

export const findHelpArticle = (id) => helpArticles.find((article) => article.id === id) || helpArticles[0];
