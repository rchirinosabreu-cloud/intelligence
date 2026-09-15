// Entirely synthetic: eight capture shapes with anonymous IDs, labels and values.
// Exercises repeated summaries, format tables and ads; this is not OCR ground truth.
const combined = 'instagram_content_with_facebook_distribution';
const metric = (id, key, value, extra = {}) => ({ id, key, label: key, value,
  rawValue: value === null ? null : String(value), unit: 'count', platform: 'INSTAGRAM',
  scope: 'TOTAL', precision: 'EXACT', contextKey: 'account_content', entityLevel: 'UNKNOWN',
  period: { start: null, end: null }, comparisonPeriod: { start: null, end: null },
  evidence: `Transcripción sintética: ${key}`, ...extra });
const capture = (sourceId, screenType, observations, panels = []) => ({ sourceId, screenType, observations, panels });
const panel = (id, metricKey, platform, observations, extra = {}) => ({ id, metricKey, platform,
  title: metricKey, unit: 'count', scope: 'UNKNOWN', contextKey: 'account_content',
  observationIds: observations.map(item => item.id), dataset: observations.filter(item => item.value !== null).map(item => ({ label: item.label, [metricKey]: item.value })), ...extra });

export function syntheticEvidenceBatch() {
  const ads = Array.from({ length: 7 }, (_, index) => {
    const n = index + 1;
    return [['results', n], ['costPerResult', 125], ['spend', n * 125], ['impressions', n * 230], ['reach', n * 170]]
      .filter(([key]) => n < 7 || !['results', 'costPerResult'].includes(key))
      .map(([key, value]) => metric(`ad-${n}-${key}`, key, value, { platform: 'META_ADS', scope: 'PAID', contextKey: 'advertising',
        entityLevel: 'AD', entityName: `Anuncio ${n}`, label: key,
        unit: ['spend', 'costPerResult'].includes(key) ? '$UNKNOWN' : 'count',
        resultType: key === 'results' ? 'CONVERSATIONS' : null }));
  }).flat();
  const campaign = [['results', 45], ['costPerResult', 125], ['budget', 5625], ['spend', 5625], ['impressions', 14000], ['reach', 9000]]
    .map(([key, value]) => metric(`campaign-${key}`, key, value, { platform: 'META_ADS', scope: 'PAID', contextKey: 'advertising',
      entityLevel: 'CAMPAIGN', entityName: 'Campaña de prueba', unit: ['costPerResult', 'budget', 'spend'].includes(key) ? '$UNKNOWN' : 'count',
      resultType: ['results', 'costPerResult'].includes(key) ? 'CONVERSATIONS' : null }));
  const facebook = extra => ({ platform: 'FACEBOOK', entityLevel: 'ACCOUNT', resultType: 'SUMMARY', ...extra });
  const fbSummary = [
    metric('views', 'views', 4321, facebook()), metric('watch', 'watchTime', 3600, facebook({ unit: 'seconds' })),
    metric('video', 'threeSecondVideoViews', 210, facebook()), metric('interactions', 'interactions', 31, facebook()),
    metric('total', 'views', 4321, facebook({ label: 'Total' })),
    metric('organic', 'views', 2111, facebook({ scope: 'ORGANIC', parentObservationId: 'total' })),
    metric('paid', 'views', 2210, facebook({ scope: 'PAID', parentObservationId: 'total' })),
    metric('viewers', 'viewers', 2123, facebook()),
  ];
  const fbTrends = [['views', 4300, '4,3 mil'], ['viewers', 2100, '2,1 mil'], ['interactions', 31], ['linkClicks', 60], ['profileVisits', 120], ['followerTotal', 5]]
    .map(([key, value, rawValue]) => metric(key, key, value, facebook({ resultType: 'METRIC', ...(rawValue ? { rawValue } : {}) })));
  const igTrends = [
    metric('combined', 'views', 13000, { rawValue: '13 mil', platform: 'CROSS_PLATFORM', contextKey: combined, resultType: 'TOTAL' }),
    metric('fb', 'views', 660, { platform: 'FACEBOOK', contextKey: 'facebook_distribution_of_instagram_content', resultType: 'COMPONENT', parentObservationId: 'combined' }),
    metric('ig', 'views', 12340, { resultType: 'COMPONENT', parentObservationId: 'combined' }),
    metric('reach', 'reach', 2800, { rawValue: '2,8 mil', platform: 'UNKNOWN', contextKey: 'UNKNOWN' }),
    metric('interactions', 'interactions', 270), metric('links', 'linkClicks', 70), metric('visits', 'profileVisits', 190),
    metric('followers', 'followerTotal', 25, { contextKey: 'account_audience' }),
  ];
  const format = (key, rows, platform) => rows.map(([label, value], index) => metric(`${key}-${index}`, key, value,
    { label, platform, scope: 'UNKNOWN', entityLevel: 'FORMAT', entityName: label }));
  const fbContent = format('contentCount', [['Historias', 12], ['Reels', 3], ['Fotos', 5]], 'FACEBOOK');
  const fbViews = format('views', [['Enlaces', 2400], ['Reels', 1300], ['Otros', 321], ['Foto', 250], ['Varias fotos', 50]], 'FACEBOOK');
  const fbInteractions = format('interactions', [['Reels', 16], ['Enlaces', 9], ['Foto', 3], ['Historias', 2], ['Varias fotos', 1]], 'FACEBOOK');
  const fbFormats = [metric('content-heading', 'contentCount', null, { platform: 'FACEBOOK', scope: 'UNKNOWN' }), ...fbContent,
    metric('views-heading', 'views', null, { platform: 'FACEBOOK', scope: 'UNKNOWN' }), ...fbViews,
    metric('interactions-heading', 'interactions', null, { platform: 'FACEBOOK', scope: 'UNKNOWN' }), ...fbInteractions];
  const igContent = format('contentCount', [['Historias', 21], ['Publicaciones', 9]], 'INSTAGRAM');
  const igFormats = [metric('content-heading', 'contentCount', null, { scope: 'UNKNOWN' }), ...igContent];
  const igSummary = [
    metric('combined', 'views', 13000, { rawValue: '13 mil', platform: 'CROSS_PLATFORM', contextKey: combined, resultType: 'VIEWS' }),
    metric('fb', 'views', 660, { platform: 'FACEBOOK', contextKey: combined, resultType: 'VIEWS', parentObservationId: 'combined' }),
    metric('ig', 'views', 12340, { contextKey: combined, resultType: 'VIEWS', parentObservationId: 'combined' }),
    metric('reach', 'reach', 2800, { rawValue: '2,8 mil', platform: 'CROSS_PLATFORM', contextKey: combined }),
    metric('interactions', 'interactions', 270, { platform: 'CROSS_PLATFORM', contextKey: combined }),
    metric('total', 'views', 12340, { label: 'Total', contextKey: combined, resultType: 'VIEWS', relation: { type: 'CORROBORATES', parentObservationId: 'ig' } }),
    metric('organic', 'views', 5400, { label: 'Orgánico', contextKey: combined, scope: 'ORGANIC', parentObservationId: 'total' }),
    metric('paid', 'views', 6940, { label: 'Anuncios', contextKey: combined, scope: 'PAID', parentObservationId: 'total' }),
  ];
  return [
    capture('ads', 'AD_TABLE', ads), capture('campaign', 'AD_TABLE', campaign),
    capture('facebook-summary', 'CONTENT_SUMMARY', fbSummary), capture('facebook-trends', 'METRIC_TRENDS', fbTrends),
    capture('instagram-trends', 'METRIC_TRENDS', igTrends),
    capture('facebook-formats', 'CONTENT_FORMATS', fbFormats, [panel('content', 'contentCount', 'FACEBOOK', fbContent), panel('views', 'views', 'FACEBOOK', fbViews), panel('interactions', 'interactions', 'FACEBOOK', fbInteractions)]),
    capture('instagram-formats', 'CONTENT_FORMATS', igFormats, [panel('content', 'contentCount', 'INSTAGRAM', igContent)]),
    capture('instagram-summary', 'CONTENT_SUMMARY', igSummary, [panel('breakdown', 'views', 'INSTAGRAM', igSummary.slice(5), { scope: 'TOTAL', contextKey: combined })]),
  ];
}
