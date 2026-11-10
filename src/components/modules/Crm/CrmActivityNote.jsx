import React, { useEffect, useMemo, useRef, useState } from 'react';
import { crmRequest } from './crmApi';
import { matchActivityNotes } from '@/lib/crmActivitySuggestions';
import { cn } from '@/lib/utils';

export default function CrmActivityNote({ id, value, onChange, refreshKey, ...props }) {
  const [phrases, setPhrases] = useState([]);
  const [focused, setFocused] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [active, setActive] = useState(-1);
  const input = useRef(null);
  useEffect(() => {
    if (!loaded) return undefined;
    const controller = new AbortController();
    crmRequest('/activity-suggestions', { signal: controller.signal })
      .then(data => { if (!controller.signal.aborted) setPhrases(data.suggestions || []); })
      .catch(error => {
        if (!controller.signal.aborted) { console.error('[CRM] Frases frecuentes:', error.message); setPhrases([]); }
      });
    return () => controller.abort();
  }, [loaded, refreshKey]);
  const matches = useMemo(() => matchActivityNotes(phrases, value), [phrases, value]);
  const open = focused && !dismissed && matches.length > 0;
  const choose = text => { onChange(text); setDismissed(true); setActive(-1); input.current?.focus(); };
  const keyDown = event => {
    if (!open || event.nativeEvent.isComposing) return;
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setDismissed(true); return; }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault(); setActive(index => (index + (event.key === 'ArrowDown' ? 1 : matches.length - 1) + matches.length) % matches.length); return;
    }
    if ((event.key === 'Tab' && !event.shiftKey) || (event.key === 'Enter' && active >= 0)) {
      event.preventDefault(); choose(matches[active < 0 ? 0 : active]);
    }
  };
  return <div>
    <textarea {...props} ref={input} id={id} value={value} autoComplete="off" aria-autocomplete="list"
      aria-controls={open ? `${id}-suggestions` : undefined} aria-activedescendant={open && active >= 0 ? `${id}-suggestion-${active}` : undefined}
      aria-describedby={open ? `${id}-hint` : undefined}
      onFocus={() => { setFocused(true); setLoaded(true); }} onBlur={() => setFocused(false)} onKeyDown={keyDown}
      onChange={event => { onChange(event.target.value); setDismissed(false); setActive(-1); }} />
    {open && <div className="mt-1 rounded-xl border border-zinc-200 bg-white p-2 shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
      <p id={`${id}-hint`} className="mb-1 px-2 text-xs text-zinc-500 dark:text-zinc-400">Tus frases frecuentes · Tab para completar</p>
      <div id={`${id}-suggestions`} role="listbox" aria-label="Tus frases frecuentes">
        {matches.map((text, index) => <button key={text} type="button" role="option" tabIndex={-1} aria-selected={active === index}
          id={`${id}-suggestion-${index}`} onPointerDown={event => event.preventDefault()} onClick={() => choose(text)}
          className={cn('block w-full whitespace-pre-wrap break-words rounded-lg px-2 py-2 text-left text-sm hover:bg-primary/10', active === index && 'bg-primary/10')}>
          {text}
        </button>)}
      </div>
    </div>}
  </div>;
}
