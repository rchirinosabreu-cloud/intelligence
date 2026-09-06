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
      shift({ padding: 16 }),
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
            className="brain-popover-surface z-[70] w-64 overflow-y-auto p-4"
          >
            <div className="flex items-center gap-3">
              <TeamAvatar member={user} size={32} showTitle={false} className="h-8 w-8 shrink-0" />
              <div className="flex min-w-0 flex-col">
                <span className="text-sm font-semibold leading-5">
                  {user.name}
                </span>
                <span className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                  {user.role || 'Colaborador'}
                </span>
              </div>
            </div>

            {user.statusMessage && (
               <div className="mt-3 pt-3 border-t border-zinc-100 dark:border-zinc-800">
                  <p className="line-clamp-3 text-xs leading-5 text-zinc-600 dark:text-zinc-300">
                    {user.statusMessage}
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
