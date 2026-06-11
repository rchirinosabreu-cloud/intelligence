import express from 'express';
import prisma from '../../lib/prisma.js';
import * as boardService from '../../services/boardService.js';
import { getUploadSignedUrl, getSignedUrl, deleteFileFromGCS } from '../../services/storageService.js';
import * as cheerio from 'cheerio';
import axios from 'axios';

const router = express.Router({ mergeParams: true });

/**
 * GET /api/boards
 * List all boards, optionally filtered by clientId
 */
router.get('/', async (req, res) => {
    try {
        const { clientId } = req.query;
        const boards = await boardService.getBoards(clientId);
        res.json(boards);
    } catch (error) {
        console.error("[Boards API] Error listing boards:", error);
        res.status(500).json({ error: "Failed to list boards" });
    }
});

/**
 * GET /api/boards/:boardId
 */
router.get('/:boardId', async (req, res) => {
    try {
        const board = await boardService.getBoardById(req.params.boardId);
        if (!board) return res.status(404).json({ error: "Board not found" });
        res.json(board);
    } catch (error) {
        console.error("[Boards API] Error getting board:", error);
        res.status(500).json({ error: "Failed to get board" });
    }
});

/**
 * POST /api/boards
 * Create a new board (global or client-linked)
 */
router.post('/', async (req, res) => {
    try {
        const { name, clientId } = req.body;
        if (!name) return res.status(400).json({ error: "Name is required" });

        const board = await boardService.createBoard(clientId, name);
        res.status(201).json(board);
    } catch (error) {
        console.error("[Boards API] Error creating board:", error);
        res.status(500).json({ error: "Failed to create board" });
    }
});

/**
 * DELETE /api/boards/:boardId
 */
router.delete('/:boardId', async (req, res) => {
    try {
        await boardService.deleteBoard(req.params.boardId);
        res.json({ success: true });
    } catch (error) {
        console.error("[Boards API] Error deleting board:", error);
        res.status(500).json({ error: "Failed to delete board" });
    }
});

/**
 * GET /api/boards/:boardId/items
 */
router.get('/:boardId/items', async (req, res) => {
    try {
        const items = await boardService.getBoardItems(req.params.boardId);

        // Enrich items with fresh signed URLs for images
        const enrichedItems = await Promise.all(items.map(async (item) => {
            if (item.type === 'image' && item.assetUrl) {
                const url = await getSignedUrl(item.assetUrl);
                return { ...item, url };
            }
            return item;
        }));

        res.json(enrichedItems);
    } catch (error) {
        console.error("[Boards API] Error listing items:", error);
        res.status(500).json({ error: "Failed to list board items" });
    }
});

/**
 * POST /api/boards/:boardId/items
 */
router.post('/:boardId/items', async (req, res) => {
    try {
        const item = await boardService.createBoardItem(req.params.boardId, req.body);

        // If it's an image, include a fresh signed URL
        if (item.type === 'image' && item.assetUrl) {
            const url = await getSignedUrl(item.assetUrl);
            return res.status(201).json({ ...item, url });
        }

        res.status(201).json(item);
    } catch (error) {
        console.error("[Boards API] Error creating item:", error);
        res.status(500).json({ error: "Failed to create board item" });
    }
});

/**
 * PATCH /api/boards/:boardId/items/:itemId
 */
router.patch('/:boardId/items/:itemId', async (req, res) => {
    try {
        const item = await boardService.updateBoardItem(req.params.itemId, req.body);
        res.json(item);
    } catch (error) {
        console.error("[Boards API] Error updating item:", error);
        res.status(500).json({ error: "Failed to update item" });
    }
});

/**
 * DELETE /api/boards/:boardId/items/:itemId
 */
router.delete('/:boardId/items/:itemId', async (req, res) => {
    try {
        const item = await prisma.boardItem.findUnique({ where: { id: req.params.itemId } });
        if (item && item.type === 'image' && item.assetUrl) {
            await deleteFileFromGCS(item.assetUrl);
        }

        await boardService.deleteBoardItem(req.params.itemId);
        res.json({ success: true });
    } catch (error) {
        console.error("[Boards API] Error deleting item:", error);
        res.status(500).json({ error: "Failed to delete item" });
    }
});

/**
 * GET /api/boards/:boardId/storage/signed-url
 */
router.get('/:boardId/storage/signed-url', async (req, res) => {
    const { boardId } = req.params;
    const { fileName, fileType } = req.query;

    if (!fileName || !fileType) {
        return res.status(400).json({ error: "fileName and fileType are required" });
    }

    try {
        // We need the clientId if it exists to keep the structure.
        const board = await prisma.board.findUnique({ where: { id: boardId } });
        const clientId = board.clientId || 'global';

        const timestamp = Date.now();
        const gcsPath = `clients/${clientId}/moodboards/${boardId}/${timestamp}_${fileName}`;

        const bucketName = process.env.GCS_BUCKET_NAME || 'brainstudio-unstructured-v2';
        const { Storage } = await import('@google-cloud/storage');
        const credentialsJson = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
        const projectId = process.env.GOOGLE_CLOUD_PROJECT;
        const storage = new Storage({ projectId, credentials: JSON.parse(credentialsJson) });

        const bucket = storage.bucket(bucketName);
        const file = bucket.file(gcsPath);

        const [url] = await file.getSignedUrl({
            version: 'v4',
            action: 'write',
            expires: Date.now() + 15 * 60 * 1000, // 15 minutes
            contentType: fileType,
        });

        res.json({ url, gcsPath });
    } catch (error) {
        console.error("[Boards API] Error generating signed URL:", error);
        res.status(500).json({ error: "Failed to generate upload URL" });
    }
});

/**
 * POST /api/boards/unfurl
 */
router.post('/unfurl', async (req, res) => {
    let { url } = req.body;
    if (!url) return res.status(400).json({ error: "URL is required" });

    // Prepend https:// if missing
    if (!/^https?:\/\//i.test(url)) {
        url = `https://${url}`;
    }

    try {
        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
            },
            timeout: 10000
        });

        const $ = cheerio.load(response.data);

        const metadata = {
            title: $('meta[property="og:title"]').attr('content') ||
                   $('title').text() ||
                   new URL(url).hostname,
            description: $('meta[property="og:description"]').attr('content') ||
                         $('meta[name="description"]').attr('content') ||
                         '',
            image: $('meta[property="og:image"]').attr('content') ||
                   $('link[rel="apple-touch-icon"]').attr('href') ||
                   '',
            siteName: $('meta[property="og:site_name"]').attr('content') ||
                      new URL(url).hostname
        };

        if (metadata.image && !metadata.image.startsWith('http')) {
            const baseUrl = new URL(url);
            metadata.image = new URL(metadata.image, baseUrl.origin).href;
        }

        res.json(metadata);
    } catch (error) {
        console.warn(`[Unfurl] Failed to unfurl ${url}:`, error.message);

        let domain = 'Enlace';
        try {
            domain = new URL(url).hostname;
        } catch (e) {
            // If even URL parsing fails
        }

        res.json({
            title: domain,
            description: '',
            image: '',
            siteName: domain
        });
    }
});

export default router;
