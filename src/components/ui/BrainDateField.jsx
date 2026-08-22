import React from 'react';
import DatePicker from 'react-datepicker';
import { Calendar } from '@/components/ui/icons';
import { brainDatePickerProps } from '@/lib/brainDatePicker';
import { cn } from '@/lib/utils';

const baseInputClass = 'w-full rounded-lg border border-zinc-200 bg-white py-2.5 pl-9 pr-3 text-sm text-zinc-900 outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-500/10 dark:border-white/10 dark:bg-zinc-950 dark:text-white';

const BrainDateField = ({ label, className, inputClassName, ...props }) => (
  <label className={cn('block space-y-1.5 text-sm text-zinc-700 dark:text-zinc-200', className)}>
    {label && <span>{label}</span>}
    <div className="relative">
      <Calendar className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-zinc-400" />
      <DatePicker {...brainDatePickerProps} {...props} wrapperClassName="w-full" className={cn(baseInputClass, inputClassName)} />
    </div>
  </label>
);

export default BrainDateField;
