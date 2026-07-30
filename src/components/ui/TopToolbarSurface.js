import React from 'react';

const TopToolbarSurface = ({ children, expanded = false }) => React.createElement(
    'div',
    {
        'data-task-format-toolbar': 'true',
        className: [
            `absolute right-0 z-[120] ${expanded ? 'bottom-[152px]' : 'bottom-full mb-2'}`,
            'flex max-w-[calc(100vw-2rem)] flex-nowrap items-center gap-1.5 overflow-x-auto',
            'rounded-xl border border-zinc-200 bg-white p-2 shadow-lg scrollbar-none',
            'dark:border-zinc-800 dark:bg-zinc-900',
            'animate-in slide-in-from-bottom-2 duration-150',
        ].join(' '),
    },
    children,
);

export default TopToolbarSurface;
