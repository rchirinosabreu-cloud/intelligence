export const BRIA_CELEBRATION_MS = 930;

// Only replies just saved by send() reach the mascot; history is never a completion event.
export function completedBriaReplyId(chat) {
  const turn = chat?.turns?.at(-1);
  return turn?.role === 'assistant' && turn.id && turn.text?.trim() && !turn.failures?.length ? turn.id : null;
}

export function advanceBriaMascot(previous, { working = false, completionId = null } = {}, now) {
  const current = previous || { state: 'idle', startedAt: now, lastCompletionId: null };
  if (working) return current.state === 'work' ? current : { ...current, state: 'work', startedAt: now };
  if (completionId && completionId !== current.lastCompletionId) {
    return { state: 'celebrate', startedAt: now, lastCompletionId: completionId };
  }
  if (current.state === 'work' || (current.state === 'celebrate' && now - current.startedAt >= BRIA_CELEBRATION_MS)) {
    return { ...current, state: 'idle', startedAt: now };
  }
  return current;
}
