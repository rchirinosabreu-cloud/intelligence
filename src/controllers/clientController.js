import prisma from '../lib/prisma.js';
import { getClients, createClient, getClientLinks, addClientLink, removeClientLink } from '../services/clientService.js';
import { fetchClientHealth } from '../services/healthService.js';

export const listClients = async (req, res) => {
    try {
        const filters = {
            isArchived: req.query.isArchived,
            responsibleId: req.query.responsibleId
        };
        const clients = await getClients(filters);
        res.json(clients);
    } catch (error) {
        console.error("[ClientController] Failed to list clients:", error?.message || error);
        res.status(500).json({ error: "Failed to list clients" });
    }
};

export const getHealth = async (req, res) => {
    try {
        const clients = await fetchClientHealth();
        res.json(clients);
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch health indicators" });
    }
};

export const createNewClient = async (req, res) => {
    try {
        const client = await createClient(req.body);
        res.status(201).json(client);
    } catch (error) {
        console.error("[ClientController] Failed to create client:", error?.message || error);
        res.status(500).json({ error: "Failed to create client" });
    }
};

export const updateClient = async (req, res) => {
    try {
        const { name, slug } = req.body;
        const updatedClient = await prisma.client.update({
            where: { id: req.params.id },
            data: { name, slug }
        });
        res.json(updatedClient);
    } catch (error) {
        res.status(500).json({ error: "Failed to update client" });
    }
};

export const archiveClientHandler = async (req, res) => {
    try {
        const { id } = req.params;
        const { isArchived } = req.body;

        // If isArchived is not provided in body, we could toggle,
        // but explicit is better for APIs. Fallback to toggle if missing.
        let targetStatus = isArchived;
        if (targetStatus === undefined) {
            const current = await prisma.client.findUnique({ where: { id }, select: { isArchived: true } });
            targetStatus = !current.isArchived;
        }

        const client = await prisma.client.update({
            where: { id },
            data: { isArchived: !!targetStatus }
        });
        res.json(client);
    } catch (error) {
        res.status(500).json({ error: "Failed to archive client" });
    }
};

export const addHealthCommentHandler = async (req, res) => {
    try {
        const { id } = req.params;
        const { comment } = req.body;
        const authorId = req.user?.userId;

        if (!comment) return res.status(400).json({ error: "Comment is required" });

        const agencyContext = await prisma.agencyContext.create({
            data: {
                clientId: id,
                content: comment,
                type: 'TEXT',
                status: 'APPROVED',
                metadata: {
                    authorId,
                    category: 'HEALTH_COMMENT'
                }
            }
        });
        res.json(agencyContext);
    } catch (error) {
        console.error("Health comment error:", error);
        res.status(500).json({ error: "Failed to add health comment" });
    }
};

export const updateHealthHandler = async (req, res) => {
    try {
        const { id } = req.params;
        const { mode, score, contentStatus, reportStatus, isExternal, comment } = req.body;
        const authorId = req.user?.userId;

        const now = new Date();
        const month = now.getMonth() + 1;
        const year = now.getFullYear();

        let finalScore = score;

        if (mode === 'auto') {
            // Logic to be handled by service if needed, for now setting default
            finalScore = score || 85;
        }

        // 1. Upsert Health Record
        const health = await prisma.clientHealth.upsert({
            where: {
                clientId_month_year: { clientId: id, month, year }
            },
            update: {
                score: finalScore,
                contentStatus,
                reportStatus,
                isExternal: !!isExternal
            },
            create: {
                clientId: id,
                month,
                year,
                score: finalScore,
                contentStatus,
                reportStatus,
                isExternal: !!isExternal
            }
        });

        // 2. Insert Comment if provided
        if (comment && comment.trim() !== '') {
            await prisma.agencyContext.create({
                data: {
                    clientId: id,
                    content: comment,
                    type: 'TEXT',
                    status: 'APPROVED',
                    metadata: {
                        authorId,
                        category: 'HEALTH_COMMENT'
                    }
                }
            });
        }

        // 3. Return updated client view
        const updatedClient = await getClients({ isArchived: 'all' }); // Get all to find our specific one
        const client = updatedClient.find(c => c.id === id);

        res.json(client);
    } catch (error) {
        console.error("Update health error:", error);
        res.status(500).json({ error: "Failed to update health configuration" });
    }
};

export const getLinks = async (req, res) => {
    try {
        const links = await getClientLinks(req.params.clientId);
        res.json(links);
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch links" });
    }
};

export const addLink = async (req, res) => {
    try {
        const { title, url } = req.body;
        if (!title || !url) return res.status(400).json({ error: "Faltan campos requeridos" });
        const link = await addClientLink(req.params.clientId, title, url);
        res.json(link);
    } catch (error) {
        if (error.message === "MAX_LINKS_REACHED") {
            return res.status(400).json({ error: "Límite de 5 enlaces alcanzado." });
        }
        res.status(500).json({ error: "Failed to create link" });
    }
};

export const deleteLink = async (req, res) => {
    try {
        await removeClientLink(req.params.linkId);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: "Failed to delete link" });
    }
};

export const getLogoProxy = async (req, res) => {
    try {
        const client = await prisma.client.findUnique({
            where: { id: req.params.clientId },
            select: { logoUrl: true }
        });

        if (!client || !client.logoUrl) return res.status(404).send("Logo no encontrado");

        if (client.logoUrl.includes('gcsPath=')) {
            const gcsPath = client.logoUrl.split('gcsPath=')[1]?.split('&')[0];
            if (gcsPath) {
                const decodedPath = decodeURIComponent(gcsPath);
                const bucketName = process.env.GCS_BUCKET_NAME || 'brainstudio-unstructured-v2';
                const credentialsJson = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
                const projectId = process.env.GOOGLE_CLOUD_PROJECT;
                const { Storage } = await import('@google-cloud/storage');
                const storage = new Storage({ projectId, credentials: JSON.parse(credentialsJson) });

                const file = storage.bucket(bucketName).file(decodedPath);
                const [metadata] = await file.getMetadata();

                res.setHeader('Content-Type', metadata.contentType || 'image/png');
                res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
                if (metadata.etag) res.setHeader('ETag', metadata.etag);

                return file.createReadStream().pipe(res);
            }
        }
        res.redirect(client.logoUrl);
    } catch (error) {
        console.error("[ClientLogo] Proxy error:", error);
        res.status(500).send("Error al cargar logo");
    }
};
