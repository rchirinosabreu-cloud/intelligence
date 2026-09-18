import React, { createContext, useContext, useEffect, useRef } from 'react';
import DatePicker from 'react-datepicker';
// The picker stylesheet is loaded once by src/main.jsx (and by each local preview fixture).
import {
  brainDatePickerProps, dateKeyToPickerDate, pickerDateToKey, splitDateTimeKey, joinDateTimeKey,
  formatDateTimeText, parseDateTimeText, QUARTER_HOURS
} from '@/lib/brainDatePicker';
import { cn } from '@/lib/utils';

export { dateKeyToPickerDate, pickerDateToKey, splitDateTimeKey, joinDateTimeKey };

/**
 * The one calendar of the platform (react-datepicker + brainDatePickerProps, Spanish, Bogotá wall clock).
 * Modules must use these two components instead of the browser's native date or date-time fields.
 *
 * Value contracts are plain strings so forms and APIs stay unchanged:
 *   BrainDatePicker      value 'YYYY-MM-DD'        onChange('YYYY-MM-DD' | '')
 *   BrainDateTimePicker  value 'YYYY-MM-DDTHH:mm'  onChange('YYYY-MM-DDTHH:mm' | '')
 */

export const brainDateInputClass = 'w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition-colors placeholder:text-zinc-400 focus:border-primary/60 focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-500';

export function BrainDatePicker({ id, value, onChange, className, placeholder = 'DD/MM/AAAA', min, max, disabled, isClearable = false, ariaLabel, required, name }) {
  return (
    <DatePicker
      id={id}
      name={name}
      {...brainDatePickerProps}
      selected={dateKeyToPickerDate(value)}
      onChange={date => onChange(pickerDateToKey(date))}
      minDate={dateKeyToPickerDate(min) || undefined}
      maxDate={dateKeyToPickerDate(max) || undefined}
      dateFormat="dd/MM/yyyy"
      placeholderText={placeholder}
      disabled={disabled}
      required={required}
      isClearable={isClearable && !disabled}
      ariaLabelledBy={undefined}
      ariaLabel={ariaLabel}
      className={cn(brainDateInputClass, className)}
      wrapperClassName="w-full"
      popperPlacement="bottom-start"
      autoComplete="off"
    />
  );
}

// ---- date + time -------------------------------------------------------------------------------------------

const ClockContext = createContext(null);

function CalendarWithClock({ className, children }) {
  const { time, canSelectTime, onTimeChange, onClose } = useContext(ClockContext);
  const listRef = useRef(null);
  const hours = !time || QUARTER_HOURS.includes(time) ? QUARTER_HOURS : [...QUARTER_HOURS, time].sort();

  useEffect(() => {
    const list = listRef.current;
    const selected = list?.querySelector('[aria-pressed="true"]');
    if (selected) list.scrollTop = selected.offsetTop - list.offsetTop - list.clientHeight / 2 + selected.clientHeight / 2;
  }, [time]);

  return (
    <div data-brain-date-time-popup className={className} role="dialog" aria-label="Elegir fecha y hora" onKeyDown={event => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      onClose();
    }}>
      <div className="flex max-w-[calc(100vw-2rem)]">
        <div className="relative min-w-0 bg-white dark:bg-zinc-900">{children}</div>
        <div data-brain-time-column className="flex w-20 shrink-0 flex-col border-l border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
          <div className="border-b border-zinc-100 px-2 py-3 text-center text-sm font-semibold text-zinc-900 dark:border-zinc-800 dark:text-zinc-100">Hora</div>
          <div ref={listRef} className="relative max-h-64 overflow-y-auto overscroll-contain py-1">
            {hours.map(hour => (
              <button key={hour} type="button" aria-pressed={hour === time} disabled={!canSelectTime} onClick={() => onTimeChange(hour)}
                className={cn('block min-h-11 w-full px-2 py-2 text-center text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary disabled:opacity-50',
                  hour === time ? 'bg-primary font-semibold text-primary-foreground' : 'text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800')}>
                {hour}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function BrainDateTimePicker({ id, value, onChange, className, placeholder = 'DD/MM/AAAA HH:mm', disabled, ariaLabel, defaultTime = '09:00', name }) {
  const pickerRef = useRef(null);
  const { dateKey, time } = splitDateTimeKey(value);
  const selected = dateKeyToPickerDate(dateKey);

  return (
    <ClockContext.Provider value={{
      time,
      canSelectTime: Boolean(selected),
      onClose: () => pickerRef.current?.setOpen(false),
      onTimeChange: nextTime => {
        if (!dateKey) return;
        onChange(joinDateTimeKey(dateKey, nextTime));
        pickerRef.current?.setOpen(false);
      }
    }}>
      <DatePicker
        ref={pickerRef}
        id={id}
        name={name}
        {...brainDatePickerProps}
        strictParsing
        selected={selected}
        value={formatDateTimeText(dateKey, time)}
        onChangeRaw={event => {
          const raw = event?.target?.value;
          if (typeof raw !== 'string') return;
          // Never let the picker parse the wall-clock hour with the device timezone.
          event.preventDefault();
          if (raw.trim() === '') { onChange(''); return; }
          const parsed = parseDateTimeText(raw);
          if (parsed) onChange(joinDateTimeKey(parsed.dateKey, parsed.time || time || defaultTime));
        }}
        onChange={date => {
          if (!date) { onChange(''); return; }
          onChange(joinDateTimeKey(pickerDateToKey(date), time || defaultTime));
        }}
        dateFormat="dd/MM/yyyy HH:mm"
        shouldCloseOnSelect={false}
        calendarContainer={CalendarWithClock}
        popperPlacement="bottom-start"
        placeholderText={placeholder}
        disabled={disabled}
        ariaLabel={ariaLabel}
        className={cn(brainDateInputClass, className)}
        wrapperClassName="w-full"
        autoComplete="off"
      />
    </ClockContext.Provider>
  );
}

export default BrainDatePicker;
