import axios from 'axios';
import { getDecryptedToken } from './integrationService.js';
import prisma from '../lib/prisma.js';

const GRAPH_API_VERSION = 'v21.0';
const BASE_URL = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

/**
 * Helper to get dates for flexible periods.
 * @param {string} range - 'last_30', 'this_month', 'last_month', 'q1', 'q2', 'q3', 'q4'
 */
function getPeriodDates(range = 'last_30') {
    // Standardize to Midnight for consistent ranges
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    let currentStart, currentEnd, previousStart, previousEnd;

    if (range === 'this_month') {
        currentStart = new Date(today.getFullYear(), today.getMonth(), 1);
        currentEnd = new Date(today);
        previousStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        previousEnd = new Date(today.getFullYear(), today.getMonth(), 0);
    } else if (range === 'last_month') {
        currentStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        currentEnd = new Date(today.getFullYear(), today.getMonth(), 0);
        previousStart = new Date(today.getFullYear(), today.getMonth() - 2, 1);
        previousEnd = new Date(today.getFullYear(), today.getMonth() - 1, 0);
    } else if (range.startsWith('q')) {
        const quarter = parseInt(range.substring(1));
        const year = today.getFullYear();
        currentStart = new Date(year, (quarter - 1) * 3, 1);
        currentEnd = new Date(year, quarter * 3, 0);

        // Q-to-Q comparison
        previousStart = new Date(year, (quarter - 2) * 3, 1);
        previousEnd = new Date(year, (quarter - 1) * 3, 0);
    } else {
        // Default last_30: Strict 30 days including today
        currentEnd = new Date(today);
        currentStart = new Date(today);
        currentStart.setDate(today.getDate() - 29); // Today + 29 previous days = 30 days

        previousEnd = new Date(currentStart);
        previousEnd.setDate(previousEnd.getDate() - 1);
        previousStart = new Date(previousEnd);
        previousStart.setDate(previousStart.getDate() - 29);
    }

    return {
        current: {
            start: Math.floor(currentStart.getTime() / 1000),
            end: Math.floor(currentEnd.getTime() / 1000)
        },
        previous: {
            start: Math.floor(previousStart.getTime() / 1000),
            end: Math.floor(previousEnd.getTime() / 1000)
        }
    };
}

/**
 * Helper to fetch and sum metrics for a given period.
 */
async function fetchPeriodMetrics(client, token, period) {
    const data = {
        facebook: { impressions: 0, interactions: 0, reach: 0, followers: 0 },
        instagram: { impressions: 0, interactions: 0, reach: 0, followers: 0 }
    };

    // Facebook
    if (client.facebookPageId) {
        try {
            const pageTokenRes = await axios.get(`${BASE_URL}/${client.facebookPageId}?fields=access_token&access_token=${token}`);
            const pageToken = pageTokenRes.data.access_token;

            const fbMetricsRes = await axios.get(`${BASE_URL}/${client.facebookPageId}/insights`, {
                params: {
                    metric: 'page_impressions,page_post_engagements,page_posts_impressions_unique',
                    period: 'day',
                    since: period.start,
                    until: period.end,
                    access_token: pageToken
                }
            });

            const fbData = fbMetricsRes.data.data;
            data.facebook.impressions = fbData.find(m => m.name === 'page_impressions')?.values.reduce((acc, v) => acc + v.value, 0) || 0;
            data.facebook.interactions = fbData.find(m => m.name === 'page_post_engagements')?.values.reduce((acc, v) => acc + v.value, 0) || 0;
            data.facebook.reach = fbData.find(m => m.name === 'page_posts_impressions_unique')?.values.reduce((acc, v) => acc + v.value, 0) || 0;

            const fansRes = await axios.get(`${BASE_URL}/${client.facebookPageId}?fields=fan_count&access_token=${pageToken}`);
            data.facebook.followers = fansRes.data.fan_count || 0;
        } catch (error) {
            console.error('[Meta Metrics] FB Error:', error.message);
        }
    }

    // Instagram
    if (client.instagramBusinessId) {
        try {
            const igMetricsRes = await axios.get(`${BASE_URL}/${client.instagramBusinessId}/insights`, {
                params: {
                    metric: 'impressions,reach',
                    period: 'day',
                    since: period.start,
                    until: period.end,
                    access_token: token
                }
            });

            const igData = igMetricsRes.data.data;
            data.instagram.impressions = igData.find(m => m.name === 'impressions')?.values.reduce((acc, v) => acc + v.value, 0) || 0;
            data.instagram.reach = igData.find(m => m.name === 'reach')?.values.reduce((acc, v) => acc + v.value, 0) || 0;

            const igFollowersRes = await axios.get(`${BASE_URL}/${client.instagramBusinessId}?fields=followers_count&access_token=${token}`);
            data.instagram.followers = igFollowersRes.data.followers_count || 0;
        } catch (error) {
            console.error('[Meta Metrics] IG Error:', error.message);
        }
    }

    return data;
}

/**
 * Fetches organic metrics for a client (Facebook & Instagram).
 */
export async function getOrganicMetrics(clientId, range = 'last_30') {
    const client = await prisma.client.findUnique({
        where: { id: clientId },
        select: { facebookPageId: true, instagramBusinessId: true }
    });

    if (!client) throw new Error('Cliente no encontrado');

    const token = await getDecryptedToken(clientId, 'meta');
    if (!token) throw new Error('No hay integración de Meta para este cliente');

    const { current, previous } = getPeriodDates(range);

    const currentData = await fetchPeriodMetrics(client, token, current);
    const previousData = await fetchPeriodMetrics(client, token, previous);

    return {
        current: currentData,
        previous: previousData,
        combined: {
            current: {
                impressions: currentData.facebook.impressions + currentData.instagram.impressions,
                interactions: currentData.facebook.interactions + currentData.instagram.interactions,
                followers: currentData.facebook.followers + currentData.instagram.followers,
                reach: currentData.facebook.reach + currentData.instagram.reach
            },
            previous: {
                impressions: previousData.facebook.impressions + previousData.instagram.impressions,
                interactions: previousData.facebook.interactions + previousData.instagram.interactions,
                followers: previousData.facebook.followers + previousData.instagram.followers,
                reach: previousData.facebook.reach + previousData.instagram.reach
            }
        }
    };
}

/**
 * Fetches reach trend for charts.
 */
export async function getReachTrend(clientId, range = 'last_30') {
    const client = await prisma.client.findUnique({
        where: { id: clientId },
        select: { facebookPageId: true, instagramBusinessId: true }
    });

    const token = await getDecryptedToken(clientId, 'meta');
    if (!token) throw new Error('No token');

    const { current } = getPeriodDates(range);
    const trend = [];

    // Simple daily trend mapping
    // This would ideally be a more complex merge of FB and IG daily data points.
    // For now, let's fetch daily reach and map it.

    try {
        let fbDaily = [];
        let igDaily = [];

        if (client.facebookPageId) {
            const pageTokenRes = await axios.get(`${BASE_URL}/${client.facebookPageId}?fields=access_token&access_token=${token}`);
            const fbRes = await axios.get(`${BASE_URL}/${client.facebookPageId}/insights`, {
                params: {
                    metric: 'page_posts_impressions_unique',
                    period: 'day',
                    since: current.start,
                    until: current.end,
                    access_token: pageTokenRes.data.access_token
                }
            });
            fbDaily = fbRes.data.data[0]?.values || [];
        }

        if (client.instagramBusinessId) {
            const igRes = await axios.get(`${BASE_URL}/${client.instagramBusinessId}/insights`, {
                params: {
                    metric: 'reach',
                    period: 'day',
                    since: current.start,
                    until: current.end,
                    access_token: token
                }
            });
            igDaily = igRes.data.data[0]?.values || [];
        }

        // Merge by date
        const dates = new Set([...fbDaily.map(v => v.end_time.split('T')[0]), ...igDaily.map(v => v.end_time.split('T')[0])]);
        const sortedDates = Array.from(dates).sort();

        sortedDates.forEach(date => {
            const fbVal = fbDaily.find(v => v.end_time.startsWith(date))?.value || 0;
            const igVal = igDaily.find(v => v.end_time.startsWith(date))?.value || 0;
            trend.push({ date, facebook: fbVal, instagram: igVal });
        });

    } catch (e) {
        console.error('[Meta Metrics] Trend error:', e.message);
    }

    return trend;
}

/**
 * Fetches top performing content.
 */
export async function getTopContent(clientId, range = 'last_30') {
    const client = await prisma.client.findUnique({
        where: { id: clientId },
        select: { facebookPageId: true, instagramBusinessId: true }
    });

    const token = await getDecryptedToken(clientId, 'meta');
    if (!token) throw new Error('No token');

    const { current } = getPeriodDates(range);
    let allPosts = [];

    try {
        if (client.facebookPageId) {
             // Use Page Access Token for FB insights
             const pageTokenRes = await axios.get(`${BASE_URL}/${client.facebookPageId}?fields=access_token&access_token=${token}`);
             const pageToken = pageTokenRes.data.access_token;

             const fbPostsRes = await axios.get(`${BASE_URL}/${client.facebookPageId}/posts`, {
                params: {
                    fields: 'id,message,created_time,full_picture,type,insights.metric(post_impressions_unique,post_engagements)',
                    since: current.start,
                    until: current.end,
                    limit: 100,
                    access_token: pageToken
                }
             });
             const fbPosts = (fbPostsRes.data.data || []).map(p => {
                 const reach = p.insights?.data.find(i => i.name === 'post_impressions_unique')?.values[0]?.value || 0;
                 const engagement = p.insights?.data.find(i => i.name === 'post_engagements')?.values[0]?.value || 0;
                 return {
                     id: p.id,
                     type: p.type || 'Post',
                     content: p.message || 'Sin texto',
                     thumbnail: p.full_picture,
                     reach,
                     engagement,
                     platform: 'facebook',
                     date: p.created_time
                 };
             });
             allPosts = [...allPosts, ...fbPosts];
        }

        if (client.instagramBusinessId) {
            const igMediaRes = await axios.get(`${BASE_URL}/${client.instagramBusinessId}/media`, {
                params: {
                    fields: 'id,caption,media_type,media_url,thumbnail_url,timestamp,insights.metric(impressions,reach,engagement)',
                    since: current.start,
                    until: current.end,
                    limit: 100,
                    access_token: token
                }
            });
            const igMedia = (igMediaRes.data.data || []).map(m => {
                const reach = m.insights?.data.find(i => i.name === 'reach')?.values[0]?.value || 0;
                const engagement = m.insights?.data.find(i => i.name === 'engagement')?.values[0]?.value || 0;
                return {
                    id: m.id,
                    type: m.media_type,
                    content: m.caption || 'Sin caption',
                    thumbnail: m.media_type === 'VIDEO' ? m.thumbnail_url : m.media_url,
                    reach,
                    engagement,
                    platform: 'instagram',
                    date: m.timestamp
                };
            });
            allPosts = [...allPosts, ...igMedia];
        }

        // Sort by reach and engagement
        allPosts.sort((a, b) => (b.reach + b.engagement) - (a.reach + a.engagement));

    } catch (e) {
        console.error('[Meta Metrics] Top Content error:', e.message);
    }

    return allPosts.slice(0, 5);
}

/**
 * Pure function to process Meta Ads insight data.
 * @param {Array|Object} data - Raw data from Meta API
 */
export function processAdsData(data) {
    const raw = Array.isArray(data) ? data[0] : data;
    const insights = raw || { spend: 0, actions: [], reach: 0, impressions: 0 };

    // Sum if it's an array (for custom aggregations) or take as is
    const spend = Array.isArray(data) ? data.reduce((acc, d) => acc + parseFloat(d.spend || 0), 0) : parseFloat(insights.spend || 0);
    const reach = Array.isArray(data) ? data.reduce((acc, d) => acc + parseInt(d.reach || 0), 0) : parseInt(insights.reach || 0);
    const impressions = Array.isArray(data) ? data.reduce((acc, d) => acc + parseInt(d.impressions || 0), 0) : parseInt(insights.impressions || 0);

    // Results mapping (Priority: Messaging > Conversions > Others)
    const allActions = Array.isArray(data) ? data.flatMap(d => d.actions || []) : (insights.actions || []);
    const messagingActions = allActions.filter(a =>
        ['onsite_conversion.messaging_conversation_started_7d', 'messaging_conversation_started_7d'].includes(a.action_type)
    );

    let results = 0;
    if (messagingActions.length > 0) {
        results = messagingActions.reduce((acc, a) => acc + parseInt(a.value || 0), 0);
    } else {
        // Fallback to generic conversions if no messaging
        results = allActions.find(a => a.action_type.includes('conversion'))?.value || 0;
    }

    return {
        spend: Math.round(spend),
        results: parseInt(results),
        reach: reach,
        impressions: impressions,
        costPerResult: results > 0 ? parseFloat((spend / results).toFixed(2)) : 0
    };
}

/**
 * Fetches Ads performance.
 */
export async function getAdsInsights(clientId, range = 'last_30') {
    const client = await prisma.client.findUnique({
        where: { id: clientId },
        select: { adAccountId: true }
    });

    if (!client.adAccountId) return null;

    const token = await getDecryptedToken(clientId, 'meta');
    if (!token) throw new Error('No token');

    const { current, previous } = getPeriodDates(range);

    const fetchAdsForRange = async (start, end) => {
        const accountId = client.adAccountId.startsWith('act_') ? client.adAccountId : `act_${client.adAccountId}`;
        const res = await axios.get(`${BASE_URL}/${accountId}/insights`, {
            params: {
                level: 'account',
                fields: 'spend,actions,reach,impressions',
                time_range: JSON.stringify({
                    since: new Date(start * 1000).toISOString().split('T')[0],
                    until: new Date(end * 1000).toISOString().split('T')[0]
                }),
                access_token: token
            }
        });

        return processAdsData(res.data.data);
    };

    try {
        const currentAds = await fetchAdsForRange(current.start, current.end);
        const previousAds = await fetchAdsForRange(previous.start, previous.end);

        return {
            current: {
                ...currentAds,
                efficiency: currentAds.costPerResult
            },
            previous: {
                ...previousAds,
                efficiency: previousAds.costPerResult
            }
        };
    } catch (e) {
        console.error('[Meta Metrics] Ads error:', e.response?.data || e.message);
        return null;
    }
}
