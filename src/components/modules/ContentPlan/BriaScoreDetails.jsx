import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';

const labels = { MARCA: 'Marca', ESTRATEGIA: 'Estrategia', GRAMATICA: 'Gramática', CONSISTENCIA: 'Consistencia' };
const decimal = value => new Intl.NumberFormat('es-CO', { maximumFractionDigits: 2 }).format(value);
export default function BriaScoreDetails({ review, onViewItem }) {
  const [open, setOpen] = useState(false);
  const trace = review?.scoreTrace;
  if (!trace) return null;
  return <>
    <Button type="button" variant="outline" className="min-h-11 rounded-xl" onClick={() => setOpen(true)}>Detalle del puntaje</Button>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent overlayClassName="z-[70] motion-reduce:animate-none" className="z-[71] block gap-0 rounded-2xl border-zinc-200 bg-white p-0 text-zinc-900 motion-reduce:animate-none dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 sm:max-w-2xl">
        <div data-bria-header className="brain-ai-header px-[24px] py-[24px] pr-[56px] text-white">
          <DialogHeader className="flex-row items-center gap-[12px] space-y-0 text-left">
            <span className="flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded-xl bg-white dark:bg-white"><img src="/brainstudio-mascot-tip.png" alt="" className="h-[40px] w-[40px] object-contain" /></span>
            <div className="min-w-0 space-y-2 break-words"><DialogTitle className="text-white">Cómo se calcula el puntaje</DialogTitle><DialogDescription className="text-white/95">Cada descuento tiene un criterio y una cita del contenido.</DialogDescription></div>
          </DialogHeader>
        </div>
        <div className="space-y-5 p-5 sm:p-6">
          {trace.rubric.status === 'CANDIDATE' && <p className="text-sm text-zinc-600 dark:text-zinc-300"><span className="font-semibold">Cálculo candidato</span> · pendiente de calibración humana. No sustituye el puntaje publicado.</p>}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 pb-4 dark:border-zinc-800"><p className="text-base font-semibold tabular-nums">{Number.isFinite(review.score) ? `${review.score}/100` : 'Sin puntaje'}</p><p className="text-sm text-zinc-600 dark:text-zinc-300">{trace.assessedChecks}/{trace.totalChecks} chequeos evaluables</p></div>
          {trace.partial && <p className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-300"><strong className="font-semibold">Alcance parcial</strong>. El puntaje corresponde solo a lo evaluable. La falta de información no resta puntos ni equivale a una evaluación positiva.</p>}
          <p className="text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">Se promedian los chequeos evaluables de cada dimensión: estrategia 30%, marca 25%, gramática 25% y consistencia 20%. Si una dimensión no es evaluable, su peso se excluye. El total se redondea al final.</p>
          <div className="divide-y divide-zinc-200 dark:divide-zinc-800">{trace.deductions.map((row, i) => <article key={`${row.itemId}-${row.ruleKey}-${i}`} className="space-y-3 py-4 first:pt-0">
            <div className="flex items-start justify-between gap-3"><p className="text-sm font-medium">{labels[row.category] || row.category}</p><p className="shrink-0 text-sm font-semibold tabular-nums">−{decimal(row.points)} puntos</p></div>
            <blockquote className="border-l-2 border-zinc-200 pl-3 text-sm leading-relaxed dark:border-zinc-700">{row.quote}</blockquote>
            <p className="break-words text-sm leading-relaxed">{row.detail}</p>
            <p className="break-words text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">{row.recommendation}</p>
            <p className="break-all text-xs text-zinc-500 dark:text-zinc-400">Criterio: {row.ruleKey}</p>
            {onViewItem && row.itemId && <Button type="button" variant="outline" className="min-h-11" onClick={() => { setOpen(false); onViewItem(row.itemId); }}>Ver pieza</Button>}
          </article>)}</div>
          {!trace.deductions.length && <p className="text-sm">{trace.assessedChecks ? 'Sin descuentos en los chequeos evaluables.' : 'No hay evidencia suficiente para asignar un puntaje.'}</p>}
          {trace.exclusions.length > 0 && <details className="border-t border-zinc-200 pt-2 dark:border-zinc-800"><summary className="min-h-11 cursor-pointer py-3 text-sm font-medium">Qué no se pudo evaluar ({trace.exclusions.length})</summary><ul className="space-y-3 pb-2">{trace.exclusions.map((row, i) => <li key={i} className="space-y-1 text-sm text-zinc-600 dark:text-zinc-300"><p className="break-all text-xs">{row.ruleKey}</p><p>{row.detail}</p></li>)}</ul></details>}
          <p className="break-all text-xs text-zinc-500 dark:text-zinc-400">Versión: {trace.rubric.version}</p>
        </div>
      </DialogContent>
    </Dialog>
  </>;
}
