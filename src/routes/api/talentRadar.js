import express from 'express';
import prisma from '../../lib/prisma.js';
import { classifyTaskWithAI } from '../../services/aiService.js';
import { uploadAvatar, deleteFileFromGCS, getClientFileStream } from '../../services/storageService.js';
import multer from 'multer';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';

dotenv.config();

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

const MODEL_NAME = process.env.GEMINI_MODEL || "gemini-2.0-flash";

/**
 * Radar de Talento: Global Summary
 * GET /api/talent-radar/summary
 */
router.get('/summary', async (req, res) => {
    // RBAC Check: Only ADMIN or PM (role check logic depends on user role string)
    if (req.user?.role !== 'ADMIN' && req.user?.role !== 'PM') {
        return res.status(403).json({ error: "No tienes permisos para acceder al Radar de Talento" });
    }

    try {
        const { month, year } = req.query;

        // ETag Generation for Summary (Based on Month/Year and last task completion)
        const lastTask = await prisma.task.findFirst({
            orderBy: { updatedAt: 'desc' },
            select: { updatedAt: true }
        });
        const etag = `W/"radar-summary-${month}-${year}-${lastTask?.updatedAt?.getTime() || 0}"`;

        if (req.headers['if-none-match'] === etag) {
            return res.status(304).end();
        }
        res.setHeader('ETag', etag);
        res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
        const targetMonth = month ? parseInt(month) : new Date().getMonth() + 1;
        const targetYear = year ? parseInt(year) : new Date().getFullYear();

        // 1. Live Status: Find active tasks (EN_CURSO) for each team member
        const teamMembers = await prisma.teamMember.findMany({
            where: { isActive: true },
            select: {
                id: true,
                name: true,
                avatarUrl: true,
                role: true,
                nativeTasks: {
                    where: { status: 'EN_CURSO' },
                    orderBy: { startedAt: 'desc' },
                    take: 1,
                    select: {
                        id: true,
                        title: true,
                        startedAt: true,
                        client: { select: { name: true } }
                    }
                }
            }
        });

        // 2. Heatmap: Aggregate aiCategory metrics for the selected month
        // We filter by completedAt to ensure we measure actual work done
        const startDate = new Date(targetYear, targetMonth - 1, 1);
        const endDate = new Date(targetYear, targetMonth, 0, 23, 59, 59);

        const tasks = await prisma.task.findMany({
            where: {
                completedAt: { gte: startDate, lte: endDate },
                aiCategory: { not: null }
            },
            select: { aiCategory: true, aiComplexity: true }
        });

        const categoryStats = tasks.reduce((acc, task) => {
            acc[task.aiCategory] = (acc[task.aiCategory] || 0) + 1;
            return acc;
        }, {});

        // 3. Nine-Box Data: Complexity vs Quality
        // X = Avg Complexity (1-3), Y = Quality (Avg Return Count)
        const teamPerformance = await prisma.teamMember.findMany({
            where: { isActive: true },
            select: {
                id: true,
                name: true,
                avatarUrl: true,
                nativeTasks: {
                    where: {
                        completedAt: { gte: startDate, lte: endDate }
                    },
                    select: {
                        aiComplexity: true,
                        returnCount: true
                    }
                }
            }
        });

        const complexityMap = { 'BAJA': 1, 'MEDIA': 2, 'ALTA': 3 };

        const nineBox = teamPerformance.map(member => {
            const completedCount = member.nativeTasks.length;
            if (completedCount === 0) return { id: member.id, name: member.name, x: 0, y: 0, count: 0 };

            const totalComplexity = member.nativeTasks.reduce((sum, t) => sum + (complexityMap[t.aiComplexity] || 1), 0);
            const avgComplexity = totalComplexity / completedCount;
            const avgReturns = member.nativeTasks.reduce((sum, t) => sum + (t.returnCount || 0), 0) / completedCount;

            return {
                id: member.id,
                name: member.name,
                avatarUrl: member.avatarUrl,
                x: avgComplexity, // complexity scale 1-3
                y: avgReturns, // lower is better
                count: completedCount
            };
        });

        res.json({
            liveStatus: teamMembers,
            heatmap: categoryStats,
            nineBox
        });

    } catch (error) {
        console.error("[TalentRadar] Summary failed:", error);
        return res.status(500).json({ error: "Internal server error", details: error.message });
    }
});

/**
 * Radar de Talento: Individual Member Details
 * GET /api/talent-radar/member/:memberId
 */
router.get('/member/:memberId', async (req, res) => {
    if (req.user?.role !== 'ADMIN' && req.user?.role !== 'PM') {
        return res.status(403).json({ error: "Acceso denegado" });
    }

    const { memberId } = req.params;
    const { month, year } = req.query;
    const targetMonth = month ? parseInt(month) : new Date().getMonth() + 1;
    const targetYear = year ? parseInt(year) : new Date().getFullYear();

    try {
        // ETag Generation for Member Detail
        const lastMemberUpdate = await prisma.task.findFirst({
            where: { assigneeId: memberId },
            orderBy: { updatedAt: 'desc' },
            select: { updatedAt: true }
        });
        const etag = `W/"radar-member-${memberId}-${month}-${year}-${lastMemberUpdate?.updatedAt?.getTime() || 0}"`;

        if (req.headers['if-none-match'] === etag) {
            return res.status(304).end();
        }
        res.setHeader('ETag', etag);
        res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');

        const startDate = new Date(targetYear, targetMonth - 1, 1);
        const endDate = new Date(targetYear, targetMonth, 0, 23, 59, 59);

        const member = await prisma.teamMember.findUnique({
            where: { id: memberId },
            include: {
                nativeTasks: {
                    where: {
                        completedAt: { gte: startDate, lte: endDate }
                    },
                    include: {
                        client: { select: { name: true } }
                    },
                    orderBy: { completedAt: 'desc' }
                }
            }
        });

        if (!member) return res.status(404).json({ error: "Miembro no encontrado" });

        res.json(member);
    } catch (error) {
        console.error("[TalentRadar] Member details failed:", error);
        return res.status(500).json({ error: "Internal server error", details: error.message });
    }
});

/**
 * Radar de Talento: AI Insights for 1-on-1s
 * POST /api/talent-radar/member/:memberId/ai-insights
 */
router.post('/member/:memberId/ai-insights', async (req, res) => {
    if (req.user?.role !== 'ADMIN' && req.user?.role !== 'PM') {
        return res.status(403).json({ error: "Acceso denegado" });
    }

    const { memberId } = req.params;
    const { month, year } = req.body;
    const targetMonth = month ? parseInt(month) : new Date().getMonth() + 1;
    const targetYear = year ? parseInt(year) : new Date().getFullYear();

    try {
        const startDate = new Date(targetYear, targetMonth - 1, 1);
        const endDate = new Date(targetYear, targetMonth, 0, 23, 59, 59);

        // 0. Fetch member details
        const member = await prisma.teamMember.findUnique({
            where: { id: memberId },
            select: { name: true }
        });

        if (!member) return res.status(404).json({ error: "Miembro no encontrado" });

        // 1. Fetch ALL tasks for metrics and returned ones for comments (STRICTLY FILTERED)
        const allTasks = await prisma.task.findMany({
            where: {
                assigneeId: memberId,
                completedAt: { gte: startDate, lte: endDate }
            },
            select: { title: true, comments: true, aiCategory: true, aiComplexity: true, returnCount: true }
        });

        if (allTasks.length === 0) {
            return res.json({ insight: "Este miembro no tiene actividad registrada para este periodo." });
        }

        const returnedTasks = allTasks.filter(t => (t.returnCount || 0) > 0);

        // Initialize AI
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) return res.status(500).json({ error: "GEMINI_API_KEY not configured" });
        const genAI = new GoogleGenAI({ apiKey });

        // Aggregate metrics for dynamic analysis
        const categoryStats = allTasks.reduce((acc, t) => {
            if (t.aiCategory) acc[t.aiCategory] = (acc[t.aiCategory] || 0) + 1;
            return acc;
        }, {});

        const totalReturns = allTasks.reduce((sum, t) => sum + (t.returnCount || 0), 0);
        const avgComplexity = allTasks.reduce((sum, t) => {
            const map = { 'BAJA': 1, 'MEDIA': 2, 'ALTA': 3 };
            return sum + (map[t.aiComplexity] || 1);
        }, 0) / allTasks.length;

        const historyContext = returnedTasks.map(t => `- Tarea: ${t.title}\n  Comentario Devolución: ${t.comments}`).join('\n\n');

        const prompt = `Rol: Director de Operaciones (COO) de Brainstudio.
Contexto: Evaluación de desempeño mensual para un miembro del equipo.
Objetivo: Generar feedback estratégico, humano y accionable para un 1-on-1.

DATOS DE RENDIMIENTO REAL (FILTRADOS POR MIEMBRO):
- Nombre del Colaborador: ${member?.name || 'Miembro del equipo'}
- Tareas Finalizadas: ${allTasks.length}
- Mix de Trabajo: ${JSON.stringify(categoryStats)}
- Nivel de Complejidad Promedio: ${avgComplexity.toFixed(2)} / 3.00
- Frecuencia de Devoluciones: ${totalReturns} totales (${((totalReturns / allTasks.length) * 100).toFixed(1)}% tasa de retrabajo)

CONTEXTO DE DEVOLUCIONES:
${historyContext || "Historial impecable: 0 devoluciones este mes."}

TAREA DE ANÁLISIS V2:
1. IDENTIFICA PATRONES: No resumas los números. Analiza la relación entre la complejidad y la calidad. ¿Las devoluciones ocurren en tareas simples (descuido) o complejas (falta de formación/guía)?
2. EVALUACIÓN ESTRATÉGICA: Clasifica el perfil actual según los datos (ej: Ejecutor Eficiente, Talento en Desarrollo, Consultor Estratégico, o Cuello de Botella).
3. RECOMENDACIÓN DE DESARROLLO: Propón una acción concreta para el próximo mes (ej: "Delegar tareas administrativas para explotar su lado estratégico" o "Implementar checklist de autocrítica antes de entregar").
4. TONO: Ejecutivo de alto nivel, pero cercano. Usa un lenguaje que empodere pero que sea crudo con la realidad de los datos.

Responde directamente con el análisis (máximo 2 párrafos). NO incluyas introducciones como "Aquí tienes el análisis...".`;

        const result = await genAI.models.generateContent({
            model: MODEL_NAME,
            contents: [{ role: 'user', parts: [{ text: prompt }] }]
        });
        const insight = result.response.text();

        res.json({ insight });

    } catch (error) {
        console.error("[TalentRadar] AI Insight failed:", error);
        return res.status(500).json({ error: "Error generando insights con IA", details: error.message });
    }
});

/**
 * Radar de Talento: Update Member Avatar
 * PUT /api/talent-radar/member/:memberId/avatar
 * RESTRICCIÓN JERÁRQUICA:
 * - ADMIN: Puede subir para CUALQUIER :memberId.
 * - OTROS: Solo pueden subir para sí mismos (req.user.userId === :memberId o userId link).
 */
router.put('/member/:memberId/avatar', upload.single('avatar'), async (req, res) => {
    const { memberId } = req.params;
    const currentUserId = req.user?.userId;
    const isAdmin = req.user?.role === 'ADMIN';

    const file = req.file;

    if (!file) {
        return res.status(400).json({ error: "No se proporcionó ningún archivo de imagen" });
    }

    try {
        // 1. Resolve Profile: Check if memberId is a TeamMember or User ID
        let teamMember = await prisma.teamMember.findUnique({
            where: { id: memberId },
            select: { id: true, avatarUrl: true, userId: true }
        });

        let userProfile = null;

        if (!teamMember) {
            userProfile = await prisma.user.findUnique({
                where: { id: memberId },
                select: { id: true, avatarUrl: true }
            });

            if (!userProfile) {
                return res.status(404).json({ error: "Perfil no encontrado." });
            }

            // If it's a User, try to find the linked TeamMember for sync
            teamMember = await prisma.teamMember.findFirst({
                where: { userId: userProfile.id },
                select: { id: true, avatarUrl: true, userId: true }
            });
        } else if (teamMember.userId) {
            // If it's a TeamMember, find the linked User for sync
            userProfile = await prisma.user.findUnique({
                where: { id: teamMember.userId },
                select: { id: true, avatarUrl: true }
            });
        }

        // 2. RBAC CHECK (Jerárquico)
        // - ADMIN: Full power for ANY memberId.
        // - USER: ONLY their own profile (match by User ID).
        // Note: memberId from params is used as the target.
        const isTargetSelf = currentUserId && (currentUserId === memberId || currentUserId === userProfile?.id || currentUserId === teamMember?.userId);
        const isAuthorized = isAdmin || isTargetSelf;

        if (!isAuthorized) {
            console.warn(`[Security] Forbidden avatar upload by ${req.user?.email} (ID: ${currentUserId}) for target ${memberId}`);
            return res.status(403).json({ error: "No tienes permisos para realizar esta acción." });
        }

        console.log(`[TalentRadar] Processing avatar upload for target ${memberId} (Target ID consistent: ${teamMember?.id || userProfile?.id})`);

        const currentAvatarUrl = teamMember?.avatarUrl || userProfile?.avatarUrl;

        // 3. GCS Hygiene: Delete old avatar if it exists in the /avatars folder
        if (currentAvatarUrl && currentAvatarUrl.includes('gcsPath=avatars')) {
            try {
                // Extract gcsPath from the proxy URL query string
                const gcsPath = currentAvatarUrl.split('gcsPath=')[1]?.split('&')[0];
                if (gcsPath) {
                    const decodedPath = decodeURIComponent(gcsPath);
                    console.log(`[GCS Hygiene] Deleting old asset: ${decodedPath}`);
                    await deleteFileFromGCS(decodedPath);
                }
            } catch (err) {
                console.error("[GCS Hygiene] Non-critical error deleting old asset:", err.message);
            }
        }

        // 4. Upload new file to GCS
        // Use the TeamMember ID if available for folder consistency, otherwise User ID
        const targetGcsId = teamMember?.id || userProfile?.id;
        // Use the multer provided mimetype to ensure correct GCS contentType
        // This is explicitly passed down to storageService.js for metadata header
        const uploadResult = await uploadAvatar(file, targetGcsId);

        // 5. Construct the final proxy URL
        const avatarUrl = `/api/talent-radar/member/${targetGcsId}/avatar-image?gcsPath=${encodeURIComponent(uploadResult.gcsPath)}`;

        // 6. Synchronized Update in Database
        await prisma.$transaction(async (tx) => {
            if (teamMember) {
                await tx.teamMember.update({
                    where: { id: teamMember.id },
                    data: { avatarUrl }
                });
            }
            if (userProfile) {
                await tx.user.update({
                    where: { id: userProfile.id },
                    data: { avatarUrl }
                });
            }
        });

        console.log(`[TalentRadar] Avatar updated successfully for ID: ${targetGcsId}`);
        return res.json({ success: true, avatarUrl });

    } catch (error) {
        console.error("[TalentRadar] Avatar upload failed:", error);
        return res.status(500).json({ error: "Error interno al procesar el avatar.", details: error.message });
    }
});

/**
 * Radar de Talento: Proxy for Avatar Image
 * GET /api/talent-radar/member/:memberId/avatar-image
 * PERMITE ACCESO SIN TOKEN (para poder usarse en <img> tags directamente)
 */
router.get('/member/:memberId/avatar-image', async (req, res) => {
    const { gcsPath } = req.query;

    if (!gcsPath) {
        return res.status(400).send("Falta gcsPath");
    }

    try {
        const decodedPath = decodeURIComponent(gcsPath);

        // Use storage SDK to get metadata (to set correct Content-Type)
        const bucketName = process.env.GCS_BUCKET_NAME || 'brainstudio-unstructured-v2';
        const credentialsJson = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
        const projectId = process.env.GOOGLE_CLOUD_PROJECT;
        const { Storage } = await import('@google-cloud/storage');
        const storage = new Storage({ projectId, credentials: JSON.parse(credentialsJson) });

        const file = storage.bucket(bucketName).file(decodedPath);
        const [metadata] = await file.getMetadata();

        // Set Headers (Ensuring correct Content-Type from metadata)
        const contentType = metadata.contentType || 'image/jpeg';
        console.log(`[TalentRadar] Proxying avatar with Content-Type: ${contentType}`);
        res.setHeader('Content-Type', contentType);

        // Performance Optimization: Cache-Control for static assets
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        // ETag support is handled automatically by Express when sending file streams if configured,
        // but we can also use the GCS generation/md5Hash as ETag.
        if (metadata.etag) {
            res.setHeader('ETag', metadata.etag);
        }

        const stream = file.createReadStream();
        stream.on('error', (err) => {
            console.error("[TalentRadar] Avatar proxy stream error:", err.message);
            if (!res.headersSent) res.status(404).send("Imagen no encontrada");
        });

        stream.pipe(res);
    } catch (error) {
        console.error("[TalentRadar] Avatar proxy error:", error);
        if (!res.headersSent) res.status(500).send("Error al cargar imagen");
    }
});

export default router;
