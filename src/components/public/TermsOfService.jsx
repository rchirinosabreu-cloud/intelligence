import React from 'react';
import LegalLayout from './LegalLayout';

const TermsOfService = () => {
  return (
    <LegalLayout title="Términos y Condiciones del Servicio">
      <section className="space-y-6">
        <p>
          Bienvenido a <strong>BrainStudio OS</strong>. Al acceder y utilizar nuestra plataforma de reporte y análisis, usted acepta cumplir con los siguientes términos de uso.
        </p>

        <h2 className="text-xl font-bold pt-4 border-b border-zinc-100 dark:border-zinc-800 pb-2">1. Uso Responsable de la Plataforma</h2>
        <p>
          BrainStudio OS es una herramienta diseñada para el análisis estratégico y la gestión operativa de marketing. Los usuarios se comprometen a:
        </p>
        <ul className="list-disc pl-6 space-y-2">
          <li>Utilizar la información generada de manera ética y profesional.</li>
          <li>No intentar realizar ingeniería inversa, hackear o comprometer la seguridad de la plataforma.</li>
          <li>Mantener la confidencialidad de sus credenciales de acceso.</li>
        </ul>

        <h2 className="text-xl font-bold pt-4 border-b border-zinc-100 dark:border-zinc-800 pb-2">2. Propiedad Intelectual</h2>
        <p>
          Todo el software, diseño, logotipos y estructuras de análisis son propiedad exclusiva de <strong>BrainStudio Agencia de Crecimiento</strong>. El uso de la plataforma no otorga derechos de propiedad sobre los sistemas ni sobre las metodologías patentadas por la agencia.
        </p>

        <h2 className="text-xl font-bold pt-4 border-b border-zinc-100 dark:border-zinc-800 pb-2">3. Exactitud de los Datos</h2>
        <p>
          Si bien nuestra plataforma extrae datos en tiempo real de APIs oficiales (Meta, Fireflies, etc.), no nos hacemos responsables por discrepancias causadas por fallos técnicos en dichas plataformas externas o retrasos en la actualización de sus métricas.
        </p>

        <h2 className="text-xl font-bold pt-4 border-b border-zinc-100 dark:border-zinc-800 pb-2">4. Limitación de Responsabilidad</h2>
        <p>
          BrainStudio no será responsable de ninguna pérdida de beneficios o daños indirectos derivados del uso o la imposibilidad de uso de la plataforma por causas ajenas a nuestro control técnico directo.
        </p>

        <p className="text-sm text-zinc-500 pt-8">
          Para cualquier consulta legal, contáctenos en <a href="mailto:labs@brainstudioagencia.com" className="text-indigo-600 dark:text-indigo-400">labs@brainstudioagencia.com</a>.
        </p>
      </section>
    </LegalLayout>
  );
};

export default TermsOfService;
