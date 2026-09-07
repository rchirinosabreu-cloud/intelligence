import React, { createContext, useContext, useEffect, useRef } from 'react';
import DatePicker from 'react-datepicker';
import { brainDatePickerProps } from '@/lib/brainDatePicker';
import { formatCalendarDateTimeInput, parseCalendarDateInput, parseCalendarDateTimeInput } from './calendarPresentation';

const ClockContext = createContext(null);
const QUARTER_HOURS = Array.from({ length: 96 }, (_, index) =>
  `${String(Math.floor(index / 4)).padStart(2, '0')}:${String((index % 4) * 15).padStart(2, '0')}`);

function CalendarWithClock({ className, children }) {
  const { time, isAllDay, canSelectTime, onTimeChange, onClose } = useContext(ClockContext);
  const listRef = useRef(null);
  const hours = QUARTER_HOURS.includes(time) || !time ? QUARTER_HOURS : [...QUARTER_HOURS, time].sort();

  useEffect(() => {
    const list = listRef.current;
    const selected = list?.querySelector('[aria-pressed="true"]');
    if (selected) list.scrollTop = selected.offsetTop - list.offsetTop - list.clientHeight / 2 + selected.clientHeight / 2;
  }, [time]);

  return (
    <div data-calendar-date-time-popup className={className} role="dialog" aria-label={isAllDay ? 'Elegir fecha' : 'Elegir fecha y hora'} onKeyDown={event => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      onClose();
    }}>
      <div className="flex max-w-[calc(100vw-2rem)]">
        <div className="relative min-w-0 bg-white dark:bg-zinc-900">{children}</div>
        {!isAllDay && <div data-calendar-time-column className="flex w-20 shrink-0 flex-col border-l border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
          <div className="border-b border-zinc-100 px-2 py-3 text-center text-sm font-semibold text-zinc-900 dark:border-zinc-800 dark:text-zinc-100">Hora</div>
          <div ref={listRef} className="relative max-h-64 overflow-y-auto overscroll-contain py-1">
            {hours.map(hour => <button key={hour} type="button" aria-pressed={hour === time} disabled={!canSelectTime} onClick={() => onTimeChange(hour)}
              className={`block min-h-11 w-full px-2 py-2 text-center text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary disabled:opacity-50 ${hour === time
                ? 'bg-primary font-semibold text-primary-foreground'
                : 'text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800'}`}>{hour}</button>)}
          </div>
        </div>}
      </div>
    </div>
  );
}

export default function CalendarDateTimePicker({ id, selected, time, isAllDay, draft, onRawChange, onChange, className }) {
  const pickerRef = useRef(null);
  const timeSelectionDate = draft === undefined ? selected : parseCalendarDateInput(draft.split(' ')[0]);
  return (
    <ClockContext.Provider value={{ time, isAllDay, canSelectTime: Boolean(timeSelectionDate), onClose: () => pickerRef.current?.setOpen(false), onTimeChange: nextTime => {
      if (!timeSelectionDate) return;
      onChange({ date: timeSelectionDate, time: nextTime });
      pickerRef.current?.setOpen(false);
    } }}>
      <DatePicker
        ref={pickerRef}
        id={id}
        {...brainDatePickerProps}
        strictParsing
        selected={selected}
        value={draft ?? formatCalendarDateTimeInput(selected, time, isAllDay)}
        onChangeRaw={event => {
          const raw = event?.target?.value;
          if (typeof raw !== 'string') return;
          // Never let DatePicker parse the wall-clock hour using the device timezone.
          event.preventDefault();
          onRawChange(raw, parseCalendarDateTimeInput(raw, isAllDay));
        }}
        onChange={date => {
          if (!date) return;
          const noon = new Date(date);
          noon.setHours(12, 0, 0, 0);
          onChange({ date: noon, time });
        }}
        dateFormat="dd/MM/yyyy"
        shouldCloseOnSelect={isAllDay}
        calendarContainer={CalendarWithClock}
        popperPlacement="bottom-start"
        placeholderText={isAllDay ? 'DD/MM/AAAA' : 'DD/MM/AAAA HH:mm'}
        className={className}
        wrapperClassName="w-full"
      />
    </ClockContext.Provider>
  );
}
