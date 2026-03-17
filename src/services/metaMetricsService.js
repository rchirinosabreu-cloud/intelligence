import axios from 'axios';
import { getDecryptedToken } from './integrationService.js';
import prisma from '../lib/prisma.js';

const GRAPH_API_VERSION = 'v21.0';
const BASE_URL = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

/**
 * Helper to get dates for flexible periods.
 * Uses local dates for string formatting and UTC for timestamps.
 * @param {string} range - 'last_30', 'this_month', 'last_month', 'q1', 'q2', 'q3', 'q4'
 */
function getPeriodDates(range = 'last_30') {
    const now = new Date();
    // Start of "today" in local time
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    let currentStart, currentEnd, previousStart, previousEnd;

    if (range === 'this_month') {
        currentStart = new Date(today.getFullYear(), today.getMonth(), 1);
        currentEnd = new Date(today);
        currentEnd.setDate(currentEnd.getDate() + 1); // Until tomorrow (exclusive) = inclusive of today
        previousStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        previousEnd = new Date(today.getFullYear(), today.getMonth(), 0);
        previousEnd.setDate(previousEnd.getDate() + 1);
    } else if (range === 'last_month') {
        currentStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        currentEnd = new Date(today.getFullYear(), today.getMonth(), 0);
        currentEnd.setDate(currentEnd.getDate() + 1);
        previousStart = new Date(today.getFullYear(), today.getMonth() - 2, 1);
        previousEnd = new Date(today.getFullYear(), today.getMonth() - 1, 0);
        previousEnd.setDate(previousEnd.getDate() + 1);
    } else if (range.startsWith('q')) {
        const quarter = parseInt(range.substring(1));
        const year = today.getFullYear();
        currentStart = new Date(year, (quarter - 1) * 3, 1);
        currentEnd = new Date(year, quarter * 3, 0);
        currentEnd.setDate(currentEnd.getDate() + 1);

        previousStart = new Date(year, (quarter - 2) * 3, 1);
        previousEnd = new Date(year, (quarter - 1) * 3, 0);
        previousEnd.setDate(previousEnd.getDate() + 1);
    } else {
        // Default last_30
        currentEnd = new Date(today);
        currentEnd.setDate(today.getDate() + 1);

        currentStart = new Date(today);
        currentStart.setDate(today.getDate() - 29);

        previousEnd = new Date(currentStart);
        previousStart = new Date(previousEnd);
        previousStart.setDate(previousStart.getDate() - 30);
    }

    // Formatter for YYYY-MM-DD (Local)
    const formatDate = (d) => {
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };

    return {
        current: {
            start: Math.floor(currentStart.getTime() / 1000),
            end: Math.floor(currentEnd.getTime() / 1000),
            since: formatDate(currentStart),
            until: formatDate(currentEnd) // Until is exclusive in Meta Insights, so "tomorrow" midnight includes "today"
        },
        previous: {
            start: Math.floor(previousStart.getTime() / 1000),
            end: Math.floor(previousEnd.getTime() / 1000),
            since: formatDate(previousStart),
            until: formatDate(previousEnd)
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
            // Get Page Access Token specifically
            const pageTokenRes = await axios.get(`${BASE_URL}/${client.facebookPageId}?fields=access_token&access_token=${token}`);
            const pageToken = pageTokenRes.data.access_token;
            if (!pageToken) throw new Error('Could not retrieve Page Access Token');

            console.log(`[Meta Metrics] Fetching FB Insights for ${client.facebookPageId} (${period.since} to ${period.until})`);
            // Standard Page Insights for New Page Experience
            // Note: Use page_engaged_users for interactions if page_post_engagements fails
            const fbMetricsRes = await axios.get(`${BASE_URL}/${client.facebookPageId}/insights`, {
                params: {
                    metric: 'page_impressions,page_engaged_users,page_impressions_unique',
                    period: 'day',
                    since: period.since,
                    until: period.until,
                    access_token: pageToken
                }
            });

            const fbData = fbMetricsRes.data.data;
            if (fbData && fbData.length > 0) {
                // Ensure we find the correct metric and sum all values in the range
                const findAndSum = (name) => {
                    const metric = fbData.find(m => m.name === name);
                    if (!metric || !metric.values) return 0;
                    return metric.values.reduce((sum, v) => sum + (Number(v.value) || 0), 0);
                };

                data.facebook.impressions = findAndSum('page_impressions');
                data.facebook.interactions = findAndSum('page_engaged_users');
                data.facebook.reach = findAndSum('page_impressions_unique');

                console.log(`[Meta Metrics] FB Summed (${period.since}-${period.until}) - Imp: ${data.facebook.impressions}, Int: ${data.facebook.interactions}, Reach: ${data.facebook.reach}`);
            } else {
                console.log('[Meta Metrics] FB Insights returned no data array for', period.since, 'to', period.until);
            }

            const fansRes = await axios.get(`${BASE_URL}/${client.facebookPageId}?fields=fan_count&access_token=${pageToken}`);
            data.facebook.followers = fansRes.data.fan_count || 0;
        } catch (error) {
            console.error('[Meta Metrics] FB Error:', error.response?.data || error.message);
        }
    }

    // Instagram
    if (client.instagramBusinessId) {
        try {
            console.log(`[Meta Metrics] Fetching IG Insights for ${client.instagramBusinessId} (${period.since} to ${period.until})`);
            // Using user-requested metrics: reach, impressions, profile_views
            const igMetricsRes = await axios.get(`${BASE_URL}/${client.instagramBusinessId}/insights`, {
                params: {
                    metric: 'reach,impressions,profile_views',
                    period: 'day',
                    since: period.since,
                    until: period.until,
                    access_token: token
                }
            });

            const igData = igMetricsRes.data.data;
            if (igData && igData.length > 0) {
                const findAndSum = (name) => {
                    const metric = igData.find(m => m.name === name);
                    if (!metric || !metric.values) return 0;
                    return metric.values.reduce((sum, v) => sum + (Number(v.value) || 0), 0);
                };

                data.instagram.impressions = findAndSum('impressions');
                data.instagram.reach = findAndSum('reach');

                // Summing interactions is not supported directly at account level without media iteration.
                data.instagram.interactions = 0;

                console.log(`[Meta Metrics] IG Summed (${period.since}-${period.until}) - Imp: ${data.instagram.impressions}, Reach: ${data.instagram.reach}`);
            } else {
                    console.log('[Meta Metrics] IG Insights returned no data array for', period.since, 'to', period.until);
            }

            const igFollowersRes = await axios.get(`${BASE_URL}/${client.instagramBusinessId}?fields=followers_count&access_token=${token}`);
            data.instagram.followers = igFollowersRes.data.followers_count || 0;
        } catch (error) {
            console.error('[Meta Metrics] IG Error:', error.response?.data || error.message);
        }
    }

    return data;
}

/**
 * Fetches organic metrics for a client (Facebook & Instagram).
 */
export async function getOrganicMetrics(clientId, range = 'last_30') {
    if (process.env.MOCK_METRICS === 'true') {
        return {
            current: {
                facebook: { impressions: 12500, interactions: 850, reach: 9800, followers: 4500 },
                instagram: { impressions: 18200, interactions: 2400, reach: 15600, followers: 8200 }
            },
            previous: {
                facebook: { impressions: 11000, interactions: 780, reach: 8900, followers: 4420 },
                instagram: { impressions: 15000, interactions: 1900, reach: 12000, followers: 7950 }
            },
            combined: {
                current: { impressions: 30700, interactions: 3250, followers: 12700, reach: 25400 },
                previous: { impressions: 26000, interactions: 2680, followers: 12370, reach: 20900 }
            }
        };
    }

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
    if (process.env.MOCK_METRICS === 'true') {
        const trend = [];
        const now = new Date();
        for (let i = 29; i >= 0; i--) {
            const date = new Date(now);
            date.setDate(now.getDate() - i);
            trend.push({
                date: date.toISOString().split('T')[0],
                facebook: Math.floor(Math.random() * 500) + 200,
                instagram: Math.floor(Math.random() * 800) + 400
            });
        }
        return trend;
    }

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
            const pageToken = pageTokenRes.data.access_token;
            if (!pageToken) throw new Error('Could not retrieve Page Access Token for Trend');

            const fbRes = await axios.get(`${BASE_URL}/${client.facebookPageId}/insights`, {
                params: {
                    metric: 'page_impressions_unique',
                    period: 'day',
                    since: current.since,
                    until: current.until,
                    access_token: pageToken
                }
            });
            fbDaily = fbRes.data.data[0]?.values || [];
        }

        if (client.instagramBusinessId) {
            const igRes = await axios.get(`${BASE_URL}/${client.instagramBusinessId}/insights`, {
                params: {
                    metric: 'reach',
                    period: 'day',
                    since: current.since,
                    until: current.until,
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
    if (process.env.MOCK_METRICS === 'true') {
        return [
            { id: '1', type: 'IMAGE', content: 'Nueva colección Bonsai Verano 2025', thumbnail: 'https://images.unsplash.com/photo-1512428559087-560fa5ceab42?w=400', reach: 4500, engagement: 320, platform: 'instagram', date: new Date().toISOString() },
            { id: '2', type: 'VIDEO', content: 'Behind the scenes: Shooting en Cartagena', thumbnail: 'https://images.unsplash.com/photo-1492691523567-6170f0295dbd?w=400', reach: 8900, engagement: 1250, platform: 'instagram', date: new Date().toISOString() },
            { id: '3', type: 'CAROUSEL_ALBUM', content: '5 tips para cuidar tu Bonsai', thumbnail: 'https://images.unsplash.com/photo-1515446133109-60d0bc01a24d?w=400', reach: 3200, engagement: 450, platform: 'facebook', date: new Date().toISOString() },
            { id: '4', type: 'REELS', content: 'Quick tip: Riego matutino', thumbnail: 'https://images.unsplash.com/photo-1416339306562-f3d12fefd36f?w=400', reach: 12000, engagement: 2100, platform: 'instagram', date: new Date().toISOString() },
            { id: '5', type: 'IMAGE', content: 'Promoción 2x1 en macetas', thumbnail: 'https://images.unsplash.com/photo-1466781783364-391eaf89eb22?w=400', reach: 2100, engagement: 180, platform: 'facebook', date: new Date().toISOString() }
        ];
    }

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

             console.log(`[Meta Metrics] Fetching FB Top Content for ${client.facebookPageId} (${current.since} to ${current.until})`);
             // New Page Experience compatible fields
             const fbPostsRes = await axios.get(`${BASE_URL}/${client.facebookPageId}/posts`, {
                params: {
                    fields: 'id,message,created_time,full_picture,type,insights.metric(post_impressions_unique,post_engaged_users)',
                    since: current.since,
                    until: current.until,
                    limit: 50,
                    access_token: pageToken
                }
             });
             console.log(`[Meta Metrics] FB Posts Count: ${fbPostsRes.data?.data?.length || 0}`);

             const fbPosts = (fbPostsRes.data.data || []).map(p => {
                 const reach = p.insights?.data.find(i => i.name === 'post_impressions_unique')?.values[0]?.value || 0;
                 const engagement = p.insights?.data.find(i => i.name === 'post_engaged_users')?.values[0]?.value || 0;
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
            console.log(`[Meta Metrics] Fetching IG Top Content for ${client.instagramBusinessId} (${current.since} to ${current.until})`);
            // To avoid Error #400/100, we fetch basic media fields first and engagement from metadata (like_count, comments_count).
            // Reels insights often fail in bulk edge queries.
            const igMediaRes = await axios.get(`${BASE_URL}/${client.instagramBusinessId}/media`, {
                params: {
                    fields: 'id,caption,media_type,media_url,thumbnail_url,timestamp,like_count,comments_count',
                    since: current.since,
                    until: current.until,
                    limit: 50,
                    access_token: token
                }
            });
            console.log(`[Meta Metrics] IG Media Count: ${igMediaRes.data?.data?.length || 0}`);

            const igMedia = (igMediaRes.data.data || []).map(m => {
                // Approximate reach for IG if insights fail is hard.
                // We'll prioritize the media engagement (Likes + Comments) as requested.
                // If the user wants real reach, we'd need per-media insight calls which is slow.
                const engagement = (m.like_count || 0) + (m.comments_count || 0);

                return {
                    id: m.id,
                    type: m.media_type,
                    content: m.caption || 'Sin caption',
                    thumbnail: m.media_type === 'VIDEO' ? m.thumbnail_url : m.media_url,
                    reach: 0, // Placeholder as bulk reach insights often crash for mixed media types (Reels)
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
    // If no data, return empty metrics
    if (!data || (Array.isArray(data) && data.length === 0)) {
        return { spend: 0, results: 0, reach: 0, impressions: 0, costPerResult: 0 };
    }

    const insightsList = Array.isArray(data) ? data : [data];

    let spend = 0;
    let reach = 0;
    let impressions = 0;
    let totalMessaging = 0;
    let totalConversions = 0;

    insightsList.forEach(insights => {
        spend += parseFloat(insights.spend || 0);
        reach += parseInt(insights.reach || 0);
        impressions += parseInt(insights.impressions || 0);

        const actions = insights.actions || [];
        actions.forEach(a => {
            // Count all variations of messaging starts
            if (a.action_type.includes('messaging_conversation_started')) {
                totalMessaging += parseInt(a.value || 0);
            }
            // Also track other conversions as fallback
            if (a.action_type.includes('conversion') || a.action_type.includes('lead')) {
                totalConversions += parseInt(a.value || 0);
            }
        });
    });

    // Priority to messaging, then general conversions
    const results = totalMessaging > 0 ? totalMessaging : totalConversions;

    return {
        spend: parseFloat(spend.toFixed(2)),
        results: results,
        reach: reach,
        impressions: impressions,
        costPerResult: results > 0 ? parseFloat((spend / results).toFixed(2)) : 0
    };
}

/**
 * Fetches Ads performance.
 */
export async function getAdsInsights(clientId, range = 'last_30') {
    if (process.env.MOCK_METRICS === 'true') {
        return {
            current: { spend: 1250, results: 45, reach: 45000, impressions: 89000, costPerResult: 27.7, efficiency: 27.7 },
            previous: { spend: 1100, results: 32, reach: 38000, impressions: 72000, costPerResult: 34.3, efficiency: 34.3 }
        };
    }

    const client = await prisma.client.findUnique({
        where: { id: clientId },
        select: { adAccountId: true }
    });

    if (!client.adAccountId) return null;

    const token = await getDecryptedToken(clientId, 'meta');
    if (!token) throw new Error('No token');

    const { current, previous } = getPeriodDates(range);

    const fetchAdsForRange = async (periodObj) => {
        const accountId = client.adAccountId.startsWith('act_') ? client.adAccountId : `act_${client.adAccountId}`;
        console.log(`[Meta Metrics] Fetching Ads for ${accountId} (${periodObj.since} to ${periodObj.until})`);

        const res = await axios.get(`${BASE_URL}/${accountId}/insights`, {
            params: {
                level: 'account',
                fields: 'spend,actions,reach,impressions',
                time_range: JSON.stringify({
                    since: periodObj.since,
                    until: periodObj.until
                }),
                access_token: token
            }
        });

        const processed = processAdsData(res.data.data);
        console.log(`[Meta Metrics] Ads Processed: Spend:${processed.spend}, Results:${processed.results}`);
        return processed;
    };

    try {
        const currentAds = await fetchAdsForRange(current);
        const previousAds = await fetchAdsForRange(previous);

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
