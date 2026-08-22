import XLSX from 'xlsx';
import { createHash } from 'node:crypto';

const clean = (value) => String(value ?? '').trim();
const normalized = (value) => clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const numberValue = (value) => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const parsed = Number(clean(value).replace(/[$%\s]/g, '').replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
};

export const stripJsonMarkdownFence = (value) => {
  if (typeof value !== 'string') return value;
  const cleaned = value.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  return JSON.parse(cleaned);
};

const findHeader = (rows) => {
  for (let index = 0; index < Math.min(rows.length, 40); index += 1) {
    const labels = rows[index].map(normalized);
    const weekIndex = labels.findIndex((label) => label === 'semana' || label.startsWith('semana '));
    const actionIndex = labels.findIndex((label) => ['accion', 'actividad', 'tarea'].some((candidate) => label === candidate || label.startsWith(`${candidate} `)));
    if (weekIndex >= 0 && actionIndex >= 0 && weekIndex !== actionIndex && labels.filter(Boolean).length >= 4) {
      return { index, labels };
    }
  }
  return null;
};

const column = (labels, candidates) => labels.findIndex((label) => candidates.some((candidate) => label.includes(candidate)));

export const parseGrowthWorkbook = (buffer, { filename = 'plan-90-dias.xlsm' } = {}) => {
  const sourceHash = createHash('sha256').update(buffer).digest('hex');
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const actions = [];
  const metricMap = new Map();

  workbook.SheetNames.forEach((sheetName) => {
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: '' });

    rows.slice(0, 40).forEach((row, headerIndex) => {
      const labels = row.map(normalized);
      const indicatorCol = column(labels, ['indicador', 'metrica', 'kpi']);
      if (indicatorCol < 0 || !labels.some((label) => label.includes('meta 90'))) return;
      const targetCol = column(labels, ['meta 90']);
      const actualCol = column(labels, ['actual editable', 'actual']);
      rows.slice(headerIndex + 1).forEach((metricRow) => {
        const name = clean(metricRow[indicatorCol]);
        if (!name) return;
        const key = normalized(name);
        if (!metricMap.has(key)) metricMap.set(key, {
          name,
          target: numberValue(metricRow[targetCol]),
          value: actualCol >= 0 ? numberValue(metricRow[actualCol]) ?? 0 : 0,
          unit: /ingreso|costo|cartera|caja|brecha|factur|utilidad/i.test(name) ? 'COP' : null
        });
      });
    });

    const header = findHeader(rows);
    if (!header) return;
    const weekCol = column(header.labels, ['semana']);
    const actionCol = column(header.labels, ['accion', 'actividad', 'tarea']);
    const frontCol = column(header.labels, ['frente', 'area', 'pilar']);
    const ownerCol = column(header.labels, ['responsable']);
    const metricCol = column(header.labels, ['indicador', 'kpi', 'metrica']);
    const targetCol = column(header.labels, ['meta', 'objetivo']);
    const dueCol = column(header.labels, ['fecha limite', 'vencimiento']);
    const priorityCol = column(header.labels, ['prioridad']);
    const evidenceCol = column(header.labels, ['evidencia', 'entregable']);

    rows.slice(header.index + 1).forEach((row, offset) => {
      const title = clean(row[actionCol]);
      const weekNumber = Math.trunc(numberValue(row[weekCol]) || 0);
      if (!title || weekNumber < 1 || weekNumber > 13) return;
      const metricName = metricCol >= 0 ? clean(row[metricCol]) : '';
      actions.push({
        weekNumber,
        title,
        front: frontCol >= 0 ? clean(row[frontCol]) || null : null,
        ownerName: ownerCol >= 0 ? clean(row[ownerCol]) || null : null,
        metricName: metricName || null,
        target: targetCol >= 0 ? numberValue(row[targetCol]) : null,
        dueDate: dueCol >= 0 && row[dueCol] ? new Date(row[dueCol]).toISOString() : null,
        isCritical: priorityCol >= 0 && /alta|critica|urgente/i.test(clean(row[priorityCol])),
        evidenceRequired: evidenceCol >= 0 && Boolean(clean(row[evidenceCol])),
        evidenceLabel: evidenceCol >= 0 ? clean(row[evidenceCol]) || null : null,
        sourceSheet: sheetName,
        sourceRow: header.index + offset + 2
      });
      if (metricName && !metricMap.has(normalized(metricName))) {
        metricMap.set(normalized(metricName), { name: metricName, target: targetCol >= 0 ? numberValue(row[targetCol]) : null, value: 0, unit: null });
      }
    });
  });

  const weekNumbers = [...new Set(actions.map((action) => action.weekNumber))].sort((a, b) => a - b);
  return {
    filename,
    sourceHash,
    sheetNames: workbook.SheetNames,
    weeks: weekNumbers.map((number) => ({ number, title: `Semana ${number}` })),
    actions,
    metrics: [...metricMap.values()],
    warnings: actions.length ? [] : ['No se encontraron columnas de Semana y Acción en el libro.']
  };
};

export const buildGrowthImportPlan = (buffer, options = {}) => {
  const parsed = parseGrowthWorkbook(buffer, options);
  return {
    ...parsed,
    cycle: {
      name: options.name || 'Ruta de crecimiento · 90 días',
      startDate: options.startDate || new Date().toISOString(),
      endDate: options.endDate || new Date(Date.now() + 90 * 86400000).toISOString()
    }
  };
};
