export function cancelHoverClose(timerRef, timers = globalThis) {
  if (timerRef.current !== null) {
    timers.clearTimeout(timerRef.current);
    timerRef.current = null;
  }
}

export function scheduleHoverClose(timerRef, onClose, delay = 300, timers = globalThis) {
  cancelHoverClose(timerRef, timers);
  timerRef.current = timers.setTimeout(() => {
    timerRef.current = null;
    onClose();
  }, delay);
}
