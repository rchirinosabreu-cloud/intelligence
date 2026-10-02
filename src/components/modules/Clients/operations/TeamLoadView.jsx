import React, { useState } from 'react';
import TeamAvatar from '@/components/ui/TeamAvatar';
import { cn } from '@/lib/utils';
import { teamLoad } from '@/lib/clientOperations';
import { LEVEL_META } from './operationTones';

// Pestaña «Equipo» (borrador del 2 de octubre de 2026): el bloque «Colaborador / Clientes a cargo» del
// Excel, con lo que la hoja no podía decir: cuántos de esos clientes van mal y cuánto falta publicar.

const ROLES = [{ key: 'communityManager', label: 'Community managers' }, { key: 'projectManager', label: 'Project managers' }];

export default function TeamLoadView({ evaluated, onOpenClient }) {
  const [role, setRole] = useState('communityManager');
  const rows = teamLoad(evaluated, role);
  return (
    <div className="space-y-6">
      <div className="inline-flex rounded-xl border border-zinc-200 bg-white p-1 dark:border-white/10 dark:bg-zinc-900" role="radiogroup" aria-label="Ver por">
        {ROLES.map((r) => (
          <button key={r.key} type="button" role="radio" aria-checked={role === r.key} onClick={() => setRole(r.key)}
            className={cn('min-h-10 rounded-lg px-4 text-sm font-medium transition-colors', role === r.key ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900' : 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-white/5')}>
            {r.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 items-stretch gap-4 md:grid-cols-2 xl:grid-cols-3">
        {rows.map((row) => {
          const pct = row.quota ? Math.round((row.published / row.quota) * 100) : 0;
          return (
            <section key={row.member?.id || 'none'} className="flex min-w-0 flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white p-5 dark:border-white/10 dark:bg-zinc-900">
              <header className="flex items-center gap-3">
                {row.member ? <TeamAvatar member={row.member} size={40} /> : <span className="h-10 w-10 rounded-full border border-dashed border-zinc-300 dark:border-white/15" />}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-zinc-900 dark:text-zinc-50">{row.member?.name || 'Sin asignar'}</p>
                  <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-zinc-500">
                    {row.clients.length === 1 ? '1 cliente a cargo' : `${row.clients.length} clientes a cargo`}
                    {row.red > 0 && <span className={cn('rounded-md border px-1.5 py-0.5 font-semibold', LEVEL_META.red.soft, LEVEL_META.red.text)}>{row.red} en riesgo</span>}
                    {row.yellow > 0 && <span className={cn('rounded-md border px-1.5 py-0.5 font-semibold', LEVEL_META.yellow.soft, LEVEL_META.yellow.text)}>{row.yellow} atención</span>}
                  </p>
                </div>
              </header>

              <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-xl bg-zinc-50 p-3 dark:bg-white/5">
                  <p className="text-xs text-zinc-500">Publicadas este mes</p>
                  <p className="mt-0.5 font-semibold tabular-nums">{row.published} de {row.quota}</p>
                  <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-zinc-200 dark:bg-white/10"><span className="block h-full rounded-full bg-brand-green" style={{ width: `${pct}%` }} /></span>
                </div>
                <div className="rounded-xl bg-zinc-50 p-3 dark:bg-white/5">
                  <p className="text-xs text-zinc-500">Tareas vencidas</p>
                  <p className={cn('mt-0.5 font-semibold tabular-nums', row.overdueTasks && 'text-destructive')}>{row.overdueTasks}</p>
                </div>
              </div>

              <ul className="mt-4 divide-y divide-zinc-100 border-t border-zinc-100 dark:divide-white/5 dark:border-white/5">
                {row.clients.map(({ client, evaluation }) => (
                  <li key={client.id}>
                    <button type="button" onClick={() => onOpenClient(client)}
                      className="flex min-h-11 w-full items-center gap-2.5 text-left text-sm hover:text-brand-cyan-deep dark:hover:text-brand-cyan">
                      <span className={cn('h-2 w-2 shrink-0 rounded-full', LEVEL_META[evaluation.level].dot)} />
                      <span className="min-w-0 flex-1 truncate">{client.name}</span>
                      {client.cycles?.current && client.contract?.serviceType === 'PARRILLA' && (
                        <span className="shrink-0 text-xs tabular-nums text-zinc-500">{client.cycles.current.reached.publicada}/{client.cycles.current.quota}</span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
