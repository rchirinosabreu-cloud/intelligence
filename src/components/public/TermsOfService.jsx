import React from 'react';
import { Link } from 'react-router-dom';
import LegalLayout from './LegalLayout';
import { LEGAL_ENTITY as E } from './legalEntity';

// Términos y condiciones (versión 2.0, 27 de septiembre de 2026). Redactados para la operación
// real de la plataforma; no sustituyen el contrato de servicios firmado con cada cliente.

const H2 = ({ children }) => (
  <h2 className="border-b border-zinc-100 pb-2 pt-4 text-xl font-bold dark:border-zinc-800">{children}</h2>
);

const linkClass = 'font-medium text-brand-cyan-deep underline underline-offset-4 dark:text-brand-cyan';

const TermsOfService = () => (
  <LegalLayout title="Términos y condiciones de uso">
    <section className="space-y-6">
      <p>
        Estos términos regulan el acceso y uso de <strong>{E.platform}</strong> ({E.platformUrl}), la plataforma operativa de <strong>{E.name}</strong>, NIT {E.nit}, con domicilio en {E.address} («Brainstudio»). Al acceder o usar la plataforma, incluido el portal de revisión de contenidos y las propuestas comerciales compartidas por enlace, usted acepta estos términos.
      </p>

      <H2>1. Quién puede usar la plataforma</H2>
      <p>
        La plataforma es de uso interno del equipo de Brainstudio y de sus clientes en las superficies habilitadas para ellos. Las cuentas se crean únicamente por un administrador de Brainstudio; no existe registro abierto. Si usted accede en nombre de una empresa, declara que tiene autorización para hacerlo.
      </p>

      <H2>2. Cuentas, acceso y seguridad</H2>
      <ul className="list-disc space-y-2 pl-6">
        <li>Cada cuenta es personal e intransferible. Está prohibido compartir credenciales.</li>
        <li>El usuario debe custodiar su contraseña y, cuando la tenga activa, su verificación en dos pasos y sus códigos de respaldo.</li>
        <li>Debe informar de inmediato a {E.email} cualquier acceso no autorizado, pérdida del dispositivo de verificación o sospecha de incidente.</li>
        <li>Brainstudio puede suspender o revocar un acceso ante riesgo de seguridad, incumplimiento de estos términos o terminación de la relación laboral o contractual.</li>
      </ul>

      <H2>3. Uso aceptable</H2>
      <p>El usuario se compromete a:</p>
      <ul className="list-disc space-y-2 pl-6">
        <li>usar la plataforma solo para los fines profesionales para los que se le dio acceso;</li>
        <li>no intentar vulnerar su seguridad, hacer ingeniería inversa, extraer datos masivamente ni eludir controles de acceso;</li>
        <li>no cargar contenido ilícito, que infrinja derechos de terceros o que contenga software malicioso;</li>
        <li>no introducir contraseñas, llaves o secretos técnicos en los campos que se procesan con inteligencia artificial;</li>
        <li>respetar la confidencialidad de la información de Brainstudio y de sus clientes.</li>
      </ul>

      <H2>4. Uso de inteligencia artificial</H2>
      <ul className="list-disc space-y-2 pl-6">
        <li>Algunas funciones usan modelos de inteligencia artificial de proveedores externos (actualmente OpenAI) para analizar, resumir, revisar o proponer contenidos, minutas y reportes.</li>
        <li>Los resultados generados con IA son <strong>asistencia, no decisiones</strong>: pueden contener errores y siempre deben ser revisados por una persona antes de usarse, entregarse o publicarse. Las aprobaciones relevantes corresponden a responsables autorizados.</li>
        <li>Brainstudio usa estos servicios mediante acceso empresarial por API, bajo condiciones en las que el proveedor no utiliza la información enviada para entrenar sus modelos.</li>
        <li>No se usan sistemas de IA para tomar decisiones con efectos jurídicos o significativos sobre personas sin intervención humana.</li>
        <li>El marco de seguridad y uso responsable de la IA se publica en <Link to="/seguridad" className={linkClass}>Seguridad e IA</Link>.</li>
      </ul>

      <H2>5. Información y datos del cliente</H2>
      <ul className="list-disc space-y-2 pl-6">
        <li>La información, los materiales y los datos que el cliente entrega o que se generan para él siguen siendo del cliente.</li>
        <li>Cuando Brainstudio trata datos personales por cuenta de un cliente, actúa como <strong>Encargado del tratamiento</strong> en los términos de la Ley 1581 de 2012: los usa solo para prestar el servicio y según sus instrucciones, no los vende ni los usa para otros clientes.</li>
        <li>Al terminar el servicio, la información del cliente se devuelve o se elimina según lo pactado, salvo lo que deba conservarse por obligación legal.</li>
        <li>El tratamiento de datos personales se rige por la <Link to="/privacidad" className={linkClass}>Política de tratamiento de datos personales</Link>.</li>
      </ul>

      <H2>6. Confidencialidad</H2>
      <p>
        Brainstudio y los usuarios mantendrán reservada la información no pública a la que accedan a través de la plataforma, y solo la usarán para los fines del servicio. Esta obligación continúa después de terminado el acceso.
      </p>

      <H2>7. Propiedad intelectual</H2>
      <p>
        El software, el diseño, los logotipos y las metodologías propias de la plataforma pertenecen a Brainstudio. El uso de la plataforma no concede derechos sobre ellos. La titularidad de los entregables producidos para cada cliente se rige por el contrato de servicios correspondiente.
      </p>

      <H2>8. Servicios de terceros</H2>
      <p>
        La plataforma se integra con servicios de terceros (por ejemplo Meta, Google, Fireflies y OpenAI). Su disponibilidad y la exactitud de los datos que entregan dependen de esos proveedores. Brainstudio no responde por fallas, cambios o demoras atribuibles a ellos, sin perjuicio de actuar con diligencia para mitigarlas.
      </p>

      <H2>9. Disponibilidad y responsabilidad</H2>
      <p>
        Brainstudio procura que la plataforma esté disponible y funcione correctamente, pero puede interrumpirse por mantenimiento, fallas técnicas o causas ajenas a su control. En la medida permitida por la ley, Brainstudio no será responsable por lucro cesante ni daños indirectos derivados del uso o la imposibilidad de uso de la plataforma. Nada de lo anterior limita los derechos que la ley colombiana reconoce de forma irrenunciable.
      </p>

      <H2>10. Cambios a estos términos</H2>
      <p>
        Brainstudio puede actualizar estos términos. La versión vigente y su fecha se publican en esta página; los cambios relevantes se informarán por la plataforma o por correo.
      </p>

      <H2>11. Ley aplicable y contacto</H2>
      <p>
        Estos términos se rigen por las leyes de la República de Colombia. Las controversias se resolverán ante los jueces competentes de Cartagena de Indias, sin perjuicio de los mecanismos de solución directa que acuerden las partes.
      </p>
      <p>
        Contacto: <a href={`mailto:${E.email}`} className={linkClass}>{E.email}</a> · <a href={E.phoneHref} className={linkClass}>{E.phone}</a> · {E.address}.
      </p>

      <p className="pt-8 text-sm text-zinc-500">Versión 2.0 · Vigente desde el 27 de septiembre de 2026.</p>
    </section>
  </LegalLayout>
);

export default TermsOfService;
