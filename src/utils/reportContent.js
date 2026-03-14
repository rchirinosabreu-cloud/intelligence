const formatBulletList = (items = []) => items.map((item) => `- ${item}`).join('\n');

const appendSection = (lines, title, bodyLines) => {
  if (!bodyLines || bodyLines.length === 0) return;
  lines.push(title);
  lines.push(...bodyLines);
  lines.push('');
};

export const buildSummaryReportContent = (data, reportMeta = {}) => {
  const lines = [];
  const reportTitle = reportMeta.reportTitle?.trim();
  const projectSubtitle = reportMeta.projectSubtitle?.trim();
  const reportDate = new Date().toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' });
  const meetingDuration = data.meeting_duration || '';

  lines.push('[COVER]');
  lines.push(`TITULO_DOCUMENTO: ${reportTitle || ''}`);
  lines.push(`SUBTITULO_PROYECTO: ${projectSubtitle || ''}`);
  lines.push('TIPO_REPORTE: Resumen general');
  lines.push(`FECHA_GENERACION: ${reportDate}`);
  lines.push(`DURACION_REUNION: ${meetingDuration}`);
  lines.push('[/COVER]');
  lines.push('');

  if (Array.isArray(data.participants) && data.participants.length > 0) {
    appendSection(lines, 'Participantes:', formatBulletList(data.participants).split('\n'));
  }

  if (Array.isArray(data.meeting_topics) && data.meeting_topics.length > 0) {
    appendSection(lines, 'Temas tratados:', formatBulletList(data.meeting_topics).split('\n'));
  }

  if (Array.isArray(data.discussion_details) && data.discussion_details.length > 0) {
    appendSection(lines, 'Detalles de la discusión:', formatBulletList(data.discussion_details).split('\n'));
  }

  if (Array.isArray(data.agreements) && data.agreements.length > 0) {
    appendSection(lines, 'Acuerdos:', formatBulletList(data.agreements).split('\n'));
  }

  if (Array.isArray(data.action_items) && data.action_items.length > 0) {
    appendSection(lines, 'Acciones:', formatBulletList(data.action_items).split('\n'));
  }

  return lines.join('\n').trim();
};

export const buildAnalysisReportContent = (data, reportMeta = {}) => {
  const lines = [];
  const reportTitle = reportMeta.reportTitle?.trim();
  const projectSubtitle = reportMeta.projectSubtitle?.trim();
  const reportDate = new Date().toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' });
  const meetingDuration = data.meeting_duration || '';

  lines.push('[COVER]');
  lines.push(`TITULO_DOCUMENTO: ${reportTitle || ''}`);
  lines.push(`SUBTITULO_PROYECTO: ${projectSubtitle || ''}`);
  lines.push('TIPO_REPORTE: Análisis estratégico');
  lines.push(`FECHA_GENERACION: ${reportDate}`);
  lines.push(`DURACION_REUNION: ${meetingDuration}`);
  lines.push('[/COVER]');
  lines.push('');

  if (Array.isArray(data.meeting_topics) && data.meeting_topics.length > 0) {
    appendSection(lines, 'Temas clave:', formatBulletList(data.meeting_topics).split('\n'));
  }

  if (Array.isArray(data.consulting_insights) && data.consulting_insights.length > 0) {
    appendSection(lines, 'Insights consultivos:', formatBulletList(data.consulting_insights).split('\n'));
  }

  if (Array.isArray(data.observations) && data.observations.length > 0) {
    appendSection(lines, 'Observaciones:', formatBulletList(data.observations).split('\n'));
  }

  if (Array.isArray(data.recommendations) && data.recommendations.length > 0) {
    appendSection(lines, 'Recomendaciones:', formatBulletList(data.recommendations).split('\n'));
  }

  if (Array.isArray(data.opportunities) && data.opportunities.length > 0) {
    appendSection(lines, 'Oportunidades:', formatBulletList(data.opportunities).split('\n'));
  }

  return lines.join('\n').trim();
};
