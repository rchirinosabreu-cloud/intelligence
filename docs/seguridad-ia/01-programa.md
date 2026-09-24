# Programa de gobierno de IA y seguridad de la información

Versión 0.1 · 23 de septiembre de 2026 · INTERNO

Estado: propuesta para aprobación de Dirección. No es una certificación, una auditoría integral ni una declaración de cumplimiento contractual. Responsable general de seguridad de la información, ciberseguridad y gobierno de IA: **Rodny Chirinos**. Suplente: **Francisco Villa**. Designación expresa de Rodny para todo el programa, incluido el piloto de PromoGroup. Próxima revisión: antes de habilitar el primer contrato y ante cambios materiales.

## Objetivo y primer alcance

Proteger los datos de la empresa contratante, reducir errores y usos indebidos, conservar evidencias de autorización y responder oportunamente a incidentes. Aplica al equipo, contratistas y herramientas externas utilizadas para prestar el servicio, no solo a la plataforma.

La implementación local ofrece inventario de sistemas, evaluaciones de riesgo por cliente/sistema, autorizaciones escritas, registro de incidentes e historial de cambios. `parrillas.review` identifica al cliente y permite análisis/verificación únicamente con autorización exacta cuando su control está activo. La ampliación del 23 de septiembre añade una puerta común a las salidas inventariadas de IA: los flujos sin alcance seguro se bloquean mientras exista alguna empresa protegida. El control sigue inicialmente desactivado y no se ha desplegado. Esto NO equivale a protección por defecto ni a un cortafuegos de toda la plataforma.

No introducir información de la empresa contratante en flujos no cubiertos hasta evaluar y autorizar su uso. Mientras se amplía la cobertura, operar esos entregables manualmente y con material sintético para las pruebas. Registrar y comunicar esta limitación al equipo.

## Piloto seleccionado: PromoGroup

Rodny seleccionó a **PromoGroup** como cliente piloto el 23 de septiembre de 2026. Estado: **PREPARACIÓN — NO ACTIVADO**. La elección está registrada en este plan interno, no como autorización contractual ni como cambio de configuración en producción. La identidad exacta del registro de cliente y su razón social están pendientes de comprobación; no crear un cliente duplicado ni asociar permisos solo por coincidencia de nombre.

El piloto pertenece al programa **Seguridad y gobierno de IA**: la página pública `/seguridad` explica los controles operativos comprobados; el espacio privado `/gobierno-ia` conserva su gestión y evidencia. No publicar el expediente ni el nombre del cliente piloto en la página pública sin autorización.

Alcance inicial propuesto: revisión editorial y verificación de hallazgos en parrillas (`parrillas.review`). Primera fase con contenido ficticio y proveedor simulado, sin copiar datos, documentos ni parrillas reales de PromoGroup. Minutas, reportes, memoria independiente y otros flujos compartidos quedan en bloqueo preventivo al activar cualquier empresa; todavía no operan con autorizaciones individualizadas. Las herramientas externas siguen fuera del control del código. Aprobar y comunicar este impacto transversal antes de activar el piloto.

Pendientes antes de activar el piloto con datos reales:

- [ ] Confirmar el registro existente de PromoGroup, su razón social y el contrato aplicable.
- [x] Designar responsable interno de seguridad y gobierno de IA: **Rodny Chirinos**; suplente: **Francisco Villa**.
- [ ] Confirmar contactos operativos y responsable de cuenta de PromoGroup. La designación anterior no concede permisos técnicos ni sustituye la autorización del cliente.
- [ ] Confirmar interlocutor facultado y correo contractual de PromoGroup.
- [ ] Verificar qué obligaciones del brief aplican a ese contrato. No se ha establecido que PromoGroup sea la empresa de la licitación. El mes de aviso y las 24 horas son requisitos de referencia del diseño, no hechos contractuales comprobados para PromoGroup.
- [ ] Completar inventario del proveedor/modelo y condiciones de tratamiento con evidencia real.
- [ ] Preparar y revisar la evaluación de riesgos del caso de uso, sin marcar riesgos como mitigados solo por planear controles.
- [ ] Obtener y verificar la autorización escrita necesaria, su alcance y fechas; cumplir la antelación que corresponda. La regla técnica actual exige un mes calendario y no debe eludirse con fechas ficticias.
- [ ] Probar denegación sin permiso, vigencia, cambio de modelo, revocación y registro de incidente con datos ficticios. Las comunicaciones simuladas deben identificarse como tales y no enviarse a destinatarios reales.
- [ ] Aprobar despliegue y activación específicos, con alternativa manual y revisión de los demás flujos de IA que puedan tratar datos del cliente.

Criterio de avance: expediente completo y validado, pruebas satisfactorias, responsables designados y aprobación explícita de activación. Mientras tanto, no activar bloqueos sobre operaciones reales, no enviar comunicaciones a PromoGroup ni presentar este piloto como operativo o autorizado por la empresa.

## Requisitos del brief y evidencia esperada

| Requisito | Primera entrega | Pendiente para poder declararlo operativo |
| --- | --- | --- |
| Declarar uso y tipo de IA | Plantilla y registro de sistemas | Inventario de cuentas/productos realmente contratados y firma de Dirección |
| Autorización previa escrita y aviso con un mes | Registro de referencias y bloqueo de parrillas por alcance, versión y vigencia | Correo real, autorización de representante facultado, verificación documental y activar control |
| Evaluar riesgos y mitigaciones | Registro con valoración inicial/residual y referencias de pruebas | Evaluar contrato real, probar controles y aceptar riesgo residual |
| Gestión integral de incidentes | Procedimiento y expediente con fases; Rodny Chirinos responsable y Francisco Villa suplente | Confirmar disponibilidad y contactos de guardia, canal de reporte, entrenamiento y simulacro |
| Notificación dentro de 24 horas | Cálculo de plazo e indicador de atraso | Envío humano, prueba de entrega y cobertura fuera del horario laboral; alertas automáticas pendientes |
| Datos personales, PI y secretos | Política propuesta y lista de revisión | Análisis jurídico, contratos con proveedores, derechos sobre insumos y transferencia internacional |
| Continuidad y ataques | Escenarios y plan de trabajo | Prueba de restauración, RTO/RPO aprobados, monitoreo y evidencias |

## Inventario técnico inicial: código, no constatación de producción

| Flujo | Evidencia de código | Situación del control nuevo |
| --- | --- | --- |
| Revisión y verificación de parrillas | `src/services/briaContentPlanReviewService.js`, `aiGovernanceGate.js` | Integrado; activación por cliente. Revalida antes de cada llamada. Con control activo excluye recuperación histórica/embeddings |
| Minutas automáticas y transcripciones | `minuteAutomationService.js`, `firefliesService.js`, `openAIClient.js` | Envíos IA y consultas Fireflies bloqueados por falta de alcance seguro cuando hay una empresa protegida. No detiene bots ya programados externamente |
| Indexación y búsqueda de memoria | `briaMemoryService.js`, `openAIClient.js` | Embeddings bloqueados preventivamente bajo la misma condición; no elimina índices existentes ni bloquea lecturas locales |
| Reportes y visión | `reportVisionService.js`, `routes/api/reports.js`, `aiEgress.js` | Llamadas directas y adaptador común protegidos; autorización individual pendiente. No bloquea cargas previas al almacenamiento |
| Chat, Manager, aprendizajes editoriales, triage de correo y Radar de Mérito | `openAIClient.js` | Solicitudes sin alcance seguro bloqueadas mientras haya una empresa protegida, incluso si la tarea parece interna |
| Proxies OpenAI/Fireflies y proveedores heredados | `proxyController.js`, `lib/ai/providers.ts` | Transporte protegido, sin aceptar un clientId del navegador como autorización |
| Búsqueda externa Discovery Engine | `discoveryService.js` | Valida antes de la búsqueda y cada alternativa; no detiene ingestión externa configurada en el proveedor |
| Invitaciones al bot Fireflies | `googleCalendarWriteReliability.js` | Valida antes de insertar/modificar un evento con asistentes del dominio fireflies.ai. Permite quitar al bot. Reuniones ya enviadas y otros bots requieren revisión manual |
| Herramientas de empleados fuera de la plataforma | Inventario por entrevista y cuentas corporativas | No inspeccionadas; requieren control organizacional y gestión de dispositivos/cuentas |

`src/config/aiConfig.js` configura OpenAI y modelos por variables de entorno. Los nombres por defecto NO demuestran qué modelo se usa en producción. Registrar identificador exacto desplegado, producto, cuenta, tipo, finalidad, categorías de información, región, retención, entrenamiento, subencargados, contrato y responsable. No copiar claves ni variables secretas al inventario. IA generativa y redes neuronales no son categorías mutuamente excluyentes: describir ambas cuando corresponda.

## Responsabilidades

- Dirección: aprueba política, recursos, excepciones y aceptación del riesgo. No firma una garantía sin evidencia y revisión jurídica.
- **Rodny Chirinos — responsable general:** gobierno de IA, seguridad de la información y ciberseguridad; coordinación del inventario, riesgos, autorizaciones, incidentes, evidencias y seguimiento de plazos para todos los clientes.
- **Francisco Villa — suplente:** asume la coordinación ante ausencia o indisponibilidad de Rodny, documentando el relevo y las decisiones. Su designación no acredita disponibilidad 24/7 ni concede accesos automáticamente.
- Líder técnico: controles, pruebas, despliegues, gestión de accesos, respaldos y recuperación.
- Responsable de cuenta: identifica contrato y destinatarios de la empresa; tramita avisos y autorización.
- Asesoría jurídica/privacidad: determina jurisdicción, roles de tratamiento, base jurídica, transferencias, PI, notificaciones regulatorias y alcance de responsabilidad.
- Equipo: minimización de datos, revisión humana y reporte inmediato. No aceptar salidas de IA como hechos comprobados.

## Hoja de ruta interna

1. Antes del primer uso contractual: confirmar contactos y disponibilidad de Rodny Chirinos y Francisco Villa y las personas de apoyo técnico, cuenta y jurídico; completar expediente de proveedores; confirmar correo de la empresa; aprobar política; recoger evidencia y activar control de parrillas. Si no se cumple el mes previo, no iniciar el uso de IA sujeto a esa cláusula.
2. Prioridad crítica: extender la misma decisión de autorización a minutas, grabación, embeddings, reportes, proxies, tareas programadas y herramientas externas; añadir clasificación real de cargas y pruebas de ausencia de salidas sin permiso.
3. Prioridad alta: notificaciones con cola persistente, reintentos, acuses y escalamiento; alertas de vencimiento; carga de evidencia con acceso restringido y retención; separación de quien prepara y quien aprueba.
4. Prioridad alta: minimización/redacción de datos, pruebas contra inyección de instrucciones, aislamiento entre clientes, MFA de cuentas privilegiadas, revisión de secretos y dependencias, registros sin contenido sensible.
5. Validación: simulacro de incidente, restauración de respaldo, indisponibilidad del proveedor, pruebas de segregación y evaluación de resultados de IA. Definir RTO/RPO con el negocio antes de prometerlos.
6. Operación continua: altas/bajas de usuarios, capacitación, revisión periódica de proveedores/riesgos y muestreo de salidas. Conservar evidencia fechada.

## Marco jurídico a validar

La jurisdicción aplicable y los roles de responsable/encargado se determinan con asesoría jurídica. No asumir que la autorización contractual sustituye la base jurídica para tratar datos personales. El plazo contractual de 24 horas no sustituye los deberes regulatorios. Revisar Ley 1581 de 2012 y normas aplicables en Colombia, la [Circular Externa 002 de 2024 de la SIC sobre IA](https://sedeelectronica.sic.gov.co/transparencia/normativa/circular-externa-2-de-2024-de-la-superintendencia-de-industria-y-comercio-lineamientos-sobre-el-tratamiento-de-datos), y las obligaciones contractuales y territoriales pertinentes del [RGPD](https://eur-lex.europa.eu/legal-content/EN/ALL/?uri=celex%3A32016R0679), en particular roles, seguridad, incidentes y transferencias. Esta lista no es exhaustiva ni una conclusión de cumplimiento.
