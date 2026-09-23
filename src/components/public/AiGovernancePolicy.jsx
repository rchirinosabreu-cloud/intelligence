import React from 'react';
import LegalLayout from './LegalLayout';

const Status = ({ children }) => (
  <span className="inline-flex rounded-full border border-brand-green/30 bg-brand-green/10 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-brand-green-deep dark:text-brand-green">
    {children}
  </span>
);

const ControlCard = ({ title, children }) => (
  <article className="min-w-0 rounded-2xl border border-zinc-200 bg-white p-5 dark:border-white/10 dark:bg-zinc-900">
    <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
      <h3 className="m-0 text-base font-bold text-zinc-900 dark:text-zinc-50">{title}</h3>
      <Status>Implementado</Status>
    </div>
    <div className="text-sm leading-6 text-zinc-600 dark:text-zinc-300">{children}</div>
  </article>
);

const AiGovernancePolicy = () => (
  <LegalLayout title="Seguridad y uso responsable de la inteligencia artificial" sectionLabel="Confianza digital">
    <div className="space-y-10">
      <section className="rounded-3xl bg-brain-gradient-primary p-6 text-white shadow-sm md:p-8">
        <p className="m-0 text-xs font-bold uppercase tracking-[0.2em] text-white/80">Marco de BrainStudio</p>
        <p className="mb-0 mt-4 max-w-3xl text-base leading-7 text-white md:text-lg">
          BrainStudio protege la información y reduce los riesgos del uso de inteligencia artificial mediante controles técnicos, reglas de desarrollo, supervisión humana y responsabilidades para quienes usan la plataforma. La IA apoya el trabajo: no reemplaza el criterio profesional ni la autorización de una persona en decisiones sensibles.
        </p>
      </section>

      <section aria-labelledby="alcance-title">
        <h2 id="alcance-title" className="border-b border-zinc-200 pb-3 text-xl font-bold dark:border-white/10">Alcance y estado</h2>
        <p>
          Este documento describe los controles comprobables de la plataforma y las prácticas que orientan su operación. Es un marco público de seguridad y gobernanza en evolución; <strong>no constituye una certificación</strong> ISO 27001, ISO 42001 ni una auditoría independiente.
        </p>
        <div className="mt-5">
          <div className="rounded-2xl border border-brand-green/30 bg-brand-green/10 p-5">
            <Status>Implementado</Status>
            <p className="mb-0 mt-3 text-sm text-zinc-700 dark:text-zinc-200">Control presente en el producto o en su proceso técnico y respaldado por código, pruebas o reglas operativas.</p>
          </div>
        </div>
      </section>

      <section aria-labelledby="controls-title">
        <h2 id="controls-title" className="border-b border-zinc-200 pb-3 text-xl font-bold dark:border-white/10">Controles implementados</h2>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <ControlCard title="Identidad y acceso">
            <p>La plataforma exige autenticación, verifica que la cuenta y la persona sigan activas, permite revocar sesiones y aplica permisos por rol y módulo. Las operaciones sensibles vuelven a comprobar los permisos en el servidor.</p>
          </ControlCard>
          <ControlCard title="Protección de datos y secretos">
            <p>Las llaves de proveedores se gestionan en el servidor. Los tokens de integraciones se almacenan cifrados y los registros ocultan parámetros sensibles. Los mensajes de error del servidor se depuran antes de llegar al navegador.</p>
          </ControlCard>
          <ControlCard title="Ciberseguridad de la aplicación">
            <p>Se aplican orígenes permitidos, encabezados de seguridad, límites de solicitudes, validación de cargas y rutas de almacenamiento, límites de tamaño y defensas frente a solicitudes hacia redes privadas.</p>
          </ControlCard>
          <ControlCard title="Integraciones verificadas">
            <p>Los webhooks que entran sin sesión requieren firma criptográfica sobre el cuerpo original. Las conexiones externas usan credenciales protegidas y validaciones específicas antes de procesar información.</p>
          </ControlCard>
          <ControlCard title="Respuestas de IA controladas">
            <p>Las salidas estructuradas se limpian y validan antes de usarse. Los flujos críticos comprueban esquemas, referencias y cifras; una respuesta incompleta o contradictoria no se convierte silenciosamente en un resultado aprobado.</p>
          </ControlCard>
          <ControlCard title="Defensa frente a instrucciones maliciosas">
            <p>Los nombres, documentos, capturas y textos proporcionados se tratan como datos, nunca como órdenes para el sistema. Los prompts prohíben obedecer instrucciones incrustadas en esas fuentes y existen casos de prueba para este riesgo.</p>
          </ControlCard>
          <ControlCard title="Evidencia y trazabilidad">
            <p>Los procesos editoriales y de reportes conservan fuentes, versiones, huellas y decisiones. Las conclusiones deben apuntar a evidencia válida y una modificación posterior puede invalidar resultados anteriores.</p>
          </ControlCard>
          <ControlCard title="Supervisión humana">
            <p>La IA puede analizar, sugerir y detectar; las aprobaciones relevantes corresponden a responsables autorizados. Una omisión del modelo no demuestra que un hallazgo se resolvió y una prueba simulada no se presenta como validación productiva.</p>
          </ControlCard>
        </div>
      </section>

      <section aria-labelledby="team-title">
        <h2 id="team-title" className="border-b border-zinc-200 pb-3 text-xl font-bold dark:border-white/10">Uso responsable por parte del equipo</h2>
        <p>Quienes trabajan con BrainStudio o con herramientas de IA relacionadas deben:</p>
        <ul>
          <li>Usar únicamente cuentas, módulos e integraciones autorizadas para su función.</li>
          <li>No introducir contraseñas, tokens, llaves privadas ni secretos técnicos en conversaciones o documentos enviados a un modelo.</li>
          <li>Evitar enviar información confidencial o datos personales a herramientas de IA no autorizadas por la empresa.</li>
          <li>Comprobar cifras, fuentes, nombres, derechos de uso y afirmaciones importantes antes de publicar o entregar.</li>
          <li>Informar cuando un contenido o análisis fue generado o asistido por IA si su contexto lo exige.</li>
          <li>No utilizar IA para suplantar personas, discriminar, manipular evidencia, vulnerar derechos o eludir controles de acceso.</li>
          <li>Reportar resultados peligrosos, filtraciones, accesos indebidos o comportamientos inesperados.</li>
        </ul>
      </section>

      <section aria-labelledby="lifecycle-title">
        <h2 id="lifecycle-title" className="border-b border-zinc-200 pb-3 text-xl font-bold dark:border-white/10">Ciclo de control</h2>
        <ol>
          <li><strong>Acceso:</strong> la persona y sus permisos se validan antes de operar.</li>
          <li><strong>Entrada:</strong> archivos, campos, enlaces y contexto pasan controles técnicos.</li>
          <li><strong>Procesamiento:</strong> las credenciales permanecen en el servidor y el uso se limita.</li>
          <li><strong>Validación:</strong> la salida se contrasta con esquemas, evidencia y reglas del proceso.</li>
          <li><strong>Decisión:</strong> una persona autorizada revisa los resultados cuando existe impacto relevante.</li>
          <li><strong>Trazabilidad:</strong> se conservan versiones, actores, fuentes o eventos según el flujo.</li>
        </ol>
      </section>

      <section aria-labelledby="incident-title" className="rounded-2xl border border-zinc-200 bg-zinc-50 p-6 dark:border-white/10 dark:bg-zinc-900">
        <h2 id="incident-title" className="mt-0 text-xl font-bold">Gestión de incidentes</h2>
        <p className="mb-2">Debe reportarse de inmediato cualquier sospecha de:</p>
        <ul className="mb-5">
          <li>exposición de credenciales o información confidencial;</li>
          <li>acceso no autorizado o permisos incorrectos;</li>
          <li>uso de una herramienta de IA no autorizada con datos de la empresa o de clientes;</li>
          <li>resultado falso, discriminatorio, dañino o publicado sin la revisión requerida.</li>
        </ul>
        <p className="mb-0 text-sm">Canal de contacto: <a href="mailto:labs@brainstudioagencia.com" className="font-semibold text-brand-cyan-deep underline underline-offset-4 dark:text-brand-cyan">labs@brainstudioagencia.com</a>.</p>
      </section>

      <p className="text-sm text-zinc-500 dark:text-zinc-400">Última actualización: 22 de septiembre de 2026.</p>
    </div>
  </LegalLayout>
);

export default AiGovernancePolicy;
