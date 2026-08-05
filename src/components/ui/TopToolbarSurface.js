import React from 'react';

const TopToolbarSurface = ({ children }) => React.createElement(
    'div',
    {
        'data-task-format-toolbar': 'true',
        'data-toolbar-placement': 'in-flow',
        className: [
            'relative z-10',
            'flex w-full flex-nowrap items-center gap-1.5 overflow-x-auto',
            'border-b border-zinc-200 bg-white/80 px-2 py-1.5 scrollbar-none backdrop-blur-sm',
            'dark:border-zinc-800 dark:bg-zinc-950/80',
            'animate-in fade-in slide-in-from-bottom-1 duration-150',
        ].join(' '),
    },
    children,
);

export default TopToolbarSurface;
