import React from 'react';
import LegalLayout from './LegalLayout';

const PrivacyPolicy = () => {
  return (
    <LegalLayout title="Política de Privacidad">
      <section className="space-y-6">
        <p>
          En <strong>BrainStudio Agencia de Crecimiento</strong>, la privacidad y seguridad de los datos de nuestros clientes es nuestra prioridad absoluta. Esta Política de Privacidad describe cómo recopilamos, utilizamos y protegemos la información a través de nuestra plataforma <strong>BrainStudio Metrics</strong>.
        </p>

        <h2 className="text-xl font-bold pt-4 border-b border-zinc-100 dark:border-zinc-800 pb-2">1. Acceso a Datos de Meta (Facebook/Instagram)</h2>
        <p>
          BrainStudio Metrics utiliza la API de Meta for Developers para acceder a métricas de rendimiento de las cuentas conectadas. Este acceso se realiza bajo los siguientes términos:
        </p>
        <ul className="list-disc pl-6 space-y-2">
          <li><strong>Finalidad Exclusiva:</strong> El acceso a los datos se limita exclusivamente a la visualización de métricas de rendimiento (alcance, impresiones, interacciones y resultados de anuncios) para la generación de reportes estratégicos internos de la agencia y sus clientes.</li>
          <li><strong>No Compartición:</strong> BrainStudio no vende, alquila ni comparte los datos obtenidos de la API de Meta con terceros ni con empresas externas.</li>
          <li><strong>Alcance de Datos:</strong> Solo accedemos a datos estadísticos agregados y metadatos de activos publicitarios. No accedemos a información personal privada de los seguidores o audiencias más allá de lo que la API de Meta proporciona de forma estándar para análisis de marketing.</li>
        </ul>

        <h2 className="text-xl font-bold pt-4 border-b border-zinc-100 dark:border-zinc-800 pb-2">2. Revocación de Acceso</h2>
        <p>
          El usuario puede revocar el acceso de nuestra aplicación a sus datos de Meta en cualquier momento a través de la configuración de "Integraciones" dentro de la plataforma o directamente desde la configuración de aplicaciones en su cuenta de Facebook/Business Manager.
        </p>

        <h2 className="text-xl font-bold pt-4 border-b border-zinc-100 dark:border-zinc-800 pb-2">3. Eliminación de Datos de Usuario</h2>
        <p>
          Cumplimos estrictamente con las políticas de Meta sobre la eliminación de datos. Si un usuario desea eliminar sus datos de nuestra base de datos o desconectar permanentemente sus activos de nuestra plataforma, puede hacerlo de forma autónoma desde el panel de control o mediante una solicitud formal.
        </p>
        <div className="bg-zinc-50 dark:bg-zinc-900/50 p-6 rounded-xl border border-zinc-100 dark:border-zinc-800 mt-4">
          <p className="font-bold text-zinc-900 dark:text-zinc-100 mb-2 underline decoration-indigo-600 underline-offset-4">Instrucciones para la Eliminación de Datos:</p>
          <p className="text-sm">
            Para solicitar la eliminación definitiva de sus datos de integración o cualquier información almacenada en nuestra plataforma, por favor contacte a nuestro equipo técnico en:
            <a href="mailto:labs@brainstudioagencia.com" className="ml-1 text-indigo-600 dark:text-indigo-400 font-medium">labs@brainstudioagencia.com</a>.
          </p>
        </div>

        <h2 className="text-xl font-bold pt-4 border-b border-zinc-100 dark:border-zinc-800 pb-2">4. Seguridad</h2>
        <p>
          Implementamos medidas de seguridad técnicas (encriptación AES-256 para tokens de acceso) y organizativas para proteger su información contra accesos no autorizados o alteraciones.
        </p>

        <p className="text-sm text-zinc-500 pt-8">
          Última actualización: Febrero de 2025.
        </p>
      </section>
    </LegalLayout>
  );
};

export default PrivacyPolicy;
