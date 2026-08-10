import React from 'react';

export const formatDateDivider = (dateValue) => {
  try {
    const date = new Date(dateValue);
    const options = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' };
    const formatted = new Intl.DateTimeFormat('es-ES', options).format(date);
    return `— ${formatted.toUpperCase()} —`;
  } catch {
    return '';
  }
};

const DateDivider = ({ date }) => {
  const label = formatDateDivider(date);
  if (!label) return null;

  return (
    <div className="py-4 flex items-center justify-center">
      <span className="text-[10px] font-black tracking-widest text-zinc-400 dark:text-zinc-500 uppercase select-none">
        {label}
      </span>
    </div>
  );
};

export default DateDivider;
