import { useCallback, useEffect, useMemo, useRef } from 'react';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';

// A notice is reported only while its task card is visible in the foreground dialog.
// Reporting never blocks navigation; retries reuse the same identity and have a fixed limit.
export default function useTaskAlertTrace({ userId, kind, isOpen, disabled = false }) {
  const rootRef = useRef(null);
  const session = useMemo(() => ({ entries: new Map(), userId, kind, isOpen }), [userId, kind, isOpen]);
  const track = useCallback((taskId, action = 'SHOWN') => {
    if (disabled || !session.userId || !session.isOpen) return;
    let entry = session.entries.get(taskId);
    if (!entry) {
      entry = { noticeId: crypto.randomUUID(), sent: new Set(), token: localStorage.getItem('authToken') };
      session.entries.set(taskId, entry);
    }
    const post = async actionName => {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const response = await fetch(`${getApiBaseUrl()}/api/tasks/${taskId}/alert-interaction`, {
            method: 'POST', headers: { 'Content-Type': 'application/json', ...(entry.token ? { Authorization: `Bearer ${entry.token}` } : {}) },
            body: JSON.stringify({ noticeId: entry.noticeId, kind: session.kind, action: actionName }),
            signal: AbortSignal.timeout(5000), keepalive: true,
          });
          const data = await response.json();
          if (!response.ok) throw Object.assign(new Error(data.error || 'No pudimos guardar la acción del aviso.'), { response: { data }, status: response.status });
          return;
        } catch (error) {
          if (attempt === 1 || (error.status && error.status < 500)) throw error;
          await new Promise(resolve => setTimeout(resolve, 250));
        }
      }
    };
    const failed = error => console.error('[TaskAlertTrace]', error.response?.data || error.message);
    if (!entry.shown) {
      entry.shown = post('SHOWN');
      entry.shown.catch(failed);
    }
    if (action !== 'SHOWN' && !entry.sent.has(action)) {
      entry.sent.add(action);
      // A click can arrive before the visibility request finishes. Preserve that order.
      entry.shown.then(() => post(action)).catch(failed);
    }
  }, [disabled, session]);

  useEffect(() => {
    if (disabled || !isOpen || !userId) return;
    const check = () => {
      const root = rootRef.current;
      if (document.hidden || !root || root.dataset.state !== 'open') return;
      const bounds = root.getBoundingClientRect();
      for (const card of root.querySelectorAll('[data-alert-task-id]')) {
        const rect = card.getBoundingClientRect();
        const top = Math.max(0, bounds.top, rect.top), bottom = Math.min(innerHeight, bounds.bottom, rect.bottom);
        const left = Math.max(0, bounds.left, rect.left), right = Math.min(innerWidth, bounds.right, rect.right);
        if (bottom <= top || right <= left) continue;
        const front = document.elementFromPoint((left + right) / 2, (top + bottom) / 2);
        if (front?.closest('[role="dialog"]') === root) track(card.dataset.alertTaskId);
      }
    };
    const frame = requestAnimationFrame(check);
    const timer = setInterval(check, 500);
    document.addEventListener('visibilitychange', check);
    return () => { cancelAnimationFrame(frame); clearInterval(timer); document.removeEventListener('visibilitychange', check); };
  }, [disabled, isOpen, userId, track]);

  const dismiss = useCallback(() => {
    // Tasks already confirmed/snoozed have left this dialog; closing it is not another action on them.
    for (const card of rootRef.current?.querySelectorAll('[data-alert-task-id]') || []) {
      if (session.entries.has(card.dataset.alertTaskId)) track(card.dataset.alertTaskId, 'DISMISS');
    }
  }, [session, track]);
  return { rootRef, track, dismiss };
}
