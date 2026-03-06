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
    const actionLines = data.action_items.flatMap((item) => {
      const details = [];
      if (item.task) details.push(`- Tarea: ${item.task}`);
      if (item.priority) details.push(`  - ${item.priority}`);
      if (item.owner) details.push(`  - ${item.owner}`);
      if (item.due_date) details.push(`  - Fecha límite: ${item.due_date}`);
      return details;
    });
    appendSection(lines, 'Acciones:', actionLines);
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
    const recommendationLines = data.recommendations.flatMap((item) => {
      const details = [];
      if (item.title) details.push(`- Recomendación: ${item.title}`);
      if (item.description) details.push(`  - Descripción: ${item.description}`);
      if (item.priority) details.push(`  - Prioridad: ${item.priority}`);
      return details;
    });
    appendSection(lines, 'Recomendaciones:', recommendationLines);
  }

  if (Array.isArray(data.opportunities) && data.opportunities.length > 0) {
    const opportunityLines = data.opportunities.flatMap((item) => {
      const details = [];
      if (item.title) details.push(`- Oportunidad: ${item.title}`);
      if (item.description) details.push(`  - Descripción: ${item.description}`);
      return details;
    });
    appendSection(lines, 'Oportunidades:', opportunityLines);
  }

  return lines.join('\n').trim();
};
