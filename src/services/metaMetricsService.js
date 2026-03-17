import axios from 'axios';
import { getDecryptedToken } from './integrationService.js';
import prisma from '../lib/prisma.js';

const GRAPH_API_VERSION = 'v21.0';
const BASE_URL = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

/**
 * Helper to get dates for current and previous 30-day periods.
 */
function getPeriodDates() {
    const now = new Date();
    const currentEnd = new Date(now);
    const currentStart = new Date(now);
    currentStart.setDate(currentStart.getDate() - 30);

    const previousEnd = new Date(currentStart);
    const previousStart = new Date(previousEnd);
    previousStart.setDate(previousStart.getDate() - 30);

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
export async function getOrganicMetrics(clientId) {
    const client = await prisma.client.findUnique({
        where: { id: clientId },
        select: { facebookPageId: true, instagramBusinessId: true }
    });

    if (!client) throw new Error('Cliente no encontrado');

    const token = await getDecryptedToken(clientId, 'meta');
    if (!token) throw new Error('No hay integración de Meta para este cliente');

    const { current, previous } = getPeriodDates();

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
export async function getReachTrend(clientId) {
    const client = await prisma.client.findUnique({
        where: { id: clientId },
        select: { facebookPageId: true, instagramBusinessId: true }
    });

    const token = await getDecryptedToken(clientId, 'meta');
    if (!token) throw new Error('No token');

    const { current } = getPeriodDates();
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
export async function getTopContent(clientId) {
    const client = await prisma.client.findUnique({
        where: { id: clientId },
        select: { facebookPageId: true, instagramBusinessId: true }
    });

    const token = await getDecryptedToken(clientId, 'meta');
    if (!token) throw new Error('No token');

    let allPosts = [];

    try {
        if (client.facebookPageId) {
             // Use Page Access Token for FB insights
             const pageTokenRes = await axios.get(`${BASE_URL}/${client.facebookPageId}?fields=access_token&access_token=${token}`);
             const pageToken = pageTokenRes.data.access_token;

             const fbPostsRes = await axios.get(`${BASE_URL}/${client.facebookPageId}/posts?fields=id,message,created_time,full_picture,type,insights.metric(post_impressions_unique,post_engagements)&limit=10&access_token=${pageToken}`);
             const fbPosts = fbPostsRes.data.data.map(p => {
                 const reach = p.insights?.data.find(i => i.name === 'post_impressions_unique')?.values[0]?.value || 0;
                 const engagement = p.insights?.data.find(i => i.name === 'post_engagements')?.values[0]?.value || 0;
                 return {
                     id: p.id,
                     type: p.type || 'Post',
                     content: p.message || 'Sin texto',
                     reach,
                     engagement,
                     platform: 'facebook',
                     date: p.created_time
                 };
             });
             allPosts = [...allPosts, ...fbPosts];
        }

        if (client.instagramBusinessId) {
            const igMediaRes = await axios.get(`${BASE_URL}/${client.instagramBusinessId}/media?fields=id,caption,media_type,timestamp,insights.metric(impressions,reach,engagement)&limit=10&access_token=${token}`);
            const igMedia = igMediaRes.data.data.map(m => {
                const reach = m.insights?.data.find(i => i.name === 'reach')?.values[0]?.value || 0;
                const engagement = m.insights?.data.find(i => i.name === 'engagement')?.values[0]?.value || 0;
                return {
                    id: m.id,
                    type: m.media_type,
                    content: m.caption || 'Sin caption',
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
 * Fetches Ads performance.
 */
export async function getAdsInsights(clientId) {
    const client = await prisma.client.findUnique({
        where: { id: clientId },
        select: { adAccountId: true }
    });

    if (!client.adAccountId) return null;

    const token = await getDecryptedToken(clientId, 'meta');
    if (!token) throw new Error('No token');

    const { current, previous } = getPeriodDates();

    const fetchAdsForRange = async (start, end) => {
        const res = await axios.get(`${BASE_URL}/${client.adAccountId}/insights`, {
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
        const data = res.data.data[0] || { spend: 0, actions: [], reach: 0, impressions: 0 };
        // Priority for results: specific conversions, then total actions
        const results = data.actions?.find(a =>
            ['offsite_conversion.fb_pixel_purchase', 'lead', 'onsite_conversion.messaging_first_reply', 'contact'].includes(a.action_type)
        )?.value || data.actions?.reduce((acc, a) => acc + parseInt(a.value), 0) || 0;

        return {
            spend: parseFloat(data.spend || 0),
            results: parseInt(results),
            reach: parseInt(data.reach || 0),
            impressions: parseInt(data.impressions || 0)
        };
    };

    try {
        const currentAds = await fetchAdsForRange(current.start, current.end);
        const previousAds = await fetchAdsForRange(previous.start, previous.end);

        return {
            current: {
                ...currentAds,
                efficiency: currentAds.spend > 0 ? (currentAds.spend / (currentAds.results || 1)).toFixed(2) : 0
            },
            previous: {
                ...previousAds,
                efficiency: previousAds.spend > 0 ? (previousAds.spend / (previousAds.results || 1)).toFixed(2) : 0
            }
        };
    } catch (e) {
        console.error('[Meta Metrics] Ads error:', e.response?.data || e.message);
        return null;
    }
}
