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

/**
 * Fetches Meta assets (Ad Accounts and Pages) for a specific client based on their businessId.
 */
export async function getMetaAssets(clientId) {
    if (!clientId) throw new Error('clientId es requerido');

    const token = await getDecryptedToken(clientId, 'meta');
    if (!token) throw new Error('No se encontró una conexión de Meta activa para este cliente.');

    const integration = await prisma.integration.findUnique({
        where: { clientId_provider: { clientId, provider: 'meta' } }
    });

    if (!integration) throw new Error('Integración no encontrada en la base de datos');

    const businessId = integration.metadata?.businessId;

    console.log(`[IntegrationService] Fetching assets for Client: ${clientId}, Business: ${businessId || 'NONE'}`);

    const assets = {
        adAccounts: [],
        pages: [],
        businesses: [], // Added to support selection if businessId is missing
        requiresBusinessSelection: !businessId
    };

    if (!businessId) {
        console.log(`[IntegrationService] No businessId for client ${clientId}. Fetching available businesses...`);
        try {
            const bizRes = await axios.get(`https://graph.facebook.com/v21.0/me/businesses?access_token=${token}`);
            assets.businesses = bizRes.data.data;
        } catch (bizError) {
            console.error('[Meta API] Error fetching businesses:', bizError.response?.data || bizError.message);
        }
        return assets;
    }

    try {
        // Fetch Ad Accounts
        const adAccountsRes = await axios.get(`https://graph.facebook.com/v21.0/${businessId}/adaccounts?fields=name,account_id,id&access_token=${token}`);
        assets.adAccounts = adAccountsRes.data.data;

        // Fetch Pages (Client pages through the business)
        const pagesRes = await axios.get(`https://graph.facebook.com/v21.0/${businessId}/client_pages?fields=name,id,access_token&access_token=${token}`);
        assets.pages = pagesRes.data.data;

    } catch (error) {
        console.error('[Meta API] Error fetching assets:', error.response?.data || error.message);
        throw new Error('Error al obtener activos de Meta: ' + (error.response?.data?.error?.message || error.message));
    }

    return assets;
}

/**
 * Fetches the Instagram Business account linked to a specific Facebook Page.
 */
export async function getInstagramAccount(clientId, pageId) {
    const token = await getDecryptedToken(clientId, 'meta');
    if (!token) throw new Error('Token no encontrado');

    try {
        const response = await axios.get(`https://graph.facebook.com/v21.0/${pageId}?fields=instagram_business_account{id,username,name}&access_token=${token}`);
        return response.data.instagram_business_account || null;
    } catch (error) {
        console.error('[Meta API] Error fetching Instagram account:', error.response?.data || error.message);
        throw new Error('Error al obtener cuenta de Instagram: ' + (error.response?.data?.error?.message || error.message));
    }
}

/**
 * Updates the client's asset mapping and optionally the integration businessId.
 */
export async function updateClientMapping(clientId, mapping) {
    const { facebookPageId, instagramBusinessId, adAccountId, businessId } = mapping;

    // 1. Update Client Mapping
    await prisma.client.update({
        where: { id: clientId },
        data: {
            facebookPageId,
            instagramBusinessId,
            adAccountId
        }
    });

    // 2. If businessId is provided, update Integration metadata
    if (businessId) {
        const integration = await prisma.integration.findUnique({
            where: { clientId_provider: { clientId, provider: 'meta' } }
        });

        if (integration) {
            const newMetadata = {
                ...(integration.metadata || {}),
                businessId
            };

            // Try to find the business name to enrich metadata
            try {
                const token = decrypt(integration.encryptedToken);
                const bizRes = await axios.get(`https://graph.facebook.com/v21.0/${businessId}?fields=name&access_token=${token}`);
                if (bizRes.data?.name) {
                    newMetadata.businessName = bizRes.data.name;
                }
            } catch (e) {
                console.warn('[IntegrationService] Could not fetch business name for mapping update:', e.message);
            }

            await prisma.integration.update({
                where: { id: integration.id },
                data: { metadata: newMetadata }
            });
        }
    }

    return { success: true };
}
