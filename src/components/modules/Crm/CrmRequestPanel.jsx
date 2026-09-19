import React, { useState } from 'react';
import { ChevronDown, FileText, Sparkles } from '@/components/ui/icons';
import { cn } from '@/lib/utils';
import { SERVICE_CATEGORIES, SERVICE_BLOCKS, answerLabel } from '@/lib/commercialRequestForm';
import { formatDateTime, formatCurrency, formatDate } from './crmPresentation';

const BLOCK_LABELS = Object.fromEntries(Object.entries(SERVICE_BLOCKS).flatMap(([service, block]) => block.questions.map(question => [question.id, `${block.title} · ${question.label}`])));
const labelFor = key => LABELS[key] || BLOCK_LABELS[key] || key;

const LABELS = {
  contactName: 'Nombre', company: 'Empresa', jobTitle: 'Cargo', email: 'Correo', phone: 'WhatsApp / teléfono', location: 'Ciudad y país', website: 'Web o redes',
  need: 'Qué necesita', hasKeyDate: 'Fecha importante', keyDate: 'Cuál', keyDateNote: 'Qué sucede ese día', startWhen: 'Cuándo quiere iniciar', services: 'Servicios',
  'event.related': 'Relacionado con evento', 'event.needs': 'Para el evento', 'amc.interest': 'Interés en AMC', 'amc.plan': 'Alternativa AMC', 'amc.why': 'Qué le interesó de AMC',
  'budget.has': 'Presupuesto', 'budget.amount': 'Monto', 'budget.currency': 'Moneda', 'budget.scope': 'Corresponde a', 'budget.adsIncluded': 'Pauta incluida', 'budget.adsExtra': 'Presupuesto adicional de pauta',
  stage: 'Etapa de contratación', 'decision.others': 'Otras personas deciden', 'decision.who': 'Quiénes', 'proposal.when': 'Cuándo espera la propuesta', source: 'Cómo nos conoció', workedBefore: 'Trabajó antes con nosotros', extra: 'Algo más'
};

const ORDER = Object.keys(LABELS);

const formatValue = (id, value) => {
  if (value === null || value === undefined || value === '' || (Array.isArray(value) && value.length === 0)) return null;
  if (typeof value === 'object' && !Array.isArray(value)) return value.undefined ? 'Aún no está definido' : (value.amount ? formatCurrency(Number(String(value.amount).replace(/[^0-9]/g, ''))) : null);
  if (id === 'keyDate') return formatDate(value);
  return answerLabel(id, value);
};

const Row = ({ label, children }) => (
  <div className="grid gap-1 py-2 sm:grid-cols-[11rem_1fr]">
    <dt className="text-xs font-medium text-zinc-500 dark:text-zinc-400">{label}</dt>
    <dd className="min-w-0 whitespace-pre-wrap break-words text-sm text-zinc-800 dark:text-zinc-100">{children}</dd>
  </div>
);

/** What the prospect wrote in the public form, verbatim, plus the quotation lines it suggests. */
const CrmRequestPanel = ({ request, className }) => {
  const [expanded, setExpanded] = useState(false);
  if (!request) return null;
  const answers = request.answers || {};
  const services = (request.services || []).map(value => SERVICE_CATEGORIES.find(item => item.value === value)?.label || value);
  const keys = [...ORDER.filter(key => key in answers), ...Object.keys(answers).filter(key => !ORDER.includes(key))].filter(key => key !== 'services' && formatValue(key, answers[key]) !== null);
  const main = keys.filter(key => ['need', 'startWhen', 'keyDate', 'keyDateNote', 'budget.amount', 'budget.scope', 'stage', 'proposal.when'].includes(key));
  const rest = keys.filter(key => !main.includes(key));

  return (
    <section className={cn('rounded-2xl border border-brand-magenta/25 bg-brand-magenta/[0.04] p-5 dark:bg-brand-magenta/[0.07]', className)} data-crm-request>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-zinc-950 dark:text-zinc-50"><FileText className="h-4 w-4 text-brand-magenta-deep dark:text-brand-magenta" /> Solicitud del cliente</h2>
        <span className="text-[11px] text-zinc-500 dark:text-zinc-400">Recibida {formatDateTime(request.receivedAt)}{request.meta?.campaign ? ` · campaña ${request.meta.campaign}` : ''}</span>
      </div>
      {services.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {services.map(label => <span key={label} className="rounded-full border border-brand-magenta/30 bg-white px-2.5 py-0.5 text-xs font-semibold text-brand-magenta-deep dark:bg-zinc-950 dark:text-brand-magenta">{label}</span>)}
        </div>
      )}
      <dl className="divide-y divide-zinc-200/70 dark:divide-zinc-800">
        {main.map(key => <Row key={key} label={labelFor(key)}>{formatValue(key, answers[key])}</Row>)}
      </dl>
      {request.suggestedItems?.length > 0 && (
        <div className="mt-4 rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
          <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-zinc-700 dark:text-zinc-200"><Sparkles className="h-3.5 w-3.5 text-primary" /> Líneas sugeridas para la cotización</p>
          <ul className="space-y-1">
            {request.suggestedItems.map(item => (
              <li key={`${item.category}:${item.name}`} className="flex flex-wrap items-baseline gap-x-2 text-sm text-zinc-800 dark:text-zinc-100">
                <span className="font-medium">{item.name}</span>
                {item.custom && <span className="rounded bg-zinc-100 px-1.5 text-[10px] font-semibold uppercase text-zinc-500 dark:bg-zinc-800">personalizada</span>}
                {item.detail && <span className="text-xs text-zinc-500 dark:text-zinc-400">{item.detail}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
      {rest.length > 0 && (
        <div className="mt-3">
          <button type="button" onClick={() => setExpanded(value => !value)} aria-expanded={expanded} className="inline-flex min-h-9 items-center gap-1 text-xs font-semibold text-primary hover:underline">
            {expanded ? 'Ocultar el resto de respuestas' : `Ver todas las respuestas (${rest.length} más)`} <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', expanded && 'rotate-180')} />
          </button>
          {expanded && (
            <dl className="mt-2 divide-y divide-zinc-200/70 dark:divide-zinc-800">
              {rest.map(key => <Row key={key} label={labelFor(key)}>{formatValue(key, answers[key])}</Row>)}
            </dl>
          )}
        </div>
      )}
    </section>
  );
};

export default CrmRequestPanel;
