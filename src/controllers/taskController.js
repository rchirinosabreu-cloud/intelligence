import prisma from '../lib/prisma.js';
import DOMPurify from 'isomorphic-dompurify';

const sanitizeHTML = (html) => {
    if (!html) return '';
    return DOMPurify.sanitize(html, {
        ALLOWED_TAGS: ['p', 'strong', 'em', 'u', 'h1', 'h2', 'ul', 'ol', 'li', 'br', 'span', 'a'],
        ALLOWED_ATTR: ['href', 'target', 'class', 'data-type', 'data-id', 'data-label', 'data-mention-id']
    });
};

import { getDashboardMetrics, getQualityStreak, getCompletedTasks, getTasks, createTask, updateTask, auditAndDeleteTask, toggleTaskFollow, checkIsFollowing } from '../services/nativeTaskService.js';
import { getClientTasks, createClientTask, updateTaskStatus as updateClientTaskStatus, deleteTask } from '../services/clientTaskService.js';
import { uploadToS3, getFromS3Stream } from '../services/s3Service.js';
import { createNotification, processMentionsAndNotifications } from '../services/notificationService.js';
import { canDeleteTask, canUpdateTask, isManagerRole, pickAllowedTaskUpdates } from '../config/security.js';

const COMMENT_MAX_LENGTH = 10_000;
const taskCommentAuthorSelect = {
    id: true,
    name: true,
    avatarUrl: true,
    role: true
};

const extractManagedS3Key = (rawUrl) => {
    const bucketName = process.env.AWS_S3_BUCKET_NAME || 'chat-evidence';
    try {
        const parsed = new URL(rawUrl);
        const parts = parsed.pathname.split('/').filter(Boolean);
        const bucketIndex = parts.indexOf(bucketName);
        if (bucketIndex === -1 || parts.length <= bucketIndex + 1) return null;
        return parts.slice(bucketIndex + 1).join('/');
    } catch {
        return null;
    }
};

const safeDownloadName = (name = 'adjunto_tarea') => String(name)
    .replace(/[\r\n"\\/]/g, '_')
    .slice(0, 180) || 'adjunto_tarea';

export const getMetrics = async (req, res) => {
    try {
        const metrics = await getDashboardMetrics();
        res.json(metrics);
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch metrics", details: error.message });
    }
};

export const getStreak = async (req, res) => {
    try {
        const streak = await getQualityStreak();
        res.json(streak);
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch quality streak", details: error.message });
    }
};

export const getCompleted = async (req, res) => {
    try {
        const tasks = await getCompletedTasks(req.query.date);
        res.json(tasks);
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch completed tasks", details: error.message });
    }
};

export const getAllTasks = async (req, res) => {
    try {
        const tasks = await getTasks(req.query.clientId);
        res.json(tasks);
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch native tasks", details: error.message });
    }
};

export const createNewTask = async (req, res) => {
    try {
        const { followOnCreate, initial_references, initial_inputs, initial_insumos, initial_comments, ...rest } = req.body;
        const taskData = {
            ...rest,
            creatorId: req.user.userId,
            followOnCreate,
            initial_references: initial_references || [],
            initial_inputs: initial_inputs || [],
            initial_insumos: initial_insumos || [],
            initial_comments: initial_comments || []
        };

        if (!taskData.title || !taskData.clientId) {
            return res.status(400).json({ error: "Missing required fields (title, clientId)" });
        }
        const task = await createTask(taskData);

        if (task.assigneeId && (task.isPriority || task.isSpecial)) {
            try {
                const assigneeTeamMember = await prisma.teamMember.findUnique({
                    where: { id: task.assigneeId },
                    select: { email: true }
                });

                if (assigneeTeamMember && assigneeTeamMember.email) {
                    const assigneeUser = await prisma.user.findUnique({
                        where: { email: assigneeTeamMember.email.trim().toLowerCase() },
                        select: { id: true }
                    });

                    if (assigneeUser && assigneeUser.id !== req.user.userId) {
                        const message = task.isPriority && task.isSpecial
                            ? `Se te ha asignado una tarea PRIORITARIA y ESPECIAL: ${task.title}`
                            : task.isPriority ? `Se te ha asignado una tarea PRIORITARIA: ${task.title}`
                            : `Se te ha asignado una tarea ESPECIAL: ${task.title}`;

                        await createNotification({
                            userId: assigneeUser.id,
                            message,
                            type: 'TASK_ASSIGNED',
                            relatedId: task.id
                        });
                    }
                }
            } catch (err) {
                console.error("Error sending task notification:", err);
            }
        }
        res.status(201).json(task);
    } catch (error) {
        res.status(500).json({ error: "Failed to create task", details: error.message });
    }
};

export const updateExistingTask = async (req, res) => {
    try {
        if ('sortOrder' in req.body) {
            const role = req.user?.role;
            if (role !== 'ADMIN' && role !== 'PROJECT_MANAGER' && role !== 'PM') {
                return res.status(403).json({ error: "No tienes permisos de Project Manager o Administrador para reordenar tareas" });
            }
        }
        const task = await prisma.task.findUnique({
            where: { id: req.params.taskId },
            select: {
                creatorId: true,
                assignee: { select: { userId: true } }
            }
        });
        if (!task) return res.status(404).json({ error: 'Task not found' });
        if (!canUpdateTask(req.user, task)) {
            return res.status(403).json({ error: 'No tienes permisos para actualizar esta tarea' });
        }

        const updateData = pickAllowedTaskUpdates(req.body);
        const updatedTask = await updateTask(req.params.taskId, updateData, req.user?.userId);
        res.json(updatedTask);
    } catch (error) {
        res.status(500).json({ error: "Failed to update task", details: error.message });
    }
};

export const reorderTasks = async (req, res) => {
    try {
        const role = req.user?.role;
        if (role !== 'ADMIN' && role !== 'PROJECT_MANAGER' && role !== 'PM') {
            return res.status(403).json({ error: "No tienes permisos de Project Manager o Administrador para reordenar tareas" });
        }

        const { reorderList } = req.body; // Array of { id: string, sortOrder: number }
        if (!Array.isArray(reorderList)) {
            return res.status(400).json({ error: "reorderList must be an array" });
        }

        // Run updates inside a transaction
        await prisma.$transaction(
            reorderList.map(item =>
                prisma.task.update({
                    where: { id: item.id },
                    data: { sortOrder: item.sortOrder }
                })
            )
        );

        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: "Failed to reorder tasks", details: error.message });
    }
};

export const deleteExistingTask = async (req, res) => {
    try {
        const { reason } = req.body;
        if (!reason) return res.status(400).json({ error: "Missing deletion reason" });
        const task = await prisma.task.findUnique({
            where: { id: req.params.taskId },
            select: {
                creatorId: true,
                assignee: { select: { userId: true } }
            }
        });
        if (!task) return res.status(404).json({ error: 'Task not found' });
        if (!canDeleteTask(req.user, task)) {
            return res.status(403).json({ error: 'No tienes permisos para eliminar esta tarea' });
        }
        await auditAndDeleteTask(req.params.taskId, reason, req.user?.userId);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: "Failed to delete task", details: error.message });
    }
};

export const toggleFollow = async (req, res) => {
    try {
        const isFollowing = await toggleTaskFollow(req.params.taskId, req.user.userId);
        res.json({ isFollowing });
    } catch (error) {
        res.status(500).json({ error: "Failed to toggle follow status" });
    }
};

export const getFollowStatus = async (req, res) => {
    try {
        const isFollowing = await checkIsFollowing(req.params.taskId, req.user.userId);
        res.json({ isFollowing });
    } catch (error) {
        res.status(500).json({ error: "Failed to get follow status" });
    }
};

const streamTaskAttachment = async (req, res, disposition) => {
    try {
        const { taskId, attachmentId } = req.params;
        const attachment = await prisma.taskAttachment.findFirst({
            where: { id: attachmentId, taskId }
        });
        if (!attachment) return res.status(404).json({ error: 'Attachment not found' });

        const key = extractManagedS3Key(attachment.url);
        if (!key) return res.status(404).json({ error: 'Managed attachment not found' });

        const object = await getFromS3Stream(key);
        const fileName = safeDownloadName(attachment.name || key.split('/').pop());
        res.setHeader('Content-Type', object.ContentType || 'application/octet-stream');
        res.setHeader('Content-Disposition', `${disposition}; filename="${fileName}"`);
        res.setHeader('Cache-Control', 'private, max-age=300');
        object.Body.on('error', (error) => {
            console.error('[TaskAttachment] Stream failed:', error);
            if (!res.headersSent) res.status(500).json({ error: 'Failed to stream attachment' });
        });
        return object.Body.pipe(res);
    } catch (error) {
        console.error('[TaskAttachment] Proxy failed:', error);
        if (!res.headersSent) return res.status(500).json({ error: 'Failed to load attachment' });
    }
};

export const getTaskAttachmentFileProxy = (req, res) => streamTaskAttachment(req, res, 'inline');
export const getTaskAttachmentDownloadProxy = (req, res) => streamTaskAttachment(req, res, 'attachment');

export const getCommentFileProxy = async (req, res) => {
    try {
        const { taskId, commentId } = req.params;
        const comment = await prisma.taskComment.findUnique({
            where: { id: commentId },
            select: { content: true, taskId: true }
        });

        if (!comment || comment.taskId !== taskId) {
            return res.status(404).json({ error: "Comment not found or doesn't belong to this task" });
        }

        const bucketName = process.env.AWS_S3_BUCKET_NAME || "chat-evidence";
        let key = null;

        // 1. Structured DB lookup first (TaskAttachment relation)
        const attachment = await prisma.taskAttachment.findFirst({
            where: { commentId }
        });

        if (attachment) {
            try {
                if (attachment.url.includes(bucketName)) {
                    const url = new URL(attachment.url);
                    const parts = url.pathname.split('/');
                    const bucketIndex = parts.indexOf(bucketName);
                    if (bucketIndex !== -1 && parts.length > bucketIndex + 1) {
                        key = parts.slice(bucketIndex + 1).join('/');
                    }
                }
            } catch (e) {}

            if (!key) {
                const regex = new RegExp(`${bucketName}/([^\\s\\n?]+)`);
                const match = attachment.url.match(regex);
                if (match) key = match[1].trim();
            }
        }

        // 2. Text parsing fallback for historic records
        if (!key) {
            try {
                // Find the URL within the content (it's usually at the end)
                const lines = comment.content.split('\n');
                const lastLine = lines[lines.length - 1].trim();

                if (lastLine.includes(bucketName)) {
                    const url = new URL(lastLine);
                    // Pathname usually is /{bucket}/{key}
                    const parts = url.pathname.split('/');
                    const bucketIndex = parts.indexOf(bucketName);
                    if (bucketIndex !== -1 && parts.length > bucketIndex + 1) {
                        key = parts.slice(bucketIndex + 1).join('/');
                    }
                }
            } catch (e) {
                console.error("URL parsing failed, falling back to regex", e);
            }

            if (!key) {
                const regex = new RegExp(`${bucketName}/([^\\s\\n?]+)`);
                const match = comment.content.match(regex);
                if (match) key = match[1].trim();
            }
        }

        if (!key) return res.status(404).json({ error: "No storage key found in comment" });

        try {
            const s3Response = await getFromS3Stream(key);

            res.setHeader('Content-Type', s3Response.ContentType || 'image/jpeg');
            res.setHeader('Content-Disposition', 'inline');

            // Attach error listener to stream to prevent crashes on network issues
            s3Response.Body.on('error', (err) => {
                console.error("S3 Stream Error:", err);
                if (!res.headersSent) {
                    res.status(500).json({ error: "Stream error" });
                }
            });

            s3Response.Body.pipe(res);
        } catch (s3Error) {
            if (s3Error.name === 'NoSuchKey') {
                return res.status(404).json({ error: "Resource not found in storage (NoSuchKey)" });
            }
            throw s3Error;
        }
    } catch (error) {
        console.error("Proxy error:", error);
        if (!res.headersSent) {
            res.status(500).json({ error: "Failed to proxy file", details: error.message });
        }
    }
};

export const getCommentFileDownloadProxy = async (req, res) => {
    try {
        const { taskId, commentId } = req.params;
        const comment = await prisma.taskComment.findUnique({
            where: { id: commentId },
            select: { content: true, taskId: true }
        });

        if (!comment || comment.taskId !== taskId) {
            return res.status(404).json({ error: "Comment not found or doesn't belong to this task" });
        }

        const bucketName = process.env.AWS_S3_BUCKET_NAME || "chat-evidence";
        let key = null;
        let originalName = null;

        // 1. Structured DB lookup first (TaskAttachment relation)
        const attachment = await prisma.taskAttachment.findFirst({
            where: { commentId }
        });

        if (attachment) {
            originalName = attachment.name;
            try {
                if (attachment.url.includes(bucketName)) {
                    const url = new URL(attachment.url);
                    const parts = url.pathname.split('/');
                    const bucketIndex = parts.indexOf(bucketName);
                    if (bucketIndex !== -1 && parts.length > bucketIndex + 1) {
                        key = parts.slice(bucketIndex + 1).join('/');
                    }
                }
            } catch (e) {}

            if (!key) {
                const regex = new RegExp(`${bucketName}/([^\\s\\n?]+)`);
                const match = attachment.url.match(regex);
                if (match) key = match[1].trim();
            }
        }

        // 2. Text parsing fallback for historic records
        if (!key) {
            try {
                const lines = comment.content.split('\n');
                const lastLine = lines[lines.length - 1].trim();
                if (lastLine.includes(bucketName)) {
                    const url = new URL(lastLine);
                    const parts = url.pathname.split('/');
                    const bucketIndex = parts.indexOf(bucketName);
                    if (bucketIndex !== -1 && parts.length > bucketIndex + 1) {
                        key = parts.slice(bucketIndex + 1).join('/');
                    }
                }
            } catch (e) {}

            if (!key) {
                const regex = new RegExp(`${bucketName}/([^\\s\\n?]+)`);
                const match = comment.content.match(regex);
                if (match) key = match[1].trim();
            }
        }

        if (!key) return res.status(404).json({ error: "No storage key found in comment" });
        const fileName = originalName || key.split('/').pop() || 'adjunto_tarea.jpg';

        try {
            const s3Response = await getFromS3Stream(key);

            res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');
            res.setHeader('Content-Type', 'application/octet-stream');
            res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

            s3Response.Body.on('error', (err) => {
                console.error("S3 Download Stream Error:", err);
                if (!res.headersSent) {
                    res.status(500).json({ error: "Stream error during download" });
                }
            });

            s3Response.Body.pipe(res);
        } catch (s3Error) {
            if (s3Error.name === 'NoSuchKey') {
                return res.status(404).json({ error: "File not found in storage (NoSuchKey)" });
            }
            throw s3Error;
        }
    } catch (error) {
        console.error("Download proxy error:", error);
        if (!res.headersSent) {
            res.status(500).json({ error: "Failed to download file", details: error.message });
        }
    }
};

export const addTaskComment = async (req, res) => {
    try {
        const content = req.body?.content;
        const { taskId } = req.params;
        const authorId = req.user.userId;

        if (String(content || '').length > COMMENT_MAX_LENGTH) {
            return res.status(400).json({ error: `El comentario no puede superar ${COMMENT_MAX_LENGTH} caracteres` });
        }

        // Allow empty content if a file is present
        if (!content?.trim() && !req.file) {
            return res.status(400).json({ error: "Content or file is required" });
        }

        let finalContent = content || "";
        if (finalContent) {
            finalContent = sanitizeHTML(finalContent);
        }
        let publicUrl = null;

        if (req.file) {
            const task = await prisma.task.findUnique({
                where: { id: taskId },
                select: { clientId: true, client: { select: { name: true } } }
            });

            if (!task) return res.status(404).json({ error: "Task not found" });

            // Structure path: clientes/{client_id}/tareas/{task_id}/imagenes
            const folderPrefix = `clientes/${task.clientId}/tareas/${taskId}/imagenes`;

            const uploadResult = await uploadToS3(req.file, folderPrefix);
            publicUrl = uploadResult.url;
        }

        const comment = await prisma.$transaction(async (tx) => {
            const createdComment = await tx.taskComment.create({
                data: {
                    taskId,
                    authorId,
                    content: finalContent,
                    type: 'human'
                }
            });

            if (req.file && publicUrl) {
                await tx.taskAttachment.create({
                    data: {
                        taskId,
                        commentId: createdComment.id,
                        url: publicUrl,
                        name: req.file.originalname || "Adjunto de Chat",
                        category: "REFERENCIA"
                    }
                });
            }

            return tx.taskComment.findUnique({
                where: { id: createdComment.id },
                include: { author: { select: taskCommentAuthorSelect }, attachments: true }
            });
        });

        // Trigger mentions & assignee notifications
        processMentionsAndNotifications(taskId, finalContent, authorId).catch(err => {
            console.error("Async mentions processing failed:", err);
        });

        res.status(201).json(comment);
    } catch (error) {
        console.error("Error adding comment:", error);
        res.status(500).json({ error: "Failed to add comment", details: error.message });
    }
};

export const uploadTempFile = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: "No file uploaded" });
        }
        const uploadResult = await uploadToS3(req.file, "temp");
        res.json({
            url: uploadResult.url,
            name: uploadResult.name,
            size: uploadResult.size,
            mimeType: uploadResult.mimeType
        });
    } catch (error) {
        console.error("Temp upload failed:", error);
        res.status(500).json({ error: "Failed to upload file", details: error.message });
    }
};

export const getTaskComments = async (req, res) => {
    try {
        const { taskId } = req.params;
        const taskExists = await prisma.task.findUnique({
            where: { id: taskId }
        });
        if (!taskExists) {
            return res.status(404).json({ error: "Task not found" });
        }

        const comments = await prisma.taskComment.findMany({
            where: { taskId },
            include: { author: { select: taskCommentAuthorSelect }, attachments: true, reactions: true },
            orderBy: { createdAt: 'desc' }
        });

        const mappedComments = comments.map(comment => {
            const emojiGroups = {};
            comment.reactions.forEach(reaction => {
                if (!emojiGroups[reaction.emoji]) {
                    emojiGroups[reaction.emoji] = {
                        emoji: reaction.emoji,
                        count: 0,
                        userReacted: false
                    };
                }
                emojiGroups[reaction.emoji].count += 1;
                if (req.user && reaction.userId === req.user.userId) {
                    emojiGroups[reaction.emoji].userReacted = true;
                }
            });

            const { reactions: rawReactions, ...commentData } = comment;
            return {
                ...commentData,
                reactions: Object.values(emojiGroups)
            };
        });

        res.json(mappedComments);
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch task comments", details: error.message });
    }
};

export const toggleCommentReaction = async (req, res) => {
    try {
        const { taskId, commentId } = req.params;
        const { emoji } = req.body;
        const userId = req.user?.userId;

        if (!emoji) {
            return res.status(400).json({ error: "Emoji is required" });
        }

        const comment = await prisma.taskComment.findUnique({
            where: { id: commentId }
        });

        if (!comment || comment.taskId !== taskId) {
            return res.status(404).json({ error: "Comment not found or does not belong to this task" });
        }

        const existingReaction = await prisma.taskCommentReaction.findUnique({
            where: {
                commentId_userId_emoji: {
                    commentId,
                    userId,
                    emoji
                }
            }
        });

        if (existingReaction) {
            await prisma.taskCommentReaction.delete({
                where: {
                    id: existingReaction.id
                }
            });
            return res.json({ success: true, action: "removed" });
        } else {
            await prisma.taskCommentReaction.create({
                data: {
                    commentId,
                    userId,
                    emoji
                }
            });
            return res.status(201).json({ success: true, action: "added" });
        }
    } catch (error) {
        res.status(500).json({ error: "Failed to toggle reaction", details: error.message });
    }
};

export const updateTaskComment = async (req, res) => {
    try {
        const { taskId, commentId } = req.params;
        const { content } = req.body;
        const userId = req.user?.userId;

        if (content === undefined || content === null) {
            return res.status(400).json({ error: "Content is required" });
        }
        if (String(content).length > COMMENT_MAX_LENGTH) {
            return res.status(400).json({ error: `El comentario no puede superar ${COMMENT_MAX_LENGTH} caracteres` });
        }

        const comment = await prisma.taskComment.findUnique({
            where: { id: commentId }
        });

        if (!comment || comment.taskId !== taskId) {
            return res.status(404).json({ error: "Comment not found or does not belong to this task" });
        }

        if (comment.authorId !== userId) {
            return res.status(403).json({ error: "No tienes permisos para editar este comentario" });
        }

        const updated = await prisma.taskComment.update({
            where: { id: commentId },
            data: {
                content: sanitizeHTML(content),
                isEdited: true
            },
            include: { author: { select: taskCommentAuthorSelect }, attachments: true, reactions: true }
        });

        const emojiGroups = {};
        updated.reactions.forEach(reaction => {
            if (!emojiGroups[reaction.emoji]) {
                emojiGroups[reaction.emoji] = {
                    emoji: reaction.emoji,
                    count: 0,
                    userReacted: false
                };
            }
            emojiGroups[reaction.emoji].count += 1;
            if (reaction.userId === userId) {
                emojiGroups[reaction.emoji].userReacted = true;
            }
        });

        const { reactions: rawReactions, ...commentData } = updated;

        res.json({
            ...commentData,
            reactions: Object.values(emojiGroups)
        });
    } catch (error) {
        res.status(500).json({ error: "Failed to update comment", details: error.message });
    }
};

export const deleteTaskComment = async (req, res) => {
    try {
        const { taskId, commentId } = req.params;
        const userId = req.user?.userId;
        const role = req.user?.role;

        const comment = await prisma.taskComment.findUnique({
            where: { id: commentId }
        });

        if (!comment || comment.taskId !== taskId) {
            return res.status(404).json({ error: "Comment not found or does not belong to this task" });
        }

        const isAuthor = comment.authorId === userId;
        const canModerate = isManagerRole(role);

        if (!isAuthor && !canModerate) {
            return res.status(403).json({ error: "No tienes permisos para eliminar este comentario" });
        }

        await prisma.taskComment.delete({
            where: { id: commentId }
        });

        res.json({ success: true, message: "Comentario eliminado exitosamente" });
    } catch (error) {
        res.status(500).json({ error: "Failed to delete comment", details: error.message });
    }
};

export const getClientTasksHandler = async (req, res) => {
    try {
        const tasks = await getClientTasks(req.params.clientId);
        res.json(tasks);
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch tasks", details: error.message });
    }
};

export const createClientTaskHandler = async (req, res) => {
    try {
        const { text, dueDate, assigneeId } = req.body;
        if (!text) return res.status(400).json({ error: "Missing text" });
        const task = await createClientTask({ clientId: req.params.clientId, text, dueDate, assigneeId });
        res.json(task);
    } catch (error) {
        res.status(500).json({ error: "Failed to create task", details: error.message });
    }
};

export const updateClientTaskHandler = async (req, res) => {
    try {
        const task = await updateClientTaskStatus(req.params.taskId, req.body);
        res.json(task);
    } catch (error) {
        res.status(500).json({ error: "Failed to update task", details: error.message });
    }
};

export const deleteClientTaskHandler = async (req, res) => {
    try {
        await deleteTask(req.params.taskId);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: "Failed to delete task", details: error.message });
    }
};
