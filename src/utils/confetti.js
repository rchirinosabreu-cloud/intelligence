import confetti from 'canvas-confetti';

/**
 * Triggers a subtle confetti explosion.
 * Designed to be non-intrusive for gamification micro-interactions.
 */
export const triggerConfetti = () => {
  confetti({
    particleCount: 50,
    spread: 60,
    origin: { y: 0.8 },
    colors: ['#8b5cf6', '#10b981', '#ffffff'], // Tailwind purple, emerald, and white
    zIndex: 9999, // Ensure it's above modals
  });
};
