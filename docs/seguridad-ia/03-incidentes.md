# Procedimiento de incidentes de información, ciberseguridad e IA

Versión 0.1 · 23 de septiembre de 2026 · INTERNO · Pendiente de aprobación y simulacro

## Preparación: completar antes de operar

Responsable y coordinador de incidentes: **Rodny Chirinos** [teléfono/correo operativos por confirmar]. Suplente: **Francisco Villa** [teléfono/correo operativos por confirmar]. Esta designación aplica a todo el programa, incluido PromoGroup. Francisco asume la coordinación ante ausencia o indisponibilidad de Rodny; el relevo y las decisiones se registran en el expediente.

Técnico de guardia [contactos], Dirección [contactos], privacidad/jurídico [contactos], destinatario contractual de la empresa [correo verificado], canal alterno aprobado [canal]. Confirmar cobertura y disponibilidad: la designación no acredita guardia 24/7 ni concede accesos técnicos por sí sola.

Incidente: evento confirmado o sospecha razonable de afectación a confidencialidad, integridad o disponibilidad. Incluye exposición entre clientes, credenciales comprometidas, borrado o alteración, indisponibilidad relevante, datos enviados a IA sin permiso, inyección de instrucciones con efectos y resultados de IA dañinos utilizados en una entrega.

## 1. Prevención

Inventariar servicios y responsables; minimizar datos; revisar accesos; exigir autorización de uso; controlar cambios; formar al equipo; mantener respaldos y probar restauración. Registrar pruebas, resultados y acciones pendientes.

## 2. Protección y detección

Todo empleado reporta de inmediato al coordinador/suplente; no espera a confirmar causa raíz. El coordinador registra hora de ocurrencia si se conoce y hora de conocimiento, sistemas/clientes afectados, indicios, alcance estimado e impacto. Conservar originales, identificadores de solicitud y cronología en un expediente restringido. No copiar innecesariamente los datos expuestos.

Clasificación inicial: crítica si hay exposición extensa/sensible, toma de control o continuidad gravemente afectada; alta si hay afectación confirmada de información de la empresa; media/baja según alcance y posibilidad de contención. Revaluar con evidencia. La severidad no elimina el deber de aviso cuando el incidente compromete información de la empresa.

## 3. Respuesta y comunicación

Objetivos internos propuestos: recepción/triage en 1 hora, responsable y contención inicial en 4 horas, borrador de aviso en 8 horas, escalar sin acuse interno a las 12 horas. Son metas de diseño por validar con recursos; no compromisos ya implementados.

Contener: suspender el flujo afectado, revocar credenciales comprometidas, aislar accesos, desactivar trabajos programados y preservar evidencia. Coordinar con proveedores. El control de gobierno valida las revisiones del cliente y bloquea preventivamente salidas IA sin alcance seguro mientras exista una empresa protegida. No es un apagado global: no detiene trabajos ya enviados, bots ya programados, cuentas externas, cargas a almacenamiento ni ingestión configurada fuera del código. Documentar quién, qué, cuándo y por qué. No apagar servicios o destruir evidencia indiscriminadamente.

Según el brief recibido, avisar a la empresa dentro de las 24 horas de ocurrencia o conocimiento. La versión inicial calcula conservadoramente desde la más temprana de ambas fechas conocidas; la interpretación contractual debe confirmarse jurídicamente. El reloj corre en horas transcurridas, también fines de semana. Una detección tardía no oculta el atraso. No esperar contención ni informe final para el aviso inicial.

El responsable de cuenta envía el aviso al correo pactado y registra evidencia de envío y, cuando sea posible, recepción. Si no hay acuse, verificar entrega y escalar por canal alterno acordado. El módulo NO envía correos ni garantiza atención 24/7. Una persona responsable y su suplente deben vigilar el plazo hasta implementar alertas verificadas.

### Plantilla de aviso inicial

Asunto: Aviso inicial de incidente de seguridad — [empresa / contrato / ID]

Fecha/hora y zona de ocurrencia [conocida o por determinar]; conocimiento [hora]; descripción de hechos confirmados [texto]; información/servicios potencialmente afectados [categorías y alcance, sin adjuntar datos sensibles]; impactos conocidos y aspectos en investigación [texto]; medidas de contención [texto]; responsable de contacto [datos]; próxima actualización [fecha/hora]; acciones solicitadas a la empresa [si aplica].

No presentar hipótesis como hechos. Si falta información, indicar que se ampliará. Revisar con asesoría las notificaciones adicionales a autoridades o titulares; el aviso contractual no las sustituye.

## 4. Recuperación

Validar credenciales, configuraciones y limpieza del entorno; restaurar desde un punto verificado; comprobar integridad, permisos y aislamiento; probar el servicio con datos sintéticos. El técnico propone restablecimiento y el coordinador lo autoriza documentadamente. Monitorear recaídas y mantener alternativa manual. Definir RTO/RPO específicos antes de comprometer continuidad.

Una vez controlado, enviar a la empresa el detalle y plan de remediación: cronología, alcance final conocido, causa raíz o hipótesis pendiente, datos/sistemas afectados, evidencias pertinentes, medidas ejecutadas, acciones preventivas con responsables/fechas, pendientes y contacto. Conservar referencia del informe enviado.

## 5. Aprendizaje y cierre

Realizar revisión sin culpabilización, actualizar riesgos y controles, verificar acciones y formar al equipo. Cerrar solo con contención, recuperación, causa raíz, remediación, evidencia de notificación e informe posterior y lecciones registradas. Si la causa sigue sin confirmarse, documentar explícitamente esa limitación y mantener el seguimiento abierto; no inventarla para cerrar el formulario.

Ejercicio de aceptación: simular una filtración entre clientes con datos ficticios, medir aviso/contención, probar relevo del suplente y restauración. No enviar avisos de prueba a una empresa real sin coordinación. Guardar acta y corregir las brechas antes de declarar operativo el procedimiento.
