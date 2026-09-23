# Hoja de ruta de seguridad y gobernanza de IA

> **Documento interno de BrainStudio.** No publicar, enlazar desde la plataforma ni compartir como declaración contractual. Este documento registra brechas, decisiones recomendadas y trabajo pendiente; la página pública `/seguridad` describe únicamente controles vigentes y principios de uso.

**Estado:** propuesta de trabajo  
**Última actualización:** 22 de septiembre de 2026  
**Revisión sugerida:** trimestral y después de cualquier incidente relevante  
**Propietario sugerido:** Dirección, con un responsable técnico y un responsable de privacidad

## Criterios de prioridad

- **Prioridad 0:** reduce un riesgo inmediato de acceso, fuga de información o uso corporativo no controlado. Debe iniciarse antes de ampliar el uso de IA.
- **Prioridad 1:** consolida gobierno, trazabilidad y prevención sistemática. Debe entrar en el siguiente ciclo de producto y operaciones.
- **Prioridad 2:** aumenta madurez, auditabilidad y capacidad de certificación. Se ejecuta después de estabilizar P0 y P1.

Cada iniciativa debe tener un dueño nominal, fecha objetivo, evidencia de implementación, prueba de funcionamiento y una decisión explícita de cierre. Una tarea no termina solo porque exista código o un documento.

## Prioridad 0 — Contención y reglas corporativas

### 1. Política interna de uso aceptable de IA

**Objetivo:** establecer qué herramientas se pueden utilizar, con qué datos y para cuáles decisiones.

**Implementación:**

- Definir herramientas autorizadas, herramientas en evaluación y herramientas prohibidas.
- Prohibir el uso de cuentas personales con información de BrainStudio o de clientes.
- Exigir revisión humana antes de publicar, enviar a clientes o tomar decisiones sensibles.
- Definir usos prohibidos: suplantación, discriminación, manipulación de evidencia, evasión de permisos y carga de secretos.
- Registrar aceptación de la política y capacitar al equipo al ingresar y cada año.

**Responsable sugerido:** Dirección y responsable de seguridad.  
**Criterio de finalización:** política aprobada, versionada, comunicada y aceptada por todas las personas activas.

### 2. Clasificación de información y reglas de envío a IA

**Objetivo:** evitar que información sensible llegue a herramientas que no tienen autorización para procesarla.

**Implementación:**

- Clasificar información como Pública, Interna, Confidencial o Restringida.
- Definir por categoría si puede enviarse a IA, si debe anonimizarse o si está prohibida.
- Tratar credenciales, tokens, datos financieros detallados, información laboral sensible y documentos de identidad como Restringidos.
- Añadir ejemplos específicos de agencia: parrillas inéditas, accesos publicitarios, contratos, nómina, CRM y archivos de clientes.

**Responsable sugerido:** responsable de privacidad con líderes de cada área.  
**Criterio de finalización:** matriz aprobada, disponible internamente y aplicada a todos los flujos de IA inventariados.

### 3. MFA, SSO y sesiones web

**Objetivo:** reducir apropiación de cuentas y exposición por robo de tokens.

**Implementación:**

- Integrar SSO con Google Workspace o un proveedor corporativo equivalente.
- Exigir MFA para administradores, project managers, Finanzas y personas con acceso a integraciones.
- Diseñar la migración del JWT almacenado en `localStorage` hacia cookies `HttpOnly`, `Secure` y `SameSite`.
- Incorporar protección CSRF, expiración, rotación y cierre remoto de sesiones.

**Responsable sugerido:** líder técnico.  
**Criterio de finalización:** MFA obligatorio para roles sensibles, pruebas de revocación y sesiones sin tokens accesibles desde JavaScript.

### 4. Respuesta a incidentes

**Objetivo:** responder de forma consistente a filtraciones, accesos indebidos y fallos de IA.

**Implementación:**

- Definir severidades, canal de reporte, guardia responsable y tiempos de respuesta.
- Crear procedimientos para credencial expuesta, fuga entre clientes, publicación errónea, proveedor comprometido y salida dañina.
- Incluir contención, preservación de evidencia, comunicación, recuperación y análisis posterior.
- Realizar al menos un simulacro semestral.

**Responsable sugerido:** Dirección y líder técnico.  
**Criterio de finalización:** playbooks aprobados, responsables localizables y primer simulacro documentado.

### 5. Gestión y rotación de secretos

**Objetivo:** limitar el impacto de una llave expuesta.

**Implementación:**

- Inventariar claves de OpenAI, Google, Fireflies, almacenamiento, correo y OAuth.
- Guardarlas en el sistema de variables o gestor de secretos autorizado; nunca en código, documentos o chats.
- Definir dueño, alcance, fecha de creación, última rotación y procedimiento de revocación.
- Activar escaneo de secretos en repositorio y CI.

**Responsable sugerido:** líder técnico.  
**Criterio de finalización:** inventario completo, secretos sin propietario corregidos y prueba documentada de rotación de emergencia.

## Prioridad 1 — Plataforma de control de IA

### 6. Pasarela central de IA

**Objetivo:** evitar que cada módulo aplique controles diferentes o llame directamente a proveedores sin trazabilidad común.

**Implementación:**

- Centralizar llamadas, autenticación, límites, tiempos de espera, reintentos y presupuestos.
- Registrar módulo, actor, cliente, proveedor, modelo, versión de prompt, esquema y consumo.
- Prohibir el registro de prompts o respuestas con datos sensibles sin una política explícita de retención.
- Aplicar validación estructurada y códigos de error homogéneos.

**Responsable sugerido:** equipo de plataforma.  
**Criterio de finalización:** todos los flujos productivos de IA pasan por la pasarela o tienen una excepción documentada y aprobada.

### 7. Prevención de fuga de datos

**Objetivo:** detectar y bloquear información sensible antes de enviarla a un modelo.

**Implementación:**

- Incorporar reglas de DLP para contraseñas, tokens, identificadores, teléfonos, correos y datos financieros.
- Añadir anonimización o seudonimización por cliente y caso de uso.
- Mostrar advertencias accionables y registrar bloqueos sin guardar el secreto detectado.
- Diseñar excepciones autorizadas, con actor, motivo, duración y auditoría.

**Responsable sugerido:** seguridad y plataforma.  
**Criterio de finalización:** corpus de prueba aprobado, bloqueos verificados y cero secretos completos en logs.

### 8. Registro de modelos, prompts y riesgos

**Objetivo:** saber dónde se usa IA, con qué configuración y cuál es el impacto posible.

**Implementación:**

- Inventariar módulo, propósito, dueño, proveedor, modelo, datos, prompt, esquema, retención y nivel de riesgo.
- Clasificar usos como bajo, medio, alto o crítico.
- Exigir aprobación humana y evaluación reforzada para niveles alto y crítico.
- Mantener candidatas separadas de configuraciones productivas.

**Responsable sugerido:** propietario de IA y líderes de producto.  
**Criterio de finalización:** ningún flujo productivo queda fuera del registro y cada cambio relevante conserva versión y aprobación.

### 9. Evaluaciones y red teaming

**Objetivo:** medir fallos antes de promover modelos o prompts.

**Implementación:**

- Crear pruebas para prompt injection, fuga entre clientes, alucinación, evidencia inventada, sesgo y archivos maliciosos.
- Usar casos reales anonimizados y adjudicados, además de casos sintéticos.
- Comparar candidatos sobre el mismo corpus y conservar costo, latencia y errores por categoría.
- Establecer umbrales de promoción y regresión.

**Responsable sugerido:** propietario de IA con validadores de negocio.  
**Criterio de finalización:** suite recurrente en CI y reporte de evaluación obligatorio antes de cada promoción.

### 10. Rate limiting distribuido y presupuestos

**Objetivo:** controlar abuso y consumo entre varias réplicas del backend.

**Implementación:**

- Migrar los límites en memoria a Redis o almacenamiento compartido.
- Definir cuotas por usuario, módulo y organización.
- Alertar sobre picos, errores reiterados y costos anómalos.
- Establecer límites diarios o mensuales con degradación segura.

**Responsable sugerido:** plataforma y Finanzas.  
**Criterio de finalización:** límites consistentes entre réplicas, alertas verificadas y tablero mensual de consumo.

### 11. Evaluación de proveedores y privacidad

**Objetivo:** conocer el tratamiento externo de los datos.

**Implementación:**

- Registrar datos enviados, ubicación, retención, subprocesadores y uso para entrenamiento.
- Revisar términos, medidas de seguridad, eliminación y respuesta a incidentes.
- Definir una evaluación previa para nuevos proveedores o nuevas categorías de datos.
- Mantener contratos y decisiones vinculados al inventario de IA.

**Responsable sugerido:** Dirección, privacidad y compras.  
**Criterio de finalización:** evaluación vigente de cada proveedor productivo y prohibición técnica u operativa de proveedores no aprobados.

## Prioridad 2 — Observabilidad y aseguramiento

### 12. Auditoría central y SIEM

**Objetivo:** detectar comportamientos anómalos y reconstruir eventos.

**Implementación:**

- Centralizar autenticaciones, permisos, exportaciones, acciones administrativas, llamadas de IA e incidentes.
- Enviar señales relevantes a un SIEM o servicio de alertas.
- Crear alertas por intentos fallidos, escalada de permisos, exportación masiva y consumo atípico.
- Definir acceso, retención e integridad de los registros.

**Responsable sugerido:** seguridad y plataforma.  
**Criterio de finalización:** alertas de prueba recibidas, investigación reproducible y acceso a logs restringido.

### 13. Seguridad automatizada del desarrollo

**Objetivo:** detectar vulnerabilidades antes del despliegue.

**Implementación:**

- Integrar SAST, análisis de dependencias, escaneo de contenedores y detección de secretos.
- Añadir DAST sobre un entorno no productivo.
- Definir severidades que bloquean despliegues y plazos de corrección.
- Mantener excepciones temporales con dueño y vencimiento.

**Responsable sugerido:** equipo técnico.  
**Criterio de finalización:** controles activos en CI, política de bloqueo aprobada y cero excepciones vencidas.

### 14. Retención, eliminación y recuperación

**Objetivo:** conservar únicamente lo necesario y demostrar recuperación.

**Implementación:**

- Crear una matriz para prompts, respuestas, transcripciones, archivos, evidencias, logs y auditorías.
- Automatizar eliminación o anonimización cuando corresponda.
- Documentar RPO y RTO de sistemas críticos.
- Ejecutar restauraciones de prueba y registrar resultados.

**Responsable sugerido:** plataforma, privacidad y propietarios de datos.  
**Criterio de finalización:** matriz aplicada, tareas automáticas monitoreadas y simulacro de restauración exitoso.

### 15. Auditoría independiente y ruta de certificación

**Objetivo:** validar externamente la madurez alcanzada.

**Implementación:**

- Realizar pentest independiente después de cerrar las medidas P0.
- Evaluar brechas frente a ISO/IEC 27001 e ISO/IEC 42001.
- Priorizar un plan realista de evidencias, responsables y auditorías internas.
- No comunicar certificación hasta obtenerla formalmente.

**Responsable sugerido:** Dirección.  
**Criterio de finalización:** informe independiente recibido, hallazgos priorizados y decisión formal sobre certificación.

## Seguimiento sugerido

Mantener un registro privado con estas columnas:

| Iniciativa | Prioridad | Responsable | Estado | Fecha objetivo | Evidencia | Riesgo residual |
|---|---:|---|---|---|---|---|
| Política interna de IA | P0 | Por asignar | Propuesta | Por definir | Documento aprobado y aceptaciones | Por evaluar |
| Clasificación de información | P0 | Por asignar | Propuesta | Por definir | Matriz aplicada | Por evaluar |
| MFA y sesiones | P0 | Por asignar | Propuesta | Por definir | Pruebas técnicas | Por evaluar |
| Respuesta a incidentes | P0 | Por asignar | Propuesta | Por definir | Simulacro | Por evaluar |
| Pasarela central de IA | P1 | Por asignar | Propuesta | Por definir | Registro de cobertura | Por evaluar |

## Regla de publicación

La existencia de esta hoja de ruta no prueba que sus medidas estén implementadas. Una capacidad puede pasar a la página pública `/seguridad` únicamente cuando exista evidencia técnica u operativa verificable, tenga responsable y haya superado el criterio de finalización correspondiente.
