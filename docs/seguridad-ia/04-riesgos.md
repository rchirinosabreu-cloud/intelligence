# Matriz inicial de riesgos de IA

Versión 0.1 · 23 de septiembre de 2026 · INTERNO · Escenarios propuestos, no evaluación aprobada

Responsable general de la gestión y seguimiento de estos riesgos: **Rodny Chirinos**. Suplente: **Francisco Villa**. Las áreas indicadas en la matriz son apoyos de ejecución y revisión; no sustituyen esta responsabilidad general ni significan que los controles ya estén aprobados.

## Metodología propuesta

Por contrato y sistema: describir activo/datos, amenaza, causa, consecuencia y alcance. Probabilidad de 1 (rara) a 5 (muy probable); impacto de 1 (menor) a 5 (crítico), considerando personas, obligaciones, operación y reputación. Puntuar inherente P×I y residual después de controles probados. Documentar justificación, evidencia y responsable. La ausencia de incidentes previos no demuestra probabilidad baja.

La primera versión usa umbral residual conservador ≤4/25 para permitir una autorización en el flujo cubierto. Es una regla técnica propuesta, no exigencia del cliente ni garantía de riesgo cero. Dirección y asesoría deben ratificar o ajustar la metodología antes de producción. No marcar «Mitigado» por tener un plan: hacen falta controles implementados y evidencia. El servidor comprueba completitud y umbral; no verifica la calidad o veracidad del análisis.

| ID / escenario | Consecuencia | Controles a implantar o verificar | Evidencia mínima | Apoyos de ejecución propuestos |
| --- | --- | --- | --- | --- |
| R01 Datos enviados sin permiso | Incumplimiento contractual y exposición | Aviso previo, autorización por alcance y bloqueo en TODAS las salidas | Pruebas de denegación y expediente firmado | Cuenta + técnico |
| R02 Fuga entre empresas | Pérdida de confidencialidad | Aislamiento de consultas, memoria y archivos; pruebas cruzadas | Test cliente A/B, revisión de accesos | Técnico |
| R03 Retención/entrenamiento del proveedor no aprobado | Uso secundario y transferencia no prevista | Contrato de tratamiento, configuración por producto, minimización | Contrato, configuración fechada y validación | Jurídico + técnico |
| R04 Inyección en documentos o prompts | Exfiltración o acción no autorizada | Separar instrucciones/datos, mínimos permisos, confirmación humana | Evaluaciones adversariales y registro de bloqueos | Técnico |
| R05 Alucinación o error de cifras | Entrega incorrecta y daño reputacional | Fuentes, validación de cifras, revisión humana previa | Lista de comprobación y aprobación de entrega | Responsable del entregable |
| R06 Derechos de autor, marca, imagen o secretos | Reclamos de terceros y divulgación | Verificar derechos de insumos y salida, evitar suplantación | Licencias, permisos y trazabilidad de revisión | Creativo + jurídico |
| R07 Credenciales robadas o abuso de API | Acceso indebido, extracción y costos | MFA donde exista, secretos de servidor, rotación, límites y alertas | Revisión de cuentas, prueba de revocación | Técnico |
| R08 Proveedor o plataforma indisponible | Incumplimiento de continuidad | Procedimiento manual, respaldo, restauración y límites de reintento | Simulacro medido; RTO/RPO aprobados | Operaciones + técnico |
| R09 Incidente avisado tarde | Afectación a la empresa y penalidades | Coordinador/suplente, reloj 24 h, alertas, canal alterno | Simulacro y evidencia de entrega | Seguridad + cuenta |
| R10 Sesgo o resultado perjudicial | Afectación de personas | Prohibir decisiones autónomas sensibles, revisión y canal de reclamo | Evaluación de sesgo y revisión humana | Dirección + equipo |
| R11 Cambio silencioso de modelo o finalidad | Autorización deja de cubrir el uso | Versiones vinculadas y nueva autorización | Prueba de cambio de modelo/versión | Técnico + cuenta |
| R12 Empleados usando cuentas personales | Pérdida de control fuera de la plataforma | Inventario, formación, cuentas corporativas y controles de equipo | Aceptación de política y revisión de cuentas | Dirección |
| R13 Bloqueo preventivo transversal | Interrupción de funciones compartidas al proteger una empresa | Identificar cliente/finalidad en cada flujo, comunicar impacto, alternativas manuales, vigilar errores; nunca desactivar para eludir autorización | Prueba de alcance conocido/desconocido y aprobación interna de activación | Técnico + operaciones |

Para cada fila completar: contrato [ ], cliente [ ], sistema/modelo [ ], responsable **Rodny Chirinos**, suplente **Francisco Villa**, ejecutores de acciones [ ], P/I inherentes [ ], justificación [ ], controles existentes [ ], brechas [ ], acciones/fechas [ ], prueba [ ], P/I residuales [ ], decisión de Dirección [ ], revisión [ ]. Las valoraciones están deliberadamente pendientes: no hay evidencia para declarar estos riesgos mínimos.

El registro permite varias evaluaciones. La autorización inicial se vincula a una evaluación concreta que debe cubrir el conjunto de escenarios aplicables al caso de uso; usar el mayor riesgo residual aplicable, no seleccionar solo una fila favorable. Pendiente evolución: matriz estructurada de múltiples escenarios con agregación automática.
