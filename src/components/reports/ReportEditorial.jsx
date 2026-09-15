import React from 'react';

const surface = 'rounded-2xl border border-border bg-card p-4 text-card-foreground sm:p-6';

export function EditorialSummary({ editorial }) {
  return <section className={surface} aria-label="Resumen ejecutivo"><h3 className="text-lg font-semibold">Resumen ejecutivo</h3><h4 className="mt-4 font-semibold">{editorial.summary.title}</h4><p className="mt-2 text-sm leading-relaxed">{editorial.summary.text}</p></section>;
}

export function EditorialComment({ comment }) {
  if (!comment) return null;
  return <aside data-editorial-comment className="mt-5 rounded-xl bg-muted/50 p-4 text-sm leading-relaxed"><h4 className="font-semibold">{comment.title}</h4><p className="mt-2"><strong>Lectura del resultado. </strong>{comment.observation}</p><p className="mt-2"><strong>Qué significa. </strong>{comment.interpretation}</p><p className="mt-2"><strong>Próximo paso. </strong>{comment.action}</p></aside>;
}

export function EditorialStrategy({ editorial }) {
  return <>
    <section className={surface}><h3 className="text-lg font-semibold">Oportunidades y aprendizajes</h3>{editorial.opportunities.map((item, index) => <EditorialComment key={`${item.title}:${index}`} comment={item} />)}</section>
    <section className={surface}><h3 className="text-lg font-semibold">Recomendaciones estratégicas</h3><div className="mt-4 divide-y divide-border">{editorial.recommendations.map((item, index) => <article key={`${item.title}:${index}`} className="py-4 text-sm leading-relaxed"><p className="text-xs font-medium text-primary">Prioridad {item.priority.toLowerCase()}</p><h4 className="mt-1 font-semibold">{item.title}</h4><p className="mt-2">{item.rationale}</p><p className="mt-2"><strong>Acción propuesta. </strong>{item.action}</p><p className="mt-2"><strong>Indicador de seguimiento. </strong>{item.kpi}</p></article>)}</div></section>
    <section className={surface}><h3 className="text-lg font-semibold">Plan de acción</h3><p className="mt-1 text-sm text-muted-foreground">Propuestas para el siguiente período, sujetas a coordinación con el cliente.</p><ol className="mt-4 divide-y divide-border">{editorial.recommendations.map((item, index) => <li key={`${item.title}:${index}`} className="py-4 text-sm"><p className="font-medium">{index + 1}. {item.action}</p><p className="mt-2 text-muted-foreground">Prioridad {item.priority.toLowerCase()} · Seguimiento: {item.kpi}</p></li>)}</ol><div className="mt-4 rounded-xl bg-muted/50 p-4 text-sm leading-relaxed"><h4 className="font-semibold">{editorial.closing.title}</h4><p className="mt-2">{editorial.closing.text}</p></div></section>
  </>;
}
