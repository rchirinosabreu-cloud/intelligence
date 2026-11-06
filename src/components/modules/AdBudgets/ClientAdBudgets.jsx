import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { hasModuleAccess } from '@/lib/platformModules';
import { formatAdMoney, shortDay } from '@/lib/adBudgets';
import { LEVEL_META } from '@/components/modules/Clients/operations/operationTones';
import { cn } from '@/lib/utils';
import { useAdBudgets } from './adBudgetsApi';

// La pauta en la página del cliente (reunión del 6 de noviembre de 2026: «en los entregables del cliente tiene que estar la
// parte de pauta»). Solo la ve quien entra a Pautas, y solo si el cliente tiene alguna: un cliente sin pauta no dibuja nada.
export default function ClientAdBudgets({ clientId }) {
  const { user } = useAuth();
  const allowed = hasModuleAccess(user, 'pautas');
  const { data } = useAdBudgets({ clientId, enabled: allowed && Boolean(clientId) });
  const budgets = data?.budgets || [];
  if (!allowed || !budgets.length) return null;
  return (
    <section data-client-ad-budgets aria-label="Pauta" className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-zinc-900">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-white">Pauta</h3>
        <Link to={`/pautas?cliente=${clientId}`} className="inline-flex min-h-11 items-center text-sm font-medium text-brand-cyan-deep dark:text-brand-cyan">Abrir Pautas</Link>
      </div>
      <ul className="space-y-2">
        {budgets.map((budget) => {
          const e = budget.evaluation;
          const meta = LEVEL_META[e.level];
          return (
            <li key={budget.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-sm">
              <span className="min-w-0 truncate text-zinc-900 dark:text-white">{budget.brand || budget.client?.name}</span>
              <span className="text-zinc-500 dark:text-zinc-400">{formatAdMoney(e.spentCents, budget.currency)} de {formatAdMoney(e.availableCents, budget.currency)} · cierra el {shortDay(budget.cycle.end)}</span>
              <span className={cn('inline-flex items-center gap-1.5 text-xs font-medium', meta.text)}><span className={cn('h-2 w-2 rounded-full', meta.dot)} aria-hidden="true" />{e.label}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
