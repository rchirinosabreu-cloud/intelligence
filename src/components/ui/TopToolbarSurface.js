import React from 'react';

const TopToolbarSurface = ({ children }) => React.createElement(
    'div',
    {
        'data-task-format-toolbar': 'true',
        className: [
            'relative z-[120] mb-2 self-end',
            'flex max-w-[calc(100vw-2rem)] flex-nowrap items-center gap-1.5 overflow-x-auto',
            'rounded-xl border border-zinc-200 bg-white p-2 shadow-lg scrollbar-none',
            'dark:border-zinc-800 dark:bg-zinc-900',
            'animate-in slide-in-from-bottom-2 duration-150',
        ].join(' '),
    },
    children,
);

export default TopToolbarSurface;
