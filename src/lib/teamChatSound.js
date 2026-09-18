// Two deliberately quiet cues. The chat should be noticed, not obeyed, so the
// closed panel gets a soft two-note rise and the open panel barely whispers.
export const CHAT_CUE_CLOSED = "closed";
export const CHAT_CUE_OPEN = "open";

const CUES = {
  [CHAT_CUE_CLOSED]: { from: 587.33, to: 880, peak: 0.06, duration: 0.28 },
  [CHAT_CUE_OPEN]: { from: 784, to: 988, peak: 0.022, duration: 0.16 },
};

// Muting silences the cue only; unread counters are owned by the stream and
// must keep counting. Restoring history on connect is not an arrival, and a
// channel already silenced through "Silenciar avisos" stays silent here too.
export function chatCueForIncoming({
  messages,
  userId,
  panelOpen,
  muted,
  hydrating,
  mutedChannels,
} = {}) {
  if (muted || hydrating) return null;
  const silenced = mutedChannels || new Set();
  const arriving = Array.isArray(messages) ? messages : [];
  const fromSomeoneElse = arriving.some((message) => {
    const author = message?.author?.id;
    if (!author || author === userId) return false;
    return !silenced.has(message.channelId);
  });
  if (!fromSomeoneElse) return null;
  return panelOpen ? CHAT_CUE_OPEN : CHAT_CUE_CLOSED;
}

// The context is created on the first cue so the tab never opens an audio
// device it does not use, and a blocked or missing device stays silent.
export function createChatCuePlayer(createContext) {
  let context = null;
  return (cue) => {
    const spec = CUES[cue];
    if (!spec) return;
    try {
      if (!context) context = createContext();
      if (!context) return;
      if (context.state === "suspended") context.resume?.();
      const now = context.currentTime || 0;
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(spec.from, now);
      oscillator.frequency.linearRampToValueAtTime(
        spec.to,
        now + spec.duration * 0.6,
      );
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.linearRampToValueAtTime(spec.peak, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + spec.duration);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(now);
      oscillator.stop(now + spec.duration);
    } catch (error) {
      // An autoplay policy or a missing device must never break the chat.
      console.error("[TeamChat cue]", error?.message || error);
    }
  };
}

const browserAudioContext = () => {
  if (typeof window === "undefined") return null;
  const Context = window.AudioContext || window.webkitAudioContext;
  return Context ? new Context() : null;
};

export const playChatCue = createChatCuePlayer(browserAudioContext);
