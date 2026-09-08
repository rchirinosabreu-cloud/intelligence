import React from 'react';
import { calculateProposalPayments, formatExecution, formatInstallmentDue, proposalRichTextBlocks } from '@/services/quotationProposalDetails';

export function ProposalRichText({ html }) {
  if (!html) return null;
  return <div className="space-y-2 break-words text-sm leading-6 text-zinc-600 dark:text-zinc-300">
    {proposalRichTextBlocks(html).map((block, i) => {
      const Tag = block.heading ? `h${Math.min(block.heading + 1, 4)}` : 'p';
      return <Tag key={i} className={block.heading ? 'pt-3 text-base font-semibold text-zinc-900 dark:text-zinc-100' : block.bullet ? 'ml-4 flex gap-2' : ''}>
        {block.bullet && <span aria-hidden="true">{block.ordinal ? `${block.ordinal}.` : '•'}</span>}<span className="whitespace-pre-wrap">{block.runs.map((run, j) => {
          let node = run.text;
          if (run.bold) node = <strong>{node}</strong>;
          if (run.italic) node = <em>{node}</em>;
          if (run.underline) node = <u>{node}</u>;
          if (run.href) node = <a href={run.href} target="_blank" rel="noopener noreferrer" className="font-medium text-primary underline underline-offset-4">{node}</a>;
          return <React.Fragment key={j}>{node}</React.Fragment>;
        })}</span>
      </Tag>;
    })}
  </div>;
}
export function ProposalPayments({ plan, totals, currency = 'COP' }) {
  if (!plan) return null;
  let rows;
  try { rows = calculateProposalPayments(plan, totals); }
  catch (error) { return <p role="alert" className="text-sm text-destructive">{error.message}</p>; }
  const money = value => new Intl.NumberFormat('es-CO', { style: 'currency', currency, maximumFractionDigits: 2 }).format(value);
  return <div className="space-y-3" data-testid="payment-preview">
    <p className="text-sm text-zinc-500 dark:text-zinc-400">Total {money(totals.totalAmount)} · {rows.length} pagos{totals.taxAmount > 0 ? ' · impuestos incluidos' : ''}</p>
    {rows.map((row, i) => <div key={row.id} className="flex flex-wrap items-start justify-between gap-3 border-b border-zinc-200 py-3 dark:border-zinc-800">
      <div className="min-w-0 flex-1"><p className="text-sm font-semibold">{i + 1}. {row.label || 'Cuota'}{plan.mode === 'PERCENTAGE' ? ` · ${row.value}%` : ''}</p><p className="mt-1 break-words text-xs leading-5 text-zinc-500 dark:text-zinc-400">{formatInstallmentDue(row)}</p></div>
      <div className="text-right"><p className="font-semibold">{money(row.amount)}</p>{row.taxAmount > 0 && <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">Base {money(row.baseAmount)} + IVA {money(row.taxAmount)}</p>}</div>
    </div>)}
  </div>;
}
export function ProposalTimeline({ details }) {
  if (!details?.phases?.length) return null;
  return <section className="mx-auto max-w-6xl px-5 py-10 sm:px-8"><h2 className="text-2xl font-semibold">Etapas de implementación</h2>
    <div className="mt-6 space-y-6">{details.phases.map((phase, i) => <article key={phase.id} className="border-b border-zinc-200 pb-6 dark:border-zinc-800">
      <div className="flex flex-wrap items-baseline justify-between gap-3"><h3 className="text-base font-semibold">{i + 1}. {phase.title}</h3><p className="text-sm text-primary">{formatExecution(phase.execution)}</p></div>
      <p className="my-2 text-xs text-zinc-500 dark:text-zinc-400">{{ AT_START: 'Al inicio del proyecto', AFTER_PREVIOUS: 'Después de la etapa anterior', PARALLEL: 'En paralelo' }[phase.starts]}</p>
      <ProposalRichText html={phase.descriptionHtml} />{phase.completion && <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300"><strong>Entregable:</strong> {phase.completion}</p>}
    </article>)}</div>
  </section>;
}
export function ProposalClosing({ details }) {
  return <>{[['bonusHtml', 'Beneficios incluidos'], ['exclusionsHtml', 'Exclusiones'], ['referencesHtml', 'Referencias y trabajos de Brainstudio']].map(([key, title]) => details?.[key] ? <section key={key} className="mx-auto max-w-6xl px-5 py-8 sm:px-8"><h2 className="mb-4 text-xl font-semibold">{title}</h2><ProposalRichText html={details[key]} /></section> : null)}</>;
}
