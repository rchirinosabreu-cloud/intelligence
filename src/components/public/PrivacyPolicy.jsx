import React from 'react';
import { Link } from 'react-router-dom';
import LegalLayout from './LegalLayout';
import { LEGAL_ENTITY as E } from './legalEntity';
import { PRIVACY_POLICY_VERSION } from '@/lib/privacyPolicy';

// Política de tratamiento de datos personales (Ley 1581 de 2012 y Decreto 1074 de 2015),
// versión 2.0 del 27 de septiembre de 2026. Redactada contra el inventario real de la
// plataforma: si se añade un proveedor, un formulario o un tipo de dato, esta página cambia
// en el mismo PR y sube PRIVACY_POLICY_VERSION (AGENTS.md, sección 17).

const H2 = ({ id, children }) => (
  <h2 id={id} className="scroll-mt-24 border-b border-zinc-100 pb-2 pt-4 text-xl font-bold dark:border-zinc-800">{children}</h2>
);
const H3 = ({ children }) => <h3 className="pt-2 text-base font-bold text-zinc-900 dark:text-zinc-100">{children}</h3>;
const List = ({ children }) => <ul className="list-disc space-y-2 pl-6">{children}</ul>;
const linkClass = 'font-medium text-brand-cyan-deep underline underline-offset-4 dark:text-brand-cyan';

const Row = ({ cells, head = false }) => (
  <tr className="border-b border-zinc-100 align-top dark:border-zinc-800">
    {cells.map((cell, index) => (head
      ? <th key={index} scope="col" className="px-3 py-2 text-left text-xs font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">{cell}</th>
      : <td key={index} className="px-3 py-2 text-sm text-zinc-600 dark:text-zinc-300">{cell}</td>))}
  </tr>
);

const PROCESSORS = [
  ['Railway Corp.', 'Alojamiento de la plataforma, base de datos y almacenamiento de archivos', 'Estados Unidos'],
  ['OpenAI, L.L.C.', 'Modelos de inteligencia artificial (análisis, resúmenes, revisión de contenidos, lectura de capturas de métricas, búsqueda en documentos)', 'Estados Unidos'],
  ['Google LLC', 'Correo, calendario, Meet, Drive y hojas de cálculo corporativos (Google Workspace); envío de correos transaccionales; almacenamiento y búsqueda de documentos (Google Cloud); tipografías web', 'Estados Unidos'],
  ['Fireflies.ai Corp.', 'Grabación y transcripción de las reuniones en las que se activa', 'Estados Unidos'],
  ['Servicios de notificación del navegador (Google, Mozilla, Apple)', 'Entrega de notificaciones push a quien las activa', 'Según el navegador']
];

const PrivacyPolicy = () => (
  <LegalLayout title="Política de tratamiento de datos personales">
    <section className="space-y-6">
      <p>
        Esta política explica cómo <strong>{E.name}</strong> trata los datos personales que recibe en su operación y en su plataforma <strong>{E.platform}</strong>, y cómo las personas pueden ejercer sus derechos. Se expide en cumplimiento de la Ley Estatutaria 1581 de 2012, el Decreto 1074 de 2015 (que compila el Decreto 1377 de 2013) y la Circular Externa 002 de 2024 de la Superintendencia de Industria y Comercio sobre tratamiento de datos personales en sistemas de inteligencia artificial.
      </p>

      <H2 id="responsable">1. Responsable del tratamiento</H2>
      <List>
        <li><strong>Razón social:</strong> {E.name}</li>
        <li><strong>NIT:</strong> {E.nit}</li>
        <li><strong>Domicilio:</strong> {E.address}</li>
        <li><strong>Correo:</strong> <a href={`mailto:${E.email}`} className={linkClass}>{E.email}</a></li>
        <li><strong>Teléfono:</strong> <a href={E.phoneHref} className={linkClass}>{E.phone}</a></li>
      </List>
      <p>
        Cuando Brainstudio trata datos personales por cuenta de un cliente (por ejemplo, los de su público o sus colaboradores dentro de un proyecto), actúa como <strong>Encargado del tratamiento</strong>: sigue las instrucciones del cliente, que es el Responsable, y no usa esos datos para fines propios.
      </p>

      <H2 id="datos">2. Qué datos tratamos, de quién y para qué</H2>

      <H3>Personas que nos escriben o solicitan una propuesta</H3>
      <p>
        <strong>Datos:</strong> nombre, empresa, cargo, correo, teléfono o WhatsApp, ciudad, página web o redes, y la información del proyecto que describen (necesidad, fechas, presupuesto aproximado, cómo nos conocieron).
        {' '}<strong>Finalidades:</strong> responder la solicitud, preparar y enviar propuestas y cotizaciones, hacer seguimiento comercial y enviar el correo de confirmación de la solicitud.
      </p>

      <H3>Clientes y sus representantes</H3>
      <p>
        <strong>Datos:</strong> nombre o razón social, tipo y número de documento (NIT o cédula), datos de contacto, condiciones comerciales, pagos, identificadores de sus cuentas en redes sociales y los materiales que entregan para el servicio.
        {' '}<strong>Finalidades:</strong> prestar los servicios contratados, planear y aprobar contenidos, elaborar reportes de resultados, emitir cuentas de cobro, llevar la cartera y cumplir obligaciones contables y tributarias.
      </p>

      <H3>Colaboradores y contratistas de Brainstudio</H3>
      <p>
        <strong>Datos:</strong> identificación, datos de contacto, fotografía de perfil, cuenta de acceso, cargo y rol, tareas y tiempos de trabajo registrados, ausencias, retroalimentación y evaluación de desempeño, reconocimientos, conversaciones internas en la plataforma, y datos de pago (salario o honorarios, aportes, deducciones y cuenta bancaria).
        {' '}<strong>Finalidades:</strong> gestionar la relación laboral o contractual, organizar el trabajo, pagar la nómina o los honorarios, acompañar el desarrollo profesional, garantizar la seguridad del acceso y cumplir obligaciones legales.
      </p>

      <H3>Participantes en reuniones</H3>
      <p>
        <strong>Datos:</strong> nombre, correo, respuesta a la invitación y, cuando se activa la grabación para esa reunión, la voz y la transcripción de lo conversado.
        {' '}<strong>Finalidades:</strong> agendar reuniones y generar minutas con decisiones y compromisos. Antes de grabar, quien organiza la reunión debe avisar a los asistentes; cualquier participante puede pedir que no se grabe.
      </p>

      <H3>Personas que revisan contenidos o propuestas por enlace</H3>
      <p>
        El portal de revisión de contenidos y las propuestas compartidas por enlace <strong>no piden datos de identificación</strong>: solo registran la aprobación, la fecha y los comentarios que la persona decida escribir.
      </p>

      <H3>Datos sensibles y de menores</H3>
      <p>
        Brainstudio no solicita datos sensibles (salud, origen racial o étnico, orientación política, religiosa o sexual, datos biométricos) ni datos de niños, niñas o adolescentes. Si en algún caso fueran necesarios, se pedirá autorización expresa, explicando que su entrega es facultativa. Las ausencias se registran de forma general, sin diagnósticos.
      </p>

      <H2 id="ia">3. Uso de inteligencia artificial</H2>
      <p>La plataforma usa modelos de inteligencia artificial de OpenAI, contratados por API empresarial, para:</p>
      <List>
        <li>revisar parrillas y piezas de contenido antes de su aprobación;</li>
        <li>convertir la transcripción de las reuniones en minutas con decisiones y compromisos;</li>
        <li>leer capturas de métricas de redes sociales y publicidad para elaborar reportes;</li>
        <li>buscar y resumir información en los documentos, minutas y correos corporativos de la agencia, a pedido de un integrante del equipo;</li>
        <li>proponer análisis de carga de trabajo y desempeño del equipo a partir de las tareas registradas.</li>
      </List>
      <p>Garantías que aplicamos:</p>
      <List>
        <li>Bajo las condiciones del servicio por API, <strong>el proveedor no usa la información enviada para entrenar sus modelos</strong>.</li>
        <li><strong>Supervisión humana:</strong> los resultados de la IA son propuestas que revisa una persona. No se toman decisiones con efectos jurídicos o significativos sobre personas de forma automatizada; en particular, ninguna decisión laboral se basa solo en un análisis de IA.</li>
        <li>Solo se envía la información necesaria para cada función; las contraseñas y llaves nunca se envían.</li>
        <li>Antes de habilitar un uso nuevo de IA con datos personales se evalúa su idoneidad, necesidad, razonabilidad y proporcionalidad, como pide la Circular 002 de 2024 de la SIC.</li>
      </List>
      <p>El marco completo está en <Link to="/seguridad" className={linkClass}>Seguridad e IA</Link>.</p>

      <H2 id="terceros">4. Encargados y transferencias internacionales</H2>
      <p>
        Brainstudio <strong>no vende ni alquila datos personales</strong>. Para operar, comparte datos con estos proveedores, que actúan como encargados y los tratan solo para prestar su servicio:
      </p>
      <div className="not-prose overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
        <table className="w-full min-w-[560px] border-collapse">
          <thead><Row head cells={['Proveedor', 'Para qué', 'Dónde']} /></thead>
          <tbody>{PROCESSORS.map((cells) => <Row key={cells[0]} cells={cells} />)}</tbody>
        </table>
      </div>
      <p>
        Estas transmisiones se hacen a países que la Superintendencia de Industria y Comercio reconoce con un nivel adecuado de protección o, en su defecto, bajo acuerdos contractuales de protección de datos con cada proveedor, conforme a los artículos 25 y 26 de la Ley 1581 de 2012 y al Decreto 1074 de 2015. También podremos entregar datos a autoridades que los requieran en ejercicio de sus funciones legales.
      </p>

      <H2 id="derechos">5. Derechos de los titulares</H2>
      <p>Como titular de datos personales usted tiene derecho a:</p>
      <List>
        <li>conocer, actualizar y rectificar sus datos;</li>
        <li>pedir prueba de la autorización que otorgó;</li>
        <li>ser informado del uso que se ha dado a sus datos;</li>
        <li>revocar la autorización o pedir la supresión de sus datos, salvo cuando exista un deber legal o contractual de conservarlos;</li>
        <li>acceder gratuitamente a sus datos;</li>
        <li>presentar quejas ante la Superintendencia de Industria y Comercio, después de haber agotado el trámite de consulta o reclamo ante Brainstudio.</li>
      </List>

      <H2 id="procedimiento">6. Cómo hacer una consulta o un reclamo</H2>
      <p>
        Escriba a <a href={`mailto:${E.email}`} className={linkClass}>{E.email}</a>, llame al <a href={E.phoneHref} className={linkClass}>{E.phone}</a> o envíe su solicitud a {E.address}. Indique su nombre, documento de identidad, datos de contacto y la descripción de lo que pide; si actúa en nombre de otra persona, adjunte el documento que lo acredite. Atiende estas solicitudes el <strong>área de protección de datos</strong> de Brainstudio.
      </p>
      <List>
        <li><strong>Consultas:</strong> se responden en un máximo de <strong>10 días hábiles</strong> desde su recibo. Si no es posible, le informaremos el motivo y la nueva fecha, que no superará 5 días hábiles adicionales.</li>
        <li><strong>Reclamos</strong> (corrección, actualización, supresión o incumplimiento): se responden en un máximo de <strong>15 días hábiles</strong>, prorrogables hasta 8 días hábiles más informando el motivo. Si el reclamo está incompleto, se lo haremos saber dentro de los 5 días siguientes a su recibo para que lo complete; si pasan 2 meses desde ese aviso sin que lo complete, se entenderá que desistió. Mientras se tramita, el dato se marcará como «reclamo en trámite».</li>
      </List>

      <H2 id="autorizacion">7. Autorización</H2>
      <p>
        Pedimos su autorización previa, expresa e informada al recoger sus datos (por ejemplo, con la casilla del formulario de solicitud comercial) y conservamos la prueba: fecha y versión de esta política. No se requiere autorización en los casos del artículo 10 de la Ley 1581 de 2012, como los datos de naturaleza pública o los necesarios para cumplir un contrato o una obligación legal.
      </p>

      <H2 id="seguridad">8. Seguridad</H2>
      <List>
        <li>Acceso a la plataforma solo con cuenta personal, permisos por rol y módulo, y verificación en dos pasos disponible para todas las cuentas.</li>
        <li>Contraseñas guardadas con cifrado irreversible (bcrypt); tokens de integraciones y secretos de verificación cifrados con AES-256.</li>
        <li>Conexiones cifradas (HTTPS), límites de intentos de acceso y encabezados de seguridad.</li>
        <li>Registro de trazabilidad de las acciones en la plataforma, que se conserva 365 días.</li>
        <li>Control de salida hacia los proveedores de IA: solo se permiten destinos autorizados.</li>
      </List>
      <p>
        Si ocurre un incidente que comprometa datos personales, lo reportaremos a la Superintendencia de Industria y Comercio dentro de los 15 días hábiles siguientes a su detección y avisaremos a los titulares afectados cuando exista riesgo para sus derechos.
      </p>

      <H2 id="conservacion">9. Conservación</H2>
      <p>
        Conservamos los datos mientras sean necesarios para las finalidades descritas y la relación con el titular esté vigente, y después durante los plazos que exige la ley (por ejemplo, 10 años para los documentos contables y de soporte). Cumplidos esos plazos, los datos se eliminan o se anonimizan. Usted puede pedir la supresión en cualquier momento por los canales de la sección 6.
      </p>

      <H2 id="navegador">10. Almacenamiento en el navegador</H2>
      <p>
        La plataforma <strong>no usa cookies de publicidad ni herramientas de analítica o rastreo</strong>. Guarda en el almacenamiento local del navegador la sesión iniciada y preferencias como el tema claro u oscuro, y borradores temporales de formularios mientras se diligencian. Las tipografías se cargan desde servidores de Google, que reciben la dirección IP del visitante.
      </p>

      <H2 id="meta">11. Datos de Meta (Facebook e Instagram)</H2>
      <p>
        La plataforma no se conecta a las cuentas de Facebook o Instagram de los clientes ni descarga datos de sus seguidores. Las métricas de rendimiento llegan como capturas o exportaciones que el cliente autoriza, y solo se usan para elaborar sus reportes. Para pedir la eliminación de cualquier dato relacionado, escriba a <a href={`mailto:${E.email}`} className={linkClass}>{E.email}</a>.
      </p>

      <H2 id="vigencia">12. Vigencia y cambios</H2>
      <p>
        Esta política rige desde el 27 de septiembre de 2026 y reemplaza la versión de febrero de 2025. Las bases de datos se mantendrán mientras subsistan las finalidades que justifican su tratamiento. Los cambios sustanciales se informarán en esta página y por los canales habituales antes de aplicarse.
      </p>

      <p className="pt-8 text-sm text-zinc-500">Versión {PRIVACY_POLICY_VERSION}.</p>
    </section>
  </LegalLayout>
);

export default PrivacyPolicy;
