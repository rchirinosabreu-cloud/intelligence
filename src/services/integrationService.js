import prisma from '../lib/prisma.js';
import { encrypt, decrypt } from '../utils/encryption.js';
import axios from 'axios';

/**
 * Exchanges a short-lived Meta access token for a long-lived one.
 * @param {string} shortLivedToken
 * @returns {Promise<string>} Long-lived access token
 */
async function exchangeMetaLongLivedToken(shortLivedToken) {
    const appId = process.env.META_APP_ID;
    const appSecret = process.env.META_APP_SECRET;

    if (!appId || !appSecret) {
        throw new Error('META_APP_ID or META_APP_SECRET not configured in backend.');
    }

    const url = `https://graph.facebook.com/v21.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${shortLivedToken}`;

    const response = await axios.get(url);
    return response.data.access_token;
}

/**
 * Saves or updates a Meta integration for a client.
 * @param {string} clientId
 * @param {string} shortLivedToken
 * @param {Object} metadata
 */
export async function saveMetaIntegration(clientId, shortLivedToken, metadata = {}) {
    const longLivedToken = await exchangeMetaLongLivedToken(shortLivedToken);
    const encryptedToken = encrypt(longLivedToken);

    // Fetch Meta Profile details to enrich metadata
    let enrichedMetadata = { ...metadata };
    try {
        console.log('[Meta API] Fetching profile details for long-lived token...');
        const profileResponse = await axios.get(`https://graph.facebook.com/v21.0/me?fields=id,name&access_token=${longLivedToken}`);

        enrichedMetadata = {
            ...enrichedMetadata,
            facebookUserId: profileResponse.data.id,
            facebookUserName: profileResponse.data.name
        };

        // Try to fetch business accounts if permission was granted
        try {
            const businessesResponse = await axios.get(`https://graph.facebook.com/v21.0/me/businesses?access_token=${longLivedToken}`);
            if (businessesResponse.data?.data?.length > 0) {
                // Store first business ID as primary businessId in metadata
                enrichedMetadata.businessId = businessesResponse.data.data[0].id;
                enrichedMetadata.businessName = businessesResponse.data.data[0].name;
            }
        } catch (bizError) {
            console.warn('[Meta API] Could not fetch businesses:', bizError.message);
        }
    } catch (profileError) {
        console.error('[Meta API] Error fetching profile details:', profileError.message);
    }

    return await prisma.integration.upsert({
        where: {
            clientId_provider: {
                clientId,
                provider: 'meta'
            }
        },
        update: {
            encryptedToken,
            metadata: enrichedMetadata,
            updatedAt: new Date()
        },
        create: {
            clientId,
            provider: 'meta',
            encryptedToken,
            metadata: enrichedMetadata
        }
    });
}

/**
 * Gets the integration status for a client.
 * @param {string} clientId
 */
export async function getIntegrationStatus(clientId) {
    const integrations = await prisma.integration.findMany({
        where: { clientId },
        select: {
            provider: true,
            updatedAt: true,
            metadata: true
        }
    });

    return integrations;
}

/**
 * Gets the decrypted token for a specific integration.
 * @param {string} clientId
 * @param {string} provider
 */
export async function getDecryptedToken(clientId, provider) {
    const integration = await prisma.integration.findUnique({
        where: {
            clientId_provider: {
                clientId,
                provider
            }
        }
    });

    if (!integration) return null;

    return decrypt(integration.encryptedToken);
}
