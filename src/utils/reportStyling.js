export const COLORS = {
  primary: '#12A6A6', primaryDeep: '#0D97A6', secondary: '#21A698', accent: '#2DA683',
  ink: '#0D0D0D', dark: '#075D64', deepSurface: '#075D64', textDark: '#0D0D0D', title: '#0D0D0D',
  text: '#202827', textLight: '#60706D', border: '#D9E5E2', bg: '#F2F7F6', white: '#FFFFFF',
  mist: '#E8F4F2', cardGradient: '#E8F4F2', accentLavender: '#E8F4F2',
  accentPurple: '#0D97A6', accentBlue: '#DDF2F1', accentLime: '#2DA683',
};

export const GRADIENTS = {
  header: COLORS.white, primary: 'linear-gradient(135deg,#0D97A6 0%,#12A6A6 52%,#2DA683 100%)',
  secondary: COLORS.bg, limeSoft: COLORS.mist, purpleSoft: '#F5F9F8', graySoft: '#F7FAF9',
  cover: 'linear-gradient(135deg,#0D97A6 0%,#12A6A6 52%,#2DA683 100%)', canvas: '#EEF4F3',
};

export const TYPOGRAPHY = {
  fontFamily: "'Plus Jakarta Sans','Helvetica Neue',Helvetica,Arial,sans-serif",
  h1: 'font-size:clamp(44px,6vw,84px);font-weight:700;letter-spacing:-.055em;line-height:.98;color:#fff;',
  h2: 'font-size:24px;font-weight:700;letter-spacing:-.025em;line-height:1.2;color:#0D0D0D;',
  h3: 'font-size:18px;font-weight:700;line-height:1.35;color:#0D0D0D;',
  body: 'font-size:15px;line-height:1.72;color:#202827;', small: 'font-size:12px;line-height:1.55;color:#60706D;',
};

export const SPACING = { xs: '8px', sm: '16px', md: '24px', lg: '32px', xl: '48px', xxl: '72px' };

export const STYLES = {
  body: `font-family:${TYPOGRAPHY.fontFamily};background:${GRADIENTS.canvas};margin:0;padding:28px;color:${COLORS.text};-webkit-font-smoothing:antialiased;print-color-adjust:exact;-webkit-print-color-adjust:exact;`,
  container: `width:100%;max-width:1440px;margin:0 auto;background:${COLORS.bg};border:1px solid ${COLORS.border};overflow:hidden;`,
  coverPage: `min-height:660px;padding:${SPACING.xxl};display:flex;flex-direction:column;justify-content:space-between;color:#fff;background:${GRADIENTS.cover};position:relative;overflow:hidden;`,
  coverHeader: 'display:flex;justify-content:space-between;align-items:flex-start;',
  coverTitle: `${TYPOGRAPHY.h1}margin:44px 0 0;max-width:900px;`,
  coverSubtitle: 'font-size:24px;font-weight:500;line-height:1.35;color:rgba(255,255,255,.88);margin-top:24px;max-width:760px;',
  coverMeta: 'display:grid;grid-template-columns:repeat(2,minmax(0,220px));gap:32px;margin-top:48px;border-top:1px solid rgba(255,255,255,.35);padding-top:24px;',
  coverMetaLabel: 'font-size:11px;font-weight:700;color:rgba(255,255,255,.68);text-transform:uppercase;letter-spacing:.14em;',
  coverMetaValue: 'margin-top:7px;font-size:15px;font-weight:600;color:#fff;',
  header: `background:#fff;padding:32px 48px;border-bottom:1px solid ${COLORS.border};display:flex;justify-content:space-between;align-items:center;`,
  reportBadge: 'background:rgba(255,255,255,.14);color:#fff;font-size:11px;font-weight:700;padding:8px 12px;border:1px solid rgba(255,255,255,.36);border-radius:999px;text-transform:uppercase;letter-spacing:.12em;',
  documentHeader: `background:transparent;padding:0 0 24px;border-bottom:1px solid ${COLORS.border};display:flex;justify-content:space-between;align-items:center;margin-bottom:32px;`,
  content: `padding:48px;background:${COLORS.bg};`,
  section: `margin-bottom:32px;padding:32px;background:#fff;border:1px solid ${COLORS.border};page-break-inside:avoid;break-inside:avoid;`,
  sectionTitleBox: `margin-bottom:24px;display:flex;align-items:center;gap:12px;padding-bottom:16px;border-bottom:1px solid ${COLORS.border};color:${COLORS.primaryDeep};`,
  sectionTitle: `${TYPOGRAPHY.h2}margin:0;`,
  cardGrid: 'display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:18px;',
  card: `background:#fff;padding:24px;border:1px solid ${COLORS.border};page-break-inside:avoid;break-inside:avoid;`,
  cardSoft: 'background:#E8F4F2;border:1px solid rgba(13,151,166,.18);page-break-inside:avoid;break-inside:avoid;',
  cardLime: 'background:#E8F4F2;border:1px solid rgba(45,166,131,.28);',
  cardPurple: 'background:#0D97A6;color:#fff;border:0;',
  listGrid: 'display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px;',
  listCard: `padding:24px;border:1px solid ${COLORS.border};background:#fff;page-break-inside:avoid;break-inside:avoid;`,
  cardTitle: `${TYPOGRAPHY.h3}margin:0 0 8px;display:block;`, cardText: `${TYPOGRAPHY.body}margin:0;`,
  footer: 'background:#0D0D0D;padding:18px 48px;display:flex;justify-content:space-between;align-items:center;font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:rgba(255,255,255,.72);',
};

const escapeHtml = (value) => String(value ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');

export const formatList = (items) => {
  const values = (Array.isArray(items) ? items : [items]).filter(Boolean);
  return values.length ? `<ul class="editorial-list">${values.map((item) => `<li>${escapeHtml(typeof item === 'string' ? item : item.description || item.title || '')}</li>`).join('')}</ul>` : '';
};

export const formatListAsCards = (items) => {
  const values = (Array.isArray(items) ? items : [items]).filter(Boolean);
  return values.length ? `<div class="editorial-grid">${values.map((item,index) => `<article class="editorial-card"><span class="item-index">${String(index + 1).padStart(2,'0')}</span><p>${escapeHtml(typeof item === 'string' ? item : item.description || item.title || '')}</p></article>`).join('')}</div>` : '';
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
