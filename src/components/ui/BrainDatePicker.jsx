import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import DatePicker from 'react-datepicker';
import * as Popover from '@radix-ui/react-popover';
import { Clock, X } from '@/components/ui/icons';
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

/**
 * Dentro de un modal el diálogo recorta al panel del calendario: no le cabe bajo el
 * campo, react-datepicker lo voltea hacia arriba y acaba tapando el formulario entero
 * (Rodny, 22 de septiembre de 2026). Sacándolo a un portal del `body` deja de estar
 * recortado y vuelve a abrirse debajo, que es donde sí cabe. La posición fija lo
 * mantiene pegado al campo aunque la página se desplace.
 */
const brainPopperProps = {
  portalId: 'brain-datepicker-portal',
  popperProps: { strategy: 'fixed' }
};

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
      {...brainPopperProps}
      autoComplete="off"
    />
  );
}

// ---- month -------------------------------------------------------------------------------------------------

/**
 * The one month picker of the platform. Financiero needed "mes y año" (the accounting
 * period of a cuenta por cobrar) and, with no shared answer, the module reached for a
 * raw DatePicker with `showMonthYearPicker`: a grid nobody had styled, that looked
 * nothing like the platform's calendar (Rodny, 22 September 2026).
 *
 *   BrainMonthPicker  value 'YYYY-MM-01'  onChange('YYYY-MM-01' | '')
 *
 * The value stays the first day of the month so it keeps travelling as a plain date
 * string, like every other field, and nothing downstream has to learn a new shape.
 */
export function BrainMonthPicker({ id, value, onChange, className, placeholder = 'Mes y año', min, max, disabled, isClearable = false, ariaLabel, required, name }) {
  const monthKey = date => (date ? `${pickerDateToKey(date).slice(0, 7)}-01` : '');
  return (
    <DatePicker
      id={id}
      name={name}
      {...brainDatePickerProps}
      selected={dateKeyToPickerDate(value)}
      onChange={date => onChange(monthKey(date))}
      minDate={dateKeyToPickerDate(min) || undefined}
      maxDate={dateKeyToPickerDate(max) || undefined}
      showMonthYearPicker
      dateFormat="MMMM 'de' yyyy"
      placeholderText={placeholder}
      disabled={disabled}
      required={required}
      isClearable={isClearable && !disabled}
      ariaLabelledBy={undefined}
      ariaLabel={ariaLabel}
      className={cn(brainDateInputClass, className)}
      // Las dos: la base da borde, sombra y cabecera; la de meses, la rejilla.
      // Poner solo la segunda pisaría `brainDatePickerProps` y dejaría el panel sin estilo.
      calendarClassName="brain-datepicker brain-datepicker-months"
      wrapperClassName="w-full"
      popperPlacement="bottom-start"
      {...brainPopperProps}
      autoComplete="off"
    />
  );
}

// ---- date + time -------------------------------------------------------------------------------------------

const ClockContext = createContext(null);

/**
 * The one hour list of the platform: the "Hora" column of the calendar, also used on its own by BrainTimePicker.
 * `hours` are 'HH:mm' strings (quarter hours by default); a stored hour outside the list is shown anyway.
 */
export function BrainTimeColumn({ hours = QUARTER_HOURS, time, canSelectTime = true, onTimeChange, className }) {
  const listRef = useRef(null);
  const list = !time || hours.includes(time) ? hours : [...hours, time].sort();

  useEffect(() => {
    const element = listRef.current;
    const selected = element?.querySelector('[aria-pressed="true"]');
    if (selected) element.scrollTop = selected.offsetTop - element.offsetTop - element.clientHeight / 2 + selected.clientHeight / 2;
  }, [time]);

  // The hour list scrolls itself with the wheel. A modal dialog's scroll lock cancels the wheel for anything
  // drawn outside it, and this list is portaled, so without this it simply would not scroll (measured
  // 21 September 2026). React attaches `onWheel` as passive, so the listener has to be a native one.
  useEffect(() => {
    const element = listRef.current;
    if (!element) return undefined;
    const onWheel = (event) => {
      event.preventDefault();
      element.scrollTop += event.deltaY;
    };
    element.addEventListener('wheel', onWheel, { passive: false });
    return () => element.removeEventListener('wheel', onWheel);
  }, []);

  return (
    <div data-brain-time-column className={cn('flex w-20 shrink-0 flex-col border-l border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900', className)}>
      <div className="border-b border-zinc-100 px-2 py-3 text-center text-sm font-semibold text-zinc-900 dark:border-zinc-800 dark:text-zinc-100">Hora</div>
      <div ref={listRef} className="relative max-h-64 overflow-y-auto overscroll-contain py-1">
        {list.map(hour => (
          <button key={hour} type="button" aria-pressed={hour === time} disabled={!canSelectTime} onClick={() => onTimeChange(hour)}
            // Keep focus where it is: inside a modal dialog, moving focus to a portaled list makes the dialog pull it
            // back and the list dismiss itself before the click lands (keyboard users still tab into the list).
            onMouseDown={event => event.preventDefault()}
            className={cn('block min-h-11 w-full px-2 py-2 text-center text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary disabled:opacity-50',
              hour === time ? 'bg-primary font-semibold text-primary-foreground' : 'text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800')}>
            {hour}
          </button>
        ))}
      </div>
    </div>
  );
}

function CalendarWithClock({ className, children }) {
  const { time, canSelectTime, onTimeChange, onClose } = useContext(ClockContext);

  return (
    <div data-brain-date-time-popup className={className} role="dialog" aria-label="Elegir fecha y hora" onKeyDown={event => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      onClose();
    }}>
      <div className="flex max-w-[calc(100vw-2rem)]">
        <div className="relative min-w-0 bg-white dark:bg-zinc-900">{children}</div>
        <BrainTimeColumn time={time} canSelectTime={canSelectTime} onTimeChange={onTimeChange} />
      </div>
    </div>
  );
}

// ---- hour only ---------------------------------------------------------------------------------------------

/**
 * A clock button that opens the platform's hour list (Rodny, 21 September 2026: "solo un icono de reloj").
 *   value 'HH:mm' | ''   onChange('HH:mm' | '')
 * With an hour set, the button shows it and a small X clears it. `hours` narrows the list (e.g. the working day).
 */
export function BrainTimePicker({ id, value, onChange, hours = QUARTER_HOURS, disabled, ariaLabel = 'Hora', clearLabel = 'Quitar hora', title, className }) {
  const [open, setOpen] = useState(false);
  const active = Boolean(value);

  return (
    <div data-brain-time-picker className={cn('relative inline-flex shrink-0 items-stretch', className)}>
      <Popover.Root open={open && !disabled} onOpenChange={setOpen}>
        <Popover.Trigger asChild>
          <button
            type="button"
            id={id}
            disabled={disabled}
            aria-label={active ? `${ariaLabel}: ${value}` : ariaLabel}
            aria-pressed={active}
            title={title || ariaLabel}
            className={cn(
              'inline-flex h-full min-w-11 items-center justify-center gap-1.5 rounded-lg border px-2.5 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-50',
              active
                ? 'border-brand-cyan/50 bg-brand-cyan/10 pr-8 text-brand-cyan-deep dark:text-brand-cyan'
                : 'border-zinc-200/70 text-zinc-400 hover:border-primary/50 hover:text-brand-cyan-deep dark:border-zinc-800/70 dark:hover:text-brand-cyan'
            )}
          >
            <Clock className="h-4 w-4 shrink-0" aria-hidden="true" />
            {active && <span className="tabular-nums">{value}</span>}
          </button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            align="end"
            sideOffset={6}
            collisionPadding={8}
            onOpenAutoFocus={event => event.preventDefault()}
            // Inside a modal dialog the dialog keeps focus for itself; that must not close the list.
            onFocusOutside={event => event.preventDefault()}
            // A modal dialog switches pointer events off for the whole body; the portaled list must switch them back on.
            style={{ pointerEvents: 'auto' }}
            className="brain-popover-surface z-[130] w-24 overflow-hidden p-0"
          >
            <BrainTimeColumn hours={hours} time={value} onTimeChange={hour => { onChange(hour); setOpen(false); }} className="w-full border-l-0" />
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
      {active && !disabled && (
        <button
          type="button"
          aria-label={clearLabel}
          title={clearLabel}
          onClick={() => onChange('')}
          className="absolute right-1 top-1/2 inline-flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-zinc-400 transition-colors hover:bg-destructive/10 hover:text-destructive focus:outline-none focus-visible:ring-2 focus-visible:ring-destructive/30"
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      )}
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
