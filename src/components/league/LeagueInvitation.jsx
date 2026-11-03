import React from 'react';
import { useLeagueIntroduction } from '@/components/onboarding/OnboardingProvider';
import LeagueDock from './LeagueDock';

// The existing permission poll notices activation without relying on a stale login or opening another window.
export default function LeagueInvitation({ enabled }) {
  const welcome = useLeagueIntroduction();
  if (!welcome?.available) return null;
  return <LeagueDock key={welcome.userId} userId={welcome.userId} enabled={enabled} welcome={welcome} />;
}
