import prisma from '../lib/prisma.js';
import { getClients, createClient, getClientLinks, addClientLink, removeClientLink } from '../services/clientService.js';
import { fetchClientHealth } from '../services/healthService.js';

export const listClients = async (req, res) => {
    try {
        const clients = await getClients();
        res.json(clients);
    } catch (error) {
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
        res.json(client);
    } catch (error) {
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
