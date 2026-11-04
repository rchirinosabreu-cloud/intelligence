import { useCallback, useEffect, useRef, useState } from 'react';
import { clearFormDraft, inspectFormDraft, restoreFormFields, saveFormDraft } from '@/lib/formDraft';

const clone = value => JSON.parse(JSON.stringify(value));
const local = () => { try { return window.localStorage; } catch { return null; } };
const owner = () => { try { return JSON.parse(local()?.getItem('currentUser') || 'null')?.id || null; } catch { return null; } };

export function useFormDraft({ scope, initial, fingerprint = null, open = true, defer = false }) {
  const userId = owner();
  const identity = JSON.stringify([userId, scope, fingerprint]);
  const latestIdentity = useRef(identity); latestIdentity.current = identity;
  const latestInitial = useRef(initial); latestInitial.current = initial;
  const makeSession = (base, version, restore = true) => {
    const entry = restore ? inspectFormDraft(local(), userId, scope, { fingerprint: version }) : null;
    const saved = entry && !entry.conflict ? entry.form : null;
    return { identity, userId, scope, fingerprint: version, baseline: clone(base), form: restoreFormFields(clone(base), saved), saved: !!saved, restored: !!saved, unavailable: false, ready: !defer,
      conflict: !!entry?.conflict, conflictForm: entry?.conflict ? entry.form : null, revision: 0 };
  };
  const [session, setSession] = useState(() => makeSession(initial, fingerprint, !defer));
  const current = useRef(session);
  const previousOpen = useRef(open);
  const publish = useCallback(next => { current.current = next; setSession(next); }, []);
  const initialize = useCallback((base, { fingerprint: version = null, restore = true } = {}) => {
    if (identity !== latestIdentity.current) return;
    const entry = restore ? inspectFormDraft(local(), userId, scope, { fingerprint: version }) : null;
    const saved = entry && !entry.conflict ? entry.form : null;
    publish({ identity, userId, scope, fingerprint: version, baseline: clone(base), form: restoreFormFields(clone(base), saved), saved: !!saved, restored: !!saved, unavailable: false, ready: true,
      conflict: !!entry?.conflict, conflictForm: entry?.conflict ? entry.form : null, revision: current.current.revision + 1 });
  }, [identity, userId, scope, publish]);
  useEffect(() => {
    if (identity !== current.current.identity || (open && !previousOpen.current)) {
      if (!defer) initialize(latestInitial.current, { fingerprint });
      else publish({ ...current.current, identity, userId, scope, ready: false, form: clone(latestInitial.current), baseline: clone(latestInitial.current),
        saved: false, restored: false, unavailable: false, conflict: false, conflictForm: null });
    }
    previousOpen.current = open;
  }, [identity, userId, scope, open, defer, fingerprint, initialize, publish]);
  const setForm = useCallback(update => {
    const previous = current.current;
    // También detiene efectos de editores hijos mientras la persona decide qué copia conservar.
    if (previous.identity !== latestIdentity.current || previous.conflict || !previous.ready) return;
    const nextForm = typeof update === 'function' ? update(clone(previous.form)) : update;
    if (JSON.stringify(nextForm) === JSON.stringify(previous.form)) return;
    const changed = JSON.stringify(nextForm) !== JSON.stringify(previous.baseline);
    const ok = previous.ready && (changed
      ? saveFormDraft(local(), previous.userId, previous.scope, nextForm, { fingerprint: previous.fingerprint })
      : clearFormDraft(local(), previous.userId, previous.scope));
    publish({ ...previous, form: nextForm, saved: changed && ok, unavailable: changed && !ok });
  }, [publish]);
  const clear = useCallback(() => {
    const previous = current.current;
    if (identity !== latestIdentity.current || previous.identity !== identity) return;
    clearFormDraft(local(), previous.userId, previous.scope);
    publish({ ...previous, baseline: clone(previous.form), saved: false, restored: false, unavailable: false, conflict: false, conflictForm: null });
  }, [identity, publish]);
  const discard = useCallback(() => {
    const previous = current.current;
    if (identity !== latestIdentity.current || previous.identity !== identity) return;
    clearFormDraft(local(), previous.userId, previous.scope);
    publish({ ...previous, form: clone(previous.baseline), saved: false, restored: false, unavailable: false, conflict: false, conflictForm: null, revision: previous.revision + 1 });
  }, [identity, publish]);
  const recover = useCallback(() => {
    const previous = current.current;
    if (identity !== latestIdentity.current || previous.identity !== identity || !previous.conflict || !previous.ready) return;
    const form = restoreFormFields(clone(previous.baseline), previous.conflictForm);
    const changed = JSON.stringify(form) !== JSON.stringify(previous.baseline);
    const ok = changed
      ? saveFormDraft(local(), previous.userId, previous.scope, form, { fingerprint: previous.fingerprint })
      : clearFormDraft(local(), previous.userId, previous.scope);
    publish({ ...previous, form, saved: changed && ok, restored: true, unavailable: !ok,
      conflict: false, conflictForm: null, revision: previous.revision + 1 });
  }, [identity, publish]);
  const commit = useCallback((form, { fingerprint: version = current.current.fingerprint } = {}) => {
    if (identity !== latestIdentity.current || current.current.identity !== identity) return;
    clearFormDraft(local(), current.current.userId, current.current.scope);
    publish({ ...current.current, form: clone(form), baseline: clone(form), fingerprint: version, saved: false, restored: false, unavailable: false, ready: true, conflict: false, conflictForm: null });
  }, [identity, publish]);
  // No exponer datos de la identidad anterior ni siquiera durante el render previo al efecto.
  const isCurrent = session.identity === identity;
  return [isCurrent ? session.form : clone(initial), setForm, { saved: isCurrent && session.saved, restored: isCurrent && session.restored,
    unavailable: isCurrent && session.unavailable, conflict: isCurrent && session.conflict, revision: session.revision,
    ready: isCurrent && session.ready, clear, discard, recover, initialize, commit }];
}
