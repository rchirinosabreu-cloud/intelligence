import prisma from '../lib/prisma.js';
import { getDashboardMetrics, getQualityStreak, getCompletedTasks, getTasks, createTask, updateTask, auditAndDeleteTask, toggleTaskFollow, checkIsFollowing } from '../services/nativeTaskService.js';
import { getClientTasks, createClientTask, updateTaskStatus as updateClientTaskStatus, deleteTask } from '../services/clientTaskService.js';
import { uploadToS3, getFromS3Stream } from '../services/s3Service.js';
import { createNotification, processMentionsAndNotifications } from '../services/notificationService.js';

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
        const updatedTask = await updateTask(req.params.taskId, req.body, req.user?.userId);
        res.json(updatedTask);
    } catch (error) {
        res.status(500).json({ error: "Failed to update task", details: error.message });
    }
};

export const deleteExistingTask = async (req, res) => {
    try {
        const { reason } = req.body;
        if (!reason) return res.status(400).json({ error: "Missing deletion reason" });
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

        // Extract key from URL in content robustly
        const bucketName = process.env.AWS_S3_BUCKET_NAME || "chat-evidence";
        let key = null;

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

        if (!key) return res.status(404).json({ error: "No storage key found in comment" });
        const fileName = key.split('/').pop() || 'adjunto_tarea.jpg';

        try {
            const s3Response = await getFromS3Stream(key);

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
        const { content, type } = req.body;
        const { taskId } = req.params;
        const authorId = req.user.userId;

        // Allow empty content if a file is present
        if (!content?.trim() && !req.file) {
            return res.status(400).json({ error: "Content or file is required" });
        }

        let finalContent = content || "";

        if (req.file) {
            const task = await prisma.task.findUnique({
                where: { id: taskId },
                select: { clientId: true, client: { select: { name: true } } }
            });

            if (!task) return res.status(404).json({ error: "Task not found" });

            // Structure path: clientes/{client_id}/tareas/{task_id}/imagenes
            const folderPrefix = `clientes/${task.clientId}/tareas/${taskId}/imagenes`;

            const uploadResult = await uploadToS3(req.file, folderPrefix);
            const publicUrl = uploadResult.url;

            // If there's already content, append the image URL. If not, just the URL.
            finalContent = content ? `${content}\n\n${publicUrl}` : publicUrl;
        }

        const comment = await prisma.taskComment.create({
            data: {
                taskId,
                authorId,
                content: finalContent,
                type: type || 'human'
            },
            include: { author: true }
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
