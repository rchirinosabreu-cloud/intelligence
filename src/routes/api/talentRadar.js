import express from 'express';
import prisma from '../../lib/prisma.js';
import { classifyTaskWithAI } from '../../services/aiService.js';
import { VertexAI } from '@google-cloud/vertexai';
import dotenv from 'dotenv';

dotenv.config();

const router = express.Router();

const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT || 'brainstudio-intelligence';
const LOCATION = 'global';
const MODEL_NAME = process.env.GEMINI_MODEL || "gemini-2.5-pro";

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

        // 3. Nine-Box Data: Velocity vs Quality
        // X = Velocity (Avg time in hours), Y = Quality (Return Count)
        const teamPerformance = await prisma.teamMember.findMany({
            where: { isActive: true },
            select: {
                id: true,
                name: true,
                nativeTasks: {
                    where: {
                        completedAt: { gte: startDate, lte: endDate },
                        startedAt: { not: null }
                    },
                    select: {
                        startedAt: true,
                        completedAt: true,
                        returnCount: true
                    }
                }
            }
        });

        const nineBox = teamPerformance.map(member => {
            const completedCount = member.nativeTasks.length;
            if (completedCount === 0) return { id: member.id, name: member.name, x: 0, y: 0, count: 0 };

            const totalTimeMs = member.nativeTasks.reduce((sum, t) => sum + (t.completedAt - t.startedAt), 0);
            const avgHours = (totalTimeMs / (1000 * 60 * 60)) / completedCount;
            const avgReturns = member.nativeTasks.reduce((sum, t) => sum + (t.returnCount || 0), 0) / completedCount;

            return {
                id: member.id,
                name: member.name,
                x: avgHours, // Lower is faster (closer to Y axis)
                y: avgReturns, // Lower is higher quality (closer to X axis)
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
        res.status(500).json({ error: "Internal server error" });
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
        res.status(500).json({ error: "Internal server error" });
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

        // Fetch tasks with comments (specially returned ones)
        const tasks = await prisma.task.findMany({
            where: {
                assigneeId: memberId,
                completedAt: { gte: startDate, lte: endDate },
                comments: { contains: '[DEVOLUCIÓN' }
            },
            select: { title: true, comments: true, aiCategory: true, aiComplexity: true }
        });

        if (tasks.length === 0) {
            return res.json({ insight: "Este miembro no ha tenido devoluciones este mes. ¡Excelente desempeño en calidad!" });
        }

        // Initialize Vertex AI
        const credentialsJson = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
        if (!credentialsJson) return res.status(500).json({ error: "Vertex AI not configured" });

        const credentials = JSON.parse(credentialsJson);
        const vertexAI = new VertexAI({
            project: PROJECT_ID,
            location: LOCATION,
            apiEndpoint: 'aiplatform.googleapis.com',
            googleAuthOptions: { credentials }
        });

        const model = vertexAI.getGenerativeModel({ model: MODEL_NAME });

        const historyContext = tasks.map(t => `- Tarea: ${t.title}\n  Comentario Devolución: ${t.comments}`).join('\n\n');

        const prompt = `Actúa como el Director de Operaciones de Brainstudio.
Analiza los siguientes comentarios de tareas devueltas para un miembro del equipo durante este mes.
Genera un párrafo de "Feedback Ejecutivo" (en español) conciso, propositivo y profesional para un 1-on-1.
No seas genérico; encuentra patrones si los hay (ej: falta de atención al detalle, errores en copy, etc.).

DATOS DE DEVOLUCIONES:
${historyContext}

Responde directamente con el párrafo de feedback.`;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const insight = response.candidates[0].content.parts[0].text;

        res.json({ insight });

    } catch (error) {
        console.error("[TalentRadar] AI Insight failed:", error);
        res.status(500).json({ error: "Error generando insights con IA" });
    }
});

export default router;
