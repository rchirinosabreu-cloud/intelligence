import { useEffect, useRef, useState } from "react";

export default function useMessageGestures(item, { message, selectionMode, onReply, onReact }) {
  const latest = useRef({ message, selectionMode, onReply, onReact });
  latest.current = { message, selectionMode, onReply, onReact };
  const gesture = useRef(null), timer = useRef(null), lastTouch = useRef(0);
  const [offset, setOffset] = useState(0);
  const allowed = (target) => !latest.current.message.deletedAt && !latest.current.selectionMode &&
    item.current?.contains(target) && !target.closest('a,button,input,textarea,select,audio,video,[role="button"],[role="dialog"],[contenteditable="true"]');
  const clearHold = () => { clearTimeout(timer.current); timer.current = null; };
  const reset = () => { clearHold(); gesture.current = null; setOffset(0); };
  const begin = (target, point, source) => {
    if (!allowed(target)) return;
    reset();
    lastTouch.current = Date.now();
    const start = { x: point.clientX, y: point.clientY, id: point.identifier ?? point.pointerId, source, held: false };
    gesture.current = start;
    timer.current = setTimeout(() => {
      if (gesture.current !== start || latest.current.message.deletedAt || latest.current.selectionMode) return;
      start.held = true;
      setOffset(0);
      latest.current.onReact();
    }, 500);
  };
  const move = (point, event, source) => {
    const start = gesture.current;
    if (!start || start.source !== source || start.id !== (point.identifier ?? point.pointerId)) return;
    const dx = point.clientX - start.x, dy = Math.abs(point.clientY - start.y);
    if (start.held) { if (event.cancelable) event.preventDefault(); return; }
    if (Math.hypot(dx, dy) > 10) clearHold();
    if ((dy > 12 && dy > Math.abs(dx)) || dx < -12) { reset(); return; }
    if (dx > 12 && dx > dy * 1.5) {
      if (event.cancelable) event.preventDefault();
      setOffset(Math.min(dx, 72));
    }
  };
  const finish = (point, source) => {
    const start = gesture.current;
    if (!start || start.source !== source || start.id !== (point.identifier ?? point.pointerId)) return;
    reset();
    if (start.held || latest.current.message.deletedAt || latest.current.selectionMode) return;
    const dx = point.clientX - start.x, dy = Math.abs(point.clientY - start.y);
    if (dx >= 48 && dy <= 28 && dx > dy * 1.5) latest.current.onReply?.(latest.current.message);
  };
  // Native non-passive touchmove reserves horizontal movement on mobile browsers.
  // Pointer Events remain a fallback; an active Touch sequence owns its gesture.
  const handlers = useRef(null);
  handlers.current = { begin, move, finish, reset };
  useEffect(() => {
    const node = item.current;
    if (!node) return;
    const start = (event) => {
      if (event.touches.length !== 1) { handlers.current.reset(); return; }
      handlers.current.begin(event.target, event.touches[0], "touch");
    };
    const moveTouch = (event) => {
      if (event.touches.length !== 1) { handlers.current.reset(); return; }
      handlers.current.move(event.touches[0], event, "touch");
    };
    const end = (event) => { if (event.changedTouches[0]) handlers.current.finish(event.changedTouches[0], "touch"); };
    const cancel = () => handlers.current.reset();
    node.addEventListener("touchstart", start, { passive: true });
    node.addEventListener("touchmove", moveTouch, { passive: false });
    node.addEventListener("touchend", end);
    node.addEventListener("touchcancel", cancel);
    return () => {
      clearTimeout(timer.current);
      gesture.current = null;
      node.removeEventListener("touchstart", start);
      node.removeEventListener("touchmove", moveTouch);
      node.removeEventListener("touchend", end);
      node.removeEventListener("touchcancel", cancel);
    };
  }, [item]);
  useEffect(() => { handlers.current.reset(); }, [message.id, message.deletedAt, selectionMode]);
  return {
    offset,
    props: {
      onDoubleClick: (event) => { if (allowed(event.target)) latest.current.onReply?.(latest.current.message); },
      onPointerDown: (event) => {
        if (event.pointerType !== "touch" || event.isPrimary === false || gesture.current?.source === "touch") return;
        begin(event.target, event, "pointer");
      },
      onPointerMove: (event) => move(event, event, "pointer"),
      onPointerUp: (event) => finish(event, "pointer"),
      onPointerCancel: () => { if (gesture.current?.source === "pointer") reset(); },
      onLostPointerCapture: () => { if (gesture.current?.source === "pointer") reset(); },
      onContextMenu: (event) => { if (Date.now() - lastTouch.current < 1500 && allowed(event.target)) event.preventDefault(); },
    },
  };
}
