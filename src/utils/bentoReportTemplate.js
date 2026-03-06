export const HTML_TEMPLATE_BASE = `
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
    <style>
        :root { --purple: #635bff; --neon: #d9ff66; --bg: #f8faf5; --dark: #111827; --card: #ffffff; --border: rgba(0,0,0,0.08); }
        body { font-family: 'Plus Jakarta Sans', sans-serif; background-color: var(--bg); color: var(--dark); margin: 0; padding: 40px; line-height: 1.6; }
        .bento-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 24px; max-width: 1600px; margin: 0 auto; }
        .card { background: var(--card); border-radius: 32px; padding: 40px; border: 1px solid var(--border); box-shadow: 0 16px 40px rgba(17, 24, 39, 0.08); display: flex; flex-direction: column; gap: 18px; }
        .span-2 { grid-column: span 2; }
        .span-4 { grid-column: span 4; }
        .purple { background: var(--purple); color: white; border: none; }
        .neon { background: var(--neon); color: var(--dark); border: none; }
        .label { font-size: 12px; text-transform: uppercase; font-weight: 700; letter-spacing: 0.08em; opacity: 0.6; margin-bottom: 12px; }
        .card-header { display: flex; align-items: center; gap: 12px; }
        .card-icon { width: 28px; height: 28px; display: inline-flex; align-items: center; justify-content: center; border-radius: 12px; background: rgba(17, 24, 39, 0.06); }
        .purple .card-icon { background: rgba(255, 255, 255, 0.2); }
        .neon .card-icon { background: rgba(17, 24, 39, 0.12); }
        h1, h2, h3, h4 { margin: 0; font-weight: 700; letter-spacing: -0.02em; }
        h3 { font-size: 22px; }
        p { margin: 0; font-size: 15px; }
        ul { margin: 0; padding-left: 18px; display: grid; gap: 10px; }
        li { font-size: 15px; }
    </style>
</head>
<body>
    <div class="bento-grid">
        {{CONTENIDO_DINAMICO}}
    </div>
</body>
</html>
`;

const normalizeClass = (value, allowed) => (allowed.includes(value) ? value : '');

const renderCard = (card) => {
  const sizeClass = normalizeClass(card.size, ['span-2', 'span-4']);
  const styleClass = normalizeClass(card.style, ['purple', 'neon']);
  const classes = ['card', sizeClass, styleClass].filter(Boolean).join(' ');
  const title = card.title ? `<h3>${card.title}</h3>` : '';
  const content = card.content || '';
  return `<div class="${classes}">${title}${content}</div>`;
};

export const buildBentoHtml = (cards = []) => {
  const content = cards.map(renderCard).join('\n');
  return HTML_TEMPLATE_BASE.replace('{{CONTENIDO_DINAMICO}}', content);
};
