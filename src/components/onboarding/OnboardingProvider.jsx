import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';
import WelcomeDialog from './WelcomeDialog';
import QuotationGuide from './QuotationGuide';

const GuideContext = createContext(null);
async function requestProgress(options) {
  const response = await fetch(`${getApiBaseUrl()}/api/user/onboarding`, { cache: 'no-store', ...options });
  const data = await response.json();
  if (!response.ok) {
    console.error('[Onboarding] No se pudo confirmar la guía:', data);
    throw new Error(data.error || 'No pudimos guardar tu avance. Inténtalo de nuevo.');
  }
  return data;
}

// Key this provider by the authenticated user. Progress never crosses accounts.
export function OnboardingProvider({ userId, pathname, blocked = false, onBlockingChange, children }) {
  const client = useQueryClient();
  const fallbackFocus = useRef(null);
  const returnFocus = useRef(null);
  const alive = useRef(true);
  const saving = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [manualGuide, setManualGuide] = useState(false);
  const [welcomeDismissedPath, setWelcomeDismissedPath] = useState(null);
  const [otherDialog, setOtherDialog] = useState(false);
  const { data, isPending, isError } = useQuery({
    queryKey: ['onboarding', userId], queryFn: () => requestProgress(), enabled: Boolean(userId),
    staleTime: 0, refetchInterval: 60000, refetchIntervalInBackground: false, retry: 1,
  });
  const user = !isError && data?.user?.id === userId ? data.user : null;
  const needsWelcome = Boolean(user && !data.progress.welcome);
  const canGuide = Boolean(user && (user.role === 'ADMIN' || user.modulePermissions?.cotizaciones === true));
  const atQuotations = pathname === '/cotizaciones';
  const autoGuide = canGuide && atQuotations && !needsWelcome && !data.progress.cotizaciones && welcomeDismissedPath !== pathname;
  const welcomeOpen = needsWelcome && !blocked && !otherDialog;
  const guideOpen = canGuide && atQuotations && !needsWelcome && (manualGuide || autoGuide) && !blocked && !otherDialog;
  const isBlocking = Boolean(userId && isPending) || needsWelcome || guideOpen;

  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);
  useEffect(() => { onBlockingChange?.(isBlocking); }, [isBlocking, onBlockingChange]);
  useEffect(() => {
    // Wait for task dialogs instead of placing a second overlay above them.
    const inspect = () => setOtherDialog(Boolean(document.querySelector('[role="dialog"][data-state="open"]:not([data-onboarding-dialog]), [role="alertdialog"][data-state="open"]')));
    inspect();
    const observer = new MutationObserver(inspect);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-state'] });
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!canGuide || !atQuotations) setManualGuide(false);
    if (welcomeDismissedPath !== null && welcomeDismissedPath !== pathname) setWelcomeDismissedPath(null);
  }, [canGuide, atQuotations, pathname, welcomeDismissedPath]);

  async function acknowledge(guideId, status) {
    if (saving.current) return;
    saving.current = true;
    setBusy(true); setError('');
    try {
      const result = await requestProgress({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ guideId, version: 1, status }) });
      if (!alive.current) return;
      if (guideId === 'welcome') setWelcomeDismissedPath(pathname);
      else setManualGuide(false);
      client.setQueryData(['onboarding', userId], previous => previous ? { ...previous, progress: { ...previous.progress, [guideId]: result.status } } : previous);
    } catch (failure) {
      console.error('[Onboarding] Guardado no confirmado:', failure);
      if (alive.current) setError(failure.message);
    } finally {
      saving.current = false;
      if (alive.current) setBusy(false);
    }
  }
  function openGuide(event) {
    returnFocus.current = event.currentTarget;
    setError(''); setManualGuide(true);
  }
  return <GuideContext.Provider value={{ canGuide: canGuide && atQuotations && !needsWelcome, openGuide }}>
    <div ref={fallbackFocus} tabIndex={-1} className="outline-none">{children}</div>
    <WelcomeDialog user={user} open={welcomeOpen} busy={busy} error={error} returnFocusRef={fallbackFocus}
      onOpenChange={open => { if (!open && !busy) acknowledge('welcome', 'COMPLETED'); }} />
    {guideOpen && <QuotationGuide open busy={busy} error={error} returnFocusRef={returnFocus.current ? returnFocus : fallbackFocus}
      onDismiss={status => acknowledge('cotizaciones', status === 'completed' ? 'COMPLETED' : 'SKIPPED')} />}
  </GuideContext.Provider>;
}
export function QuotationGuideButton() {
  const guide = useContext(GuideContext);
  return guide?.canGuide ? <Button variant="ghost" onClick={guide.openGuide}>Ver guía</Button> : null;
}
