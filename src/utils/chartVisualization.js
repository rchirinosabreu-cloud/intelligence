
import { COLORS, GRADIENTS } from './reportStyling';

// Utility for creating SVG charts for the PDF reports

/**
 * Creates a circular progress chart (donut style)
 * @param {number} percentage - 0 to 100
 * @param {string} color - Hex color code
 * @param {number} size - Size in px
 */
export const createPercentageCircle = (percentage, color = COLORS.primary, size = 60) => {
  const radius = 24;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percentage / 100) * circumference;

  return `
    <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px;">
      <div style="position: relative; width: ${size}px; height: ${size}px;">
        <svg width="${size}" height="${size}" viewBox="0 0 60 60" style="transform: rotate(-90deg);">
          <!-- Background Circle -->
          <circle cx="30" cy="30" r="${radius}" fill="none" stroke="${COLORS.accentLavender}" stroke-width="6" />
          <!-- Progress Circle -->
          <circle cx="30" cy="30" r="${radius}" fill="none" stroke="${color}" stroke-width="6"
                  stroke-dasharray="${circumference}" stroke-dashoffset="${offset}" stroke-linecap="round" />
        </svg>
        <div style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; display: flex; align-items: center; justify-content: center;">
          <span style="font-size: 14px; font-weight: 700; color: ${COLORS.textDark};">${percentage}%</span>
        </div>
      </div>
    </div>
  `;
};

/**
 * Creates a simple bar chart
 * @param {Array<{label: string, value: number}>} data
 * @param {string} color
 */
export const createBarChart = (data, color = COLORS.primary) => {
  if (!data || data.length === 0) return '';

  const maxVal = Math.max(...data.map(d => d.value));

  return `
    <div style="display: flex; flex-direction: column; gap: 12px; width: 100%;">
      ${data.map(item => {
        const width = (item.value / maxVal) * 100;
        return `
          <div style="display: flex; align-items: center; gap: 12px; font-size: 12px;">
            <div style="width: 80px; text-align: right; color: ${COLORS.textLight}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${item.label}</div>
            <div style="flex: 1; background: ${COLORS.border}; height: 8px; border-radius: 4px; overflow: hidden;">
              <div style="width: ${width}%; background: ${color}; height: 100%; border-radius: 4px;"></div>
            </div>
            <div style="width: 30px; font-weight: 600; color: ${COLORS.textDark};">${item.value}%</div>
          </div>
        `;
      }).join('')}
    </div>
  `;
};

/**
 * Creates a metric card with big number
 * @param {string} label
 * @param {string|number} value
 * @param {string} subtext
 * @param {string} color
 */
export const createMetricCard = (label, value, subtext = '', color = COLORS.primary) => {
  const isDuration = label === 'Duración';
  const valueFontSize = isDuration ? '28px' : '36px';
  const valueFontWeight = isDuration ? 600 : 800;

  return `
    <div style="padding: 20px; border-radius: 16px; background: linear-gradient(135deg, ${COLORS.cardGradient} 0%, ${COLORS.cardGradient} 100%); border: 1px solid ${COLORS.border}; box-shadow: 0 10px 22px rgba(17, 24, 39, 0.08);">
      <div style="font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; color: ${COLORS.textLight}; margin-bottom: 8px;">${label}</div>
      <div style="font-size: ${valueFontSize}; font-weight: ${valueFontWeight}; color: ${color}; line-height: 1;">${value}</div>
      ${subtext ? `<div style="font-size: 13px; color: ${COLORS.textLight}; margin-top: 6px;">${subtext}</div>` : ''}
    </div>
  `;
};

/**
 * Creates a linear progress bar
 * @param {number} percentage
 * @param {string} color
 */
export const createProgressBar = (percentage, color = COLORS.primary) => {
  return `
    <div style="width: 100%; height: 8px; background: ${COLORS.border}; border-radius: 4px; overflow: hidden; margin-top: 8px;">
      <div style="width: ${percentage}%; height: 100%; background: ${color};"></div>
    </div>
  `;
};
