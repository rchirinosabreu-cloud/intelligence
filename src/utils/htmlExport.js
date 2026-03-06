
import { STYLES, GRADIENTS, ICONS, COLORS, SPACING, getBrainStudioLogoSVG, formatList, formatListAsCards } from './reportStyling';
import { createMetricCard } from './chartVisualization';

export const generateSummaryHTML = (data, sourceTitle, reportMeta = {}) => {
  const date = new Date().toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' });
  const sharedStyles = `
    @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');
    @page { size: A4 landscape; margin: 14mm; }
    * { box-sizing: border-box; }
    body { margin: 0; background: ${GRADIENTS.canvas}; }
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: 10px 12px; text-align: left; border-bottom: 1px solid ${COLORS.border}; font-size: 13px; color: ${COLORS.text}; }
    tr:nth-child(even) { background: ${COLORS.bg}; }
    .card, section, .block { break-inside: avoid; page-break-inside: avoid; }
    .list-grid { column-count: 2; column-gap: 22px; width: 100%; }
    .list-card { display: inline-block; width: 100%; margin: 0 0 22px; break-inside: avoid; page-break-inside: avoid; }
    @media (max-width: 900px) {
      .list-grid { column-count: 1; }
    }
  `;

  // Data extraction with fallbacks
  const reportDate = date;
  const meetingDuration = data.meeting_duration || '';
  const participants = data.participants || [];
  const topics = data.meeting_topics || [];
  const details = data.discussion_details || [];
  const agreements = data.agreements || [];
  const actions = data.action_items || [];
  const documentTitle = reportMeta.reportTitle?.trim() || 'Resumen General';
  const projectSubtitle = reportMeta.projectSubtitle?.trim();
  const meetingTitle = data.meeting_title?.trim();
  const displayDuration = meetingDuration ? meetingDuration : 'No disponible';

  return `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>${documentTitle || ''}</title>
  <style>${sharedStyles}</style>
</head>
<body style="${STYLES.body}">
  <div style="${STYLES.container}" class="block">

    <!-- Cover Page -->
    <div style="${STYLES.coverPage}">
       <div>
         ${getBrainStudioLogoSVG()}
         ${documentTitle ? `<h1 style="${STYLES.coverTitle}">${documentTitle}</h1>` : ''}
         ${projectSubtitle ? `<div style="${STYLES.coverSubtitle}">${projectSubtitle}</div>` : ''}
         <div style="${STYLES.coverMeta}">
           <div>
             <div style="${STYLES.coverMetaLabel}">Fecha</div>
             <div style="${STYLES.coverMetaValue}">${reportDate}</div>
           </div>
           <div>
             <div style="${STYLES.coverMetaLabel}">Duración</div>
             <div style="${STYLES.coverMetaValue}">${displayDuration}</div>
           </div>
         </div>
       </div>
    </div>

    <!-- Content -->
    <div style="${STYLES.content}">
      <div style="${STYLES.documentHeader}">
        ${getBrainStudioLogoSVG('small')}
        <div style="${STYLES.reportBadge}">Resumen General</div>
      </div>

      <!-- Meeting Context -->
      ${(participants.length > 0 || meetingDuration || meetingTitle) ? `
        <section style="${STYLES.section}">
          <div style="${STYLES.sectionTitleBox}">
             ${ICONS.users}
             <div style="${STYLES.sectionTitle}">Contexto de la reunión</div>
          </div>
          <div style="${STYLES.listGrid}">
             ${participants.length > 0 ? createMetricCard("Personas mencionadas", `${participants.length}`, participants.slice(0, 3).join(", "), COLORS.primary) : ''}
             ${meetingDuration ? createMetricCard("Duración", meetingDuration, "Tiempo total reportado", COLORS.primary) : ''}
          </div>
          ${meetingTitle ? `<div style="margin-top: ${SPACING.sm}; font-size: 13px; color: ${COLORS.textLight};">Título: ${meetingTitle}</div>` : ''}
        </section>
      ` : ''}

      <!-- Topics & Details -->
      <section style="${STYLES.card} margin-bottom: ${SPACING.md};">
          <div style="${STYLES.sectionTitleBox}">
            ${ICONS.target}
            <h3 style="${STYLES.cardTitle}">Temas Tratados</h3>
          </div>
          ${formatListAsCards(topics)}
      </section>

      <section style="${STYLES.card} ${STYLES.cardSoft} margin-bottom: ${SPACING.xl};">
          <div style="${STYLES.sectionTitleBox}">
            ${ICONS.lightning}
            <h3 style="${STYLES.cardTitle}">Puntos Clave</h3>
          </div>
          ${formatListAsCards(details)}
      </section>

      <!-- Agreements -->
      <section style="${STYLES.section}">
          <div style="${STYLES.sectionTitleBox}">
             ${ICONS.bulb}
             <h2 style="${STYLES.sectionTitle}">Acuerdos y Compromisos</h2>
          </div>
          ${agreements.length > 0 ? formatListAsCards(agreements) : `
            <div style="${STYLES.listGrid}">
              <div style="${STYLES.listCard} ${STYLES.cardSoft} color:${COLORS.textLight}; font-style: italic;">Sin acuerdos explícitos en el material.</div>
            </div>
          `}
      </section>

      <!-- Action Items -->
      <section style="${STYLES.section}">
          <div style="${STYLES.sectionTitleBox}">
             ${ICONS.calendar}
             <div style="${STYLES.sectionTitle}">Próximos Pasos</div>
          </div>
          <div style="${STYLES.listGrid}" class="list-grid">
             ${actions.map(action => `
                <div style="${STYLES.listCard} ${STYLES.cardSoft} display: flex; justify-content: space-between; align-items: center; padding: ${SPACING.sm} ${SPACING.md};" class="list-card">
                   <div>
                      <div style="font-weight: 600; color: ${COLORS.text};">${action.task}</div>
                      <div style="font-size: 12px; color: ${COLORS.textLight};">${action.owner || 'N/A'}${action.due_date ? ` • Fecha: ${action.due_date}` : ''}</div>
                   </div>
                   <div style="font-size: 10px; font-weight: 700; padding: 4px 8px; border-radius: 6px; background: ${action.priority === 'Alta' ? COLORS.accentLime : COLORS.accentLavender}; color: ${action.priority === 'Alta' ? COLORS.textDark : COLORS.primary};">
                     ${action.priority || 'General'}
                   </div>
                </div>
             `).join('')}
             ${actions.length === 0 ? `<div style="${STYLES.listCard} ${STYLES.cardSoft} color:${COLORS.textLight}; font-style: italic;">No se detectaron acciones específicas.</div>` : ''}
          </div>
      </section>

    </div>

    <!-- Footer -->
    <footer style="${STYLES.footer}">
      <span>Brainstudio Intelligence</span>
      <span>Confidencial</span>
    </footer>
  </div>
</body>
</html>
  `;
};

export const generateAnalysisHTML = (data, sourceTitle, reportMeta = {}) => {
  const date = new Date().toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' });
  const sharedStyles = `
    @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');
    @page { size: A4 landscape; margin: 14mm; }
    * { box-sizing: border-box; }
    body { margin: 0; background: ${GRADIENTS.canvas}; }
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: 10px 12px; text-align: left; border-bottom: 1px solid ${COLORS.border}; font-size: 13px; color: ${COLORS.text}; }
    tr:nth-child(even) { background: ${COLORS.bg}; }
    .card, section, .block { break-inside: avoid; page-break-inside: avoid; }
    .list-grid { column-count: 2; column-gap: 22px; width: 100%; }
    .list-card { display: inline-block; width: 100%; margin: 0 0 22px; break-inside: avoid; page-break-inside: avoid; }
    @media (max-width: 900px) {
      .list-grid { column-count: 1; }
    }
  `;

  const topics = data.meeting_topics || [];
  const insights = data.consulting_insights || [];
  const observations = data.observations || [];
  const opportunities = data.opportunities || [];
  const recommendations = data.recommendations || [];
  const documentTitle = reportMeta.reportTitle?.trim() || 'Análisis Estratégico';
  const projectSubtitle = reportMeta.projectSubtitle?.trim();
  const meetingDuration = data.meeting_duration || '';
  const displayDuration = meetingDuration ? meetingDuration : 'No disponible';

  return `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>${documentTitle || ''}</title>
  <style>${sharedStyles}</style>
</head>
<body style="${STYLES.body}">
  <div style="${STYLES.container}" class="block">

    <!-- Cover Page -->
    <div style="${STYLES.coverPage}">
       <div>
         ${getBrainStudioLogoSVG()}
         ${documentTitle ? `<h1 style="${STYLES.coverTitle}">${documentTitle}</h1>` : ''}
         ${projectSubtitle ? `<div style="${STYLES.coverSubtitle}">${projectSubtitle}</div>` : ''}
         <div style="${STYLES.coverMeta}">
           <div>
             <div style="${STYLES.coverMetaLabel}">Fecha</div>
             <div style="${STYLES.coverMetaValue}">${date}</div>
           </div>
           <div>
             <div style="${STYLES.coverMetaLabel}">Duración</div>
             <div style="${STYLES.coverMetaValue}">${displayDuration}</div>
           </div>
         </div>
       </div>
    </div>

    <div style="${STYLES.content}">
       <div style="${STYLES.documentHeader}">
         ${getBrainStudioLogoSVG('small')}
         <div style="${STYLES.reportBadge}">Análisis Estratégico</div>
       </div>
       <section style="${STYLES.section}">
         <div style="${STYLES.sectionTitleBox}">
            ${ICONS.target}
            <div style="${STYLES.sectionTitle}">Contexto y Temas</div>
         </div>
         ${formatList(topics)}
       </section>

       <section style="${STYLES.section}">
         <div style="${STYLES.sectionTitleBox}">
            ${ICONS.lightning}
            <div style="${STYLES.sectionTitle}">Insight Consultivo</div>
         </div>
         ${formatList(insights)}
       </section>

       <section style="${STYLES.section}">
         <div style="${STYLES.sectionTitleBox}">
            ${ICONS.bulb}
            <div style="${STYLES.sectionTitle}">Observaciones Críticas</div>
         </div>
         ${formatList(observations)}
       </section>

       <section style="${STYLES.section}">
         <div style="${STYLES.sectionTitleBox}">
            ${ICONS.chart}
            <div style="${STYLES.sectionTitle}">Oportunidades Detectadas</div>
         </div>
         <div style="${STYLES.listGrid}">
            ${opportunities.map((item) => `
              <div style="${STYLES.listCard} ${STYLES.cardSoft}">
                 <h3 style="${STYLES.cardTitle}">${item.title}</h3>
                 <p style="${STYLES.cardText}">${item.description}</p>
              </div>
            `).join('')}
            ${opportunities.length === 0 ? `<div style="${STYLES.listCard} color:${COLORS.textLight}; font-style: italic;">Sin oportunidades explícitas en el material.</div>` : ''}
         </div>
       </section>

       <section style="${STYLES.section}">
         <div style="${STYLES.sectionTitleBox}">
            ${ICONS.calendar}
            <div style="${STYLES.sectionTitle}">Recomendaciones Estratégicas</div>
         </div>
         <div style="${STYLES.listGrid}">
            ${recommendations.map((rec, index) => `
              <div style="${STYLES.card} ${STYLES.cardSoft} display: flex; justify-content: space-between; gap: ${SPACING.md};">
                 <div>
                    <div style="font-weight: 600; color: ${COLORS.title};">${rec.title}</div>
                    <div style="${STYLES.cardText}; color: ${COLORS.text};">${rec.description}</div>
                 </div>
                 ${rec.priority ? `
                   <div style="font-size: 10px; font-weight: 700; padding: 4px 8px; border-radius: 6px; background: ${rec.priority === 'Alta' ? COLORS.accentLime : COLORS.accentLavender}; color: ${rec.priority === 'Alta' ? COLORS.textDark : COLORS.primary}; height: fit-content;">
                      ${rec.priority}
                   </div>
                 ` : ''}
              </div>
            `).join('')}
            ${recommendations.length === 0 ? `<div style="${STYLES.card} color:${COLORS.textLight}; font-style: italic;">Sin recomendaciones explícitas en el material.</div>` : ''}
         </div>
       </section>
    </div>

    <!-- Footer -->
    <footer style="${STYLES.footer}">
       <span>Brainstudio Intelligence</span>
       <span>Confidencial</span>
    </footer>
  </div>
</body>
</html>
  `;
};
