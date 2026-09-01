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
    colors: ['#009EB9', '#00AC8A', '#ffffff'],
    zIndex: 9999, // Ensure it's above modals
    disableForReducedMotion: true,
  });
};
