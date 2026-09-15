import React from 'react';
import Select from '../ui/Select';

export default function ReportCurrencyField({ value = 'COP', onChange, disabled = false }) {
  return <div className="space-y-1.5">
    <label htmlFor="report-currency" className="text-sm font-medium text-slate-700 dark:text-slate-200">Moneda del reporte</label>
    <Select id="report-currency" value={value} onChange={event => onChange(event.target.value)} disabled={disabled}
      aria-describedby="report-currency-hint"
      className="w-full min-h-11 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-700 dark:text-slate-100 outline-none focus:ring-2 focus:ring-primary/20">
      <option value="COP">COP · Pesos colombianos</option>
      <option value="USD">USD · Dólares estadounidenses</option>
      <option value="EUR">EUR · Euros</option>
      <option value="MXN">MXN · Pesos mexicanos</option>
    </Select>
    <p id="report-currency-hint" className="text-xs text-slate-500 dark:text-slate-400">Se aplica si la captura muestra solo $ o no indica moneda.</p>
  </div>;
}
