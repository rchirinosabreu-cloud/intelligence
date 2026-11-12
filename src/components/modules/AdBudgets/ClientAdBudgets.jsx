import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus } from '@/components/ui/icons';
import { useAuth } from '@/context/AuthContext';
import { hasModuleAccess } from '@/lib/platformModules';
import { AD_PLATFORMS, formatAdMoney, labelOfAd, shortDay } from '@/lib/adBudgets';
import { LEVEL_META } from '@/components/modules/Clients/operations/operationTones';
import { cn } from '@/lib/utils';
import { useAdBudgets } from './adBudgetsApi';
import { AdBudgetDialog, AdSpendDialog } from './AdBudgetDialogs';

// La pauta en la ficha del cliente (Rodny, 6 de noviembre de 2026: «en la ficha del cliente yo puedo colocar pauta, y un
// valor … y viceversa»). No es una copia: lee y escribe las mismas pautas del módulo, con sus mismos formularios, así que
// lo que se cambia aquí se ve allá y al revés. Solo la ve quien entra a Pautas, y solo edita quien tiene «Editar pautas».
const action = 'min-h-11 rounded-lg px-2 text-sm font-medium text-brand-cyan-deep dark:text-brand-cyan';

export default function ClientAdBudgets({ clientId, className, inDialog = false }) {
  const { currentUser } = useAuth();
  const allowed = hasModuleAccess(currentUser, 'pautas');
  const { data, isLoading, error } = useAdBudgets({ clientId, enabled: allowed && Boolean(clientId) });
  const [dialog, setDialog] = useState(null);
  if (!allowed) return null;
  const canEdit = data?.canEdit === true;
  const budgets = data?.budgets || [];
  const close = () => setDialog(null);
  return (
    <section data-client-ad-budgets aria-label="Pauta" className={className}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-white">Pauta</h3>
        <div className="flex items-center gap-1">
          {canEdit && <button type="button" data-client-ad-new onClick={() => setDialog({ kind: 'new' })} className={cn(action, 'inline-flex items-center gap-1')}><Plus className="h-4 w-4" /> Añadir pauta</button>}
          {!inDialog && <Link to={`/pautas?cliente=${clientId}`} className={cn(action, 'inline-flex items-center')}>Abrir Pautas</Link>}
        </div>
      </div>
      {error && <p role="alert" className="text-sm text-destructive brain-destructive-text">No se pudo cargar la pauta: {error.message}</p>}
      {!isLoading && !error && !budgets.length && <p data-client-ad-empty className="text-sm text-zinc-500 dark:text-zinc-400">Este cliente no tiene pauta registrada.</p>}
      <ul className="mt-1 space-y-3">
        {budgets.map((budget) => {
          const e = budget.evaluation;
          const meta = LEVEL_META[e.level];
          return (
            <li key={budget.id} data-client-ad-budget={budget.id} className="min-w-0 text-sm">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <span className="min-w-0 truncate font-medium text-zinc-900 dark:text-white">{budget.brand || `Pauta en ${labelOfAd(AD_PLATFORMS, budget.platform)}`}</span>
                <span className={cn('inline-flex items-center gap-1.5 text-xs font-medium', meta.text)}><span className={cn('h-2 w-2 rounded-full', meta.dot)} aria-hidden="true" />{e.label}</span>
              </div>
              <p className="text-zinc-600 dark:text-zinc-300">{formatAdMoney(e.spentCents, budget.currency)} de {formatAdMoney(e.availableCents, budget.currency)} · cierra el {shortDay(budget.cycle.end)}</p>
              {canEdit && <div className="-ml-2 flex flex-wrap items-center">
                <button type="button" data-client-ad-spend onClick={() => setDialog({ kind: 'spend', budget })} className={action}>Actualizar gasto</button>
                <button type="button" data-client-ad-edit onClick={() => setDialog({ kind: 'edit', budget })} className={action}>Editar</button>
              </div>}
            </li>
          );
        })}
      </ul>
      {dialog?.kind === 'new' && <AdBudgetDialog defaultClientId={clientId} onClose={close} />}
      {dialog?.kind === 'edit' && <AdBudgetDialog budget={dialog.budget} onClose={close} />}
      {dialog?.kind === 'spend' && <AdSpendDialog budget={dialog.budget} onClose={close} />}
    </section>
  );
}
