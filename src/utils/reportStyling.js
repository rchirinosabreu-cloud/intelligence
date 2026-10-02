export const COLORS = {
  primary: '#12A6A6', primaryDeep: '#0D97A6', secondary: '#21A698', accent: '#2DA683',
  ink: '#0D0D0D', dark: '#075D64', deepSurface: '#075D64', textDark: '#0D0D0D', title: '#0D0D0D',
  text: '#202827', textLight: '#60706D', border: '#D9E5E2', bg: '#F2F7F6', white: '#FFFFFF',
  mist: '#E8F4F2', cardGradient: '#E8F4F2', accentLavender: '#E8F4F2',
  accentPurple: '#0D97A6', accentBlue: '#DDF2F1', accentLime: '#2DA683',
};

export const getBrainStudioLogoSVG = (variant = 'default') => {
  const width = variant === 'small' ? '170px' : '280px';
  const origin = typeof globalThis !== 'undefined' && globalThis.location?.origin && globalThis.location.origin !== 'null'
    ? globalThis.location.origin
    : 'https://labs.brainstudioagencia.com';
  const logoUrl = `${origin}/assets/brainstudio-logo-white.png`;
  return `<img src="${logoUrl}" alt="BrainStudio" style="display:block;width:${width};height:auto;object-fit:contain;" onerror="this.onerror=null;this.outerHTML='<strong style=&quot;color:white;font-size:20px;letter-spacing:.12em&quot;>BRAIN STUDIO</strong>';"/>`;
};

const icon = (path) => `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#0D97A6" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`;
export const ICONS = {
  logoSmall: '<div style="width:24px;height:24px;background:#12A6A6"></div>',
  target: icon('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="1"/>'),
  chart: icon('<path d="M4 19V9m6 10V5m6 14v-7m4 7V3"/>'),
  bulb: icon('<path d="M9 18h6m-5 4h4m5-12a7 7 0 1 0-14 0c0 2.5 1.4 4 3 5.4.7.6 1 1.5 1 2.6h6c0-1.1.3-2 1-2.6 1.6-1.4 3-2.9 3-5.4Z"/>'),
  users: icon('<path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><path d="M19 8v6m3-3h-6"/>'),
  calendar: icon('<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/>'),
  lightning: icon('<path d="m13 2-9 12h8l-1 8 9-12h-8l1-8Z"/>'),
  settings: icon('<circle cx="12" cy="12" r="3"/><path d="M12 2v3m0 14v3M2 12h3m14 0h3M4.9 4.9 7 7m10 10 2.1 2.1M19.1 4.9 17 7M7 17l-2.1 2.1"/>'),
};
