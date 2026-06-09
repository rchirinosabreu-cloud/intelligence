import React, { useState, useRef } from 'react';
import {
  useFloating,
  autoUpdate,
  offset,
  flip,
  shift,
  useHover,
  useFocus,
  useDismiss,
  useRole,
  useInteractions,
  FloatingPortal,
} from '@floating-ui/react';
import TeamAvatar from './TeamAvatar';

const UserAvatarPopover = ({ user, children, side = "top" }) => {
  const [isOpen, setIsOpen] = useState(false);

  const { refs, floatingStyles, context } = useFloating({
    open: isOpen,
    onOpenChange: setIsOpen,
    placement: side,
    whileElementsMounted: autoUpdate,
    middleware: [
      offset(8),
      flip({
        fallbackAxisSideDirection: "start",
      }),
      shift({ padding: 5 }),
    ],
  });

  const hover = useHover(context, { move: false, delay: { open: 200, close: 150 } });
  const focus = useFocus(context);
  const dismiss = useDismiss(context);
  const role = useRole(context, { role: "tooltip" });

  const { getReferenceProps, getFloatingProps } = useInteractions([
    hover,
    focus,
    dismiss,
    role,
  ]);

  if (!user) return children;

  return (
    <>
      <div
        ref={refs.setReference}
        {...getReferenceProps()}
        className="inline-block"
      >
        {children}
      </div>
      <FloatingPortal>
        {isOpen && (
          <div
            ref={refs.setFloating}
            style={floatingStyles}
            {...getFloatingProps()}
            className="z-[9999] bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-4 rounded-2xl shadow-2xl min-w-[200px] animate-in fade-in zoom-in-95 duration-100"
          >
            <div className="flex items-center gap-3">
              <TeamAvatar member={user} size={40} showTitle={false} className="w-10 h-10 ring-2 ring-indigo-500/20" />
              <div className="flex flex-col">
                <span className="text-sm font-bold text-zinc-900 dark:text-white leading-none">
                  {user.name}
                </span>
                <span className="text-[10px] text-zinc-500 dark:text-zinc-400 font-medium mt-1">
                  {user.role || 'Colaborador'}
                </span>
              </div>
            </div>

            {user.statusMessage && (
               <div className="mt-3 pt-3 border-t border-zinc-100 dark:border-zinc-800">
                  <p className="text-[10px] text-zinc-500 dark:text-zinc-400 italic italic leading-relaxed line-clamp-2">
                    "{user.statusMessage}"
                  </p>
               </div>
            )}
          </div>
        )}
      </FloatingPortal>
    </>
  );
};

export default UserAvatarPopover;
