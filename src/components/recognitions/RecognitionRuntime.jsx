import React, { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';
import RecognitionNotice from './RecognitionNotice';

export default function RecognitionRuntime({ userId, disabled = false }) {
  const [notice, setNotice] = useState(null);
  const noticeRef = useRef(null);
  const [blocked, setBlocked] = useState(true);
  const queryClient = useQueryClient();
  useEffect(() => {
    setNotice(null);
    noticeRef.current = null;
    if (!userId || disabled) return;
    let stopped = false, busy = false, nextPoll = Date.now() + 2000;
    let showingUntil = 0;
    const post = async (path, body) => {
      const token = localStorage.getItem('authToken');
      const response = await fetch(`${getApiBaseUrl()}/api/recognitions/${path}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body),
      });
      const data = await response.json();
      if (!response.ok) throw Object.assign(new Error(data.error || 'Error de reconocimientos'), { response: { data }, status: response.status });
      return data;
    };
    const tick = async () => {
      const isBlocked = document.hidden || [...document.querySelectorAll('[role="dialog"], [aria-modal="true"]')].some(node => node.getClientRects().length > 0);
      if (stopped) return;
      setBlocked(isBlocked);
      if (isBlocked || busy || noticeRef.current || Date.now() < nextPoll || Date.now() < showingUntil) return;
      busy = true; nextPoll = Date.now() + 20000;
      try {
        const { recognition } = await post('claim', {});
        if (stopped || !recognition || recognition.recipient?.id !== userId) return;
        // Do not consume a reserved notice if a critical dialog opened while the request was in flight.
        if (document.hidden || [...document.querySelectorAll('[role="dialog"], [aria-modal="true"]')].some(node => node.getClientRects().length > 0)) return;
        await post(`${recognition.id}/acknowledge`, { leaseToken: recognition.leaseToken });
        if (stopped) return;
        showingUntil = Date.now() + 30000;
        noticeRef.current = recognition;
        setNotice(recognition);
        queryClient.invalidateQueries({ queryKey: ['personal-dashboard'] });
      } catch (error) {
        console.error('[Recognitions] Delivery failed:', error.response?.data || error.message);
        nextPoll = Date.now() + (error.status === 401 || error.status === 403 ? 60000 : 20000);
      } finally { busy = false; }
    };
    const timer = window.setInterval(tick, 1000);
    document.addEventListener('visibilitychange', tick);
    return () => { stopped = true; window.clearInterval(timer); document.removeEventListener('visibilitychange', tick); };
  }, [userId, disabled, queryClient]);
  if (disabled) return null;
  return <RecognitionNotice event={blocked ? null : notice} onDismiss={() => { noticeRef.current = null; setNotice(null); }} />;
}
