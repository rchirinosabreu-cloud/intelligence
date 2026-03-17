import { describe, it, expect, vi } from 'vitest';
import { processAdsData } from '../services/metaMetricsService';

describe('metaMetricsService - processAdsData', () => {
  it('should correctly calculate total spend and map results to messaging conversations if available', () => {
    const mockInsights = [
      {
        spend: '450.50',
        reach: '10000',
        actions: [
          { action_type: 'onsite_conversion.messaging_conversation_started_7d', value: '10' },
          { action_type: 'link_click', value: '50' }
        ]
      },
      {
        spend: '503.50',
        reach: '15000',
        actions: [
          { action_type: 'onsite_conversion.messaging_conversation_started_7d', value: '15' }
        ]
      }
    ];

    const result = processAdsData(mockInsights);

    expect(result.spend).toBe(954); // 450.50 + 503.50 = 954
    expect(result.results).toBe(25); // 10 + 15
    expect(result.reach).toBe(25000);
    expect(result.costPerResult).toBe(38.16); // 954 / 25
  });

  it('should fallback to other conversions if messaging is not available', () => {
     const mockInsights = [
      {
        spend: '100',
        reach: '1000',
        actions: [
          { action_type: 'offsite_conversion.fb_pixel_purchase', value: '5' }
        ]
      }
    ];

    const result = processAdsData(mockInsights);
    expect(result.results).toBe(5);
  });

  it('should return zeros if no insights provided', () => {
    const result = processAdsData([]);
    expect(result.spend).toBe(0);
    expect(result.results).toBe(0);
  });
});
