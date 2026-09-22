import React from 'react';
import Select from '@/components/ui/Select';
import { Search, Loader2 } from '@/components/ui/icons';
import { FINANCIAL_CATEGORY_OPTIONS } from '@/lib/financialCategories';

export const FINANCIAL_MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const control = 'min-h-11 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/10 dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-100';

export default function FinancialFilters({ year, onYearChange, filters, onChange, search, onSearchChange, busy }) {
    return <section aria-label="Filtros financieros" className="space-y-3">
        <div className="relative">
            <Search aria-hidden="true" className="pointer-events-none absolute left-3.5 top-3.5 h-5 w-5 text-zinc-400" />
            <input type="search" aria-label="Buscar en financiero" aria-describedby="financial-search-help" maxLength={200}
                value={search} onChange={event => onSearchChange(event.target.value)}
                placeholder="Buscar persona, cliente o concepto…" className={`${control} min-h-12 pl-11 pr-24 [&::-webkit-search-cancel-button]:hidden`} />
            {search && <button type="button" aria-label="Limpiar búsqueda" onClick={() => onSearchChange('')}
                className="absolute right-1 top-1 min-h-10 rounded-md px-3 text-xs font-medium text-zinc-600 hover:bg-zinc-100 focus-visible:outline-violet-500 dark:text-zinc-300 dark:hover:bg-zinc-800">Limpiar</button>}
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.3fr)]">
            <label className="space-y-1 text-xs text-zinc-600 dark:text-zinc-300">Año
                <Select aria-label="Año financiero" className={control} value={year} onChange={event => onYearChange(Number(event.target.value))}>
                    {Array.from({ length: Math.max(new Date().getFullYear(), year) - 2020 }, (_, index) => 2021 + index).map(value => <option key={value} value={value}>{value}</option>)}
                </Select>
            </label>
            <label className="space-y-1 text-xs text-zinc-600 dark:text-zinc-300">Escenario
                <Select aria-label="Escenario financiero" className={control} value={filters.scenario} onChange={event => onChange({ scenario: event.target.value })}>
                    <option value="ACTUAL">Ejecutado</option><option value="FORECAST">Proyección</option><option value="BUDGET">Presupuesto</option>
                </Select>
            </label>
            <label className="space-y-1 text-xs text-zinc-600 dark:text-zinc-300">Mes
                <Select aria-label="Mes" className={control} value={filters.month} onChange={event => onChange({ month: event.target.value })}>
                    <option value="">Todo el año</option>
                    {FINANCIAL_MONTHS.map((name, index) => <option key={name} value={index + 1}>{name}</option>)}
                </Select>
            </label>
            <label className="space-y-1 text-xs text-zinc-600 dark:text-zinc-300">Tipo
                <Select aria-label="Tipo de movimiento" className={control} value={filters.type} onChange={event => onChange({ type: event.target.value })}>
                    <option value="">Ingresos y egresos</option><option value="INCOME">Ingresos</option><option value="EXPENSE">Egresos</option>
                </Select>
            </label>
            <label className="space-y-1 text-xs text-zinc-600 dark:text-zinc-300">Categoría
                <Select aria-label="Categoría del movimiento" className={control} value={filters.category} onChange={event => onChange({ category: event.target.value })}>
                    <option value="">Todas las categorías</option>
                    {FINANCIAL_CATEGORY_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </Select>
            </label>
        </div>
        <p id="financial-search-help" className="flex min-h-5 items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400" role="status">
            {busy ? <><Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin" />Actualizando resultados…</>
                : filters.category ? 'La categoría acota los indicadores, las gráficas y los movimientos. Cartera y nómina no se clasifican por categoría.'
                    : 'La búsqueda actualiza los registros y sus indicadores en todas las páginas.'}
        </p>
    </section>;
}
