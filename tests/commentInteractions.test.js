import test from 'node:test';
import assert from 'node:assert';
import { PrismaClient } from '@prisma/client';
import prisma from '../src/lib/prisma.js';

// Safeguard against cached global prisma instances from previous runs
if (!prisma.taskCommentReaction) {
    const fresh = new PrismaClient();
    prisma.taskCommentReaction = fresh.taskCommentReaction;
}

import {
    getTaskComments,
    toggleCommentReaction,
    updateTaskComment,
    deleteTaskComment,
    addTaskComment
} from '../src/controllers/taskController.js';

function mockRes() {
    const res = {};
    res.status = (code) => {
        res.statusCode = code;
        return res;
    };
    res.json = (data) => {
        res.jsonData = data;
        return res;
    };
    res.statusCode = 200; // default
    return res;
}

test('TaskComment and Reactions Controller Tests', async (t) => {
    // Backup Prisma methods
    const originalTaskFindUnique = prisma.task.findUnique;
    const originalTaskCommentFindUnique = prisma.taskComment.findUnique;
    const originalTaskCommentFindMany = prisma.taskComment.findMany;
    const originalTaskCommentUpdate = prisma.taskComment.update;
    const originalTaskCommentDelete = prisma.taskComment.delete;
    const originalTaskCommentReactionFindUnique = prisma.taskCommentReaction.findUnique;
    const originalTaskCommentReactionCreate = prisma.taskCommentReaction.create;
    const originalTaskCommentReactionDelete = prisma.taskCommentReaction.delete;

    t.after(() => {
        prisma.task.findUnique = originalTaskFindUnique;
        prisma.taskComment.findUnique = originalTaskCommentFindUnique;
        prisma.taskComment.findMany = originalTaskCommentFindMany;
        prisma.taskComment.update = originalTaskCommentUpdate;
        prisma.taskComment.delete = originalTaskCommentDelete;
        prisma.taskCommentReaction.findUnique = originalTaskCommentReactionFindUnique;
        prisma.taskCommentReaction.create = originalTaskCommentReactionCreate;
        prisma.taskCommentReaction.delete = originalTaskCommentReactionDelete;
    });

    await t.test('getTaskComments returns aggregated reactions properly and returns 404 if task not found', async () => {
        // Case 1: Task not found
        prisma.task.findUnique = async () => null;
        let req = { params: { taskId: 'task-abc' } };
        let res = mockRes();

        await getTaskComments(req, res);
        assert.strictEqual(res.statusCode, 404);
        assert.strictEqual(res.jsonData.error, "Task not found");

        // Case 2: Task found, comments with reactions are aggregated
        prisma.task.findUnique = async () => ({ id: 'task-abc' });
        prisma.taskComment.findMany = async () => [
            {
                id: 'comment-1',
                taskId: 'task-abc',
                authorId: 'user-1',
                content: 'Hello World',
                attachments: [],
                reactions: [
                    { emoji: '🚀', userId: 'user-1' },
                    { emoji: '🚀', userId: 'user-2' },
                    { emoji: '🧠', userId: 'user-2' }
                ]
            }
        ];

        req = {
            params: { taskId: 'task-abc' },
            user: { userId: 'user-1' }
        };
        res = mockRes();

        await getTaskComments(req, res);
        assert.strictEqual(res.statusCode, 200);
        assert.ok(Array.isArray(res.jsonData));
        assert.strictEqual(res.jsonData.length, 1);

        const reactions = res.jsonData[0].reactions;
        assert.strictEqual(reactions.length, 2);

        const rocket = reactions.find(r => r.emoji === '🚀');
        assert.ok(rocket);
        assert.strictEqual(rocket.count, 2);
        assert.strictEqual(rocket.userReacted, true); // user-1 matches

        const brain = reactions.find(r => r.emoji === '🧠');
        assert.ok(brain);
        assert.strictEqual(brain.count, 1);
        assert.strictEqual(brain.userReacted, false); // user-1 is different from user-2
    });

    await t.test('toggleCommentReaction - adds reaction if not present, and deletes if already present', async () => {
        // Mock comment mismatch
        prisma.taskComment.findUnique = async () => ({ id: 'comment-1', taskId: 'other-task' });
        let req = {
            params: { taskId: 'task-abc', commentId: 'comment-1' },
            body: { emoji: '🧠' },
            user: { userId: 'user-1' }
        };
        let res = mockRes();

        await toggleCommentReaction(req, res);
        assert.strictEqual(res.statusCode, 404);

        // Mock exact comment
        prisma.taskComment.findUnique = async () => ({ id: 'comment-1', taskId: 'task-abc' });

        // Case 1: Reaction doesn't exist yet -> ADD
        prisma.taskCommentReaction.findUnique = async () => null;
        let createdData = null;
        prisma.taskCommentReaction.create = async ({ data }) => {
            createdData = data;
            return { id: 'reaction-1', ...data };
        };

        req = {
            params: { taskId: 'task-abc', commentId: 'comment-1' },
            body: { emoji: '🧠' },
            user: { userId: 'user-1' }
        };
        res = mockRes();

        await toggleCommentReaction(req, res);
        assert.strictEqual(res.statusCode, 201);
        assert.strictEqual(res.jsonData.action, 'added');
        assert.deepStrictEqual(createdData, { commentId: 'comment-1', userId: 'user-1', emoji: '🧠' });

        // Case 2: Reaction exists -> REMOVE (toggle off)
        prisma.taskCommentReaction.findUnique = async () => ({ id: 'reaction-1', commentId: 'comment-1', userId: 'user-1', emoji: '🧠' });
        let deletedId = null;
        prisma.taskCommentReaction.delete = async ({ where }) => {
            deletedId = where.id;
            return {};
        };

        res = mockRes();
        await toggleCommentReaction(req, res);
        assert.strictEqual(res.statusCode, 200);
        assert.strictEqual(res.jsonData.action, 'removed');
        assert.strictEqual(deletedId, 'reaction-1');
    });

    await t.test('updateTaskComment - updates comment and sets isEdited if author, or returns 403', async () => {
        prisma.taskComment.findUnique = async () => ({ id: 'comment-1', taskId: 'task-abc', authorId: 'user-1' });

        // Case 1: Mismatched author -> HTTP 403
        let req = {
            params: { taskId: 'task-abc', commentId: 'comment-1' },
            body: { content: 'New Edit' },
            user: { userId: 'user-mismatch' }
        };
        let res = mockRes();

        await updateTaskComment(req, res);
        assert.strictEqual(res.statusCode, 403);

        // Case 2: Matches author -> HTTP 200 with isEdited = true
        let updatedPayload = null;
        prisma.taskComment.update = async ({ where, data }) => {
            updatedPayload = data;
            return {
                id: 'comment-1',
                taskId: 'task-abc',
                authorId: 'user-1',
                content: data.content,
                isEdited: data.isEdited,
                reactions: []
            };
        };

        req = {
            params: { taskId: 'task-abc', commentId: 'comment-1' },
            body: { content: 'My updated content' },
            user: { userId: 'user-1' }
        };
        res = mockRes();

        await updateTaskComment(req, res);
        assert.strictEqual(res.statusCode, 200);
        assert.strictEqual(updatedPayload.content, 'My updated content');
        assert.strictEqual(updatedPayload.isEdited, true);
        assert.strictEqual(res.jsonData.content, 'My updated content');
        assert.strictEqual(res.jsonData.isEdited, true);
    });

    await t.test('deleteTaskComment - deletes comment if author or admin, returns 403 otherwise', async () => {
        prisma.taskComment.findUnique = async () => ({ id: 'comment-1', taskId: 'task-abc', authorId: 'user-1' });

        // Case 1: Neither author nor admin -> 403
        let req = {
            params: { taskId: 'task-abc', commentId: 'comment-1' },
            user: { userId: 'user-other', role: 'VIEWER' }
        };
        let res = mockRes();

        await deleteTaskComment(req, res);
        assert.strictEqual(res.statusCode, 403);

        // Case 2: Author deletes -> 200
        let deletedCommentId = null;
        prisma.taskComment.delete = async ({ where }) => {
            deletedCommentId = where.id;
            return {};
        };

        req = {
            params: { taskId: 'task-abc', commentId: 'comment-1' },
            user: { userId: 'user-1', role: 'VIEWER' }
        };
        res = mockRes();

        await deleteTaskComment(req, res);
        assert.strictEqual(res.statusCode, 200);
        assert.strictEqual(deletedCommentId, 'comment-1');

        // Case 3: Admin deletes (even if not author) -> 200
        deletedCommentId = null;
        req = {
            params: { taskId: 'task-abc', commentId: 'comment-1' },
            user: { userId: 'admin-user', role: 'ADMIN' }
        };
        res = mockRes();

        await deleteTaskComment(req, res);
        assert.strictEqual(res.statusCode, 200);
        assert.strictEqual(deletedCommentId, 'comment-1');
    });

    await t.test('HTML Sanitization - addTaskComment & updateTaskComment desinfect content securely', async () => {
        // Mock transaction and final return
        const originalTransaction = prisma.$transaction;
        const expectedCleanHtml = '<p>Hello <strong>world</strong></p>';
        prisma.$transaction = async (cb) => {
            return cb({
                taskComment: {
                    create: async ({ data }) => {
                        return { id: 'comment-created', ...data };
                    },
                    findUnique: async () => ({
                        id: 'comment-created',
                        content: expectedCleanHtml,
                        author: { name: 'Test User' },
                        attachments: []
                    })
                },
                taskAttachment: {
                    create: async () => ({})
                }
            });
        };

        const maliciousHtml = '<p>Hello <script>alert(1)</script><strong onload="malicious()">world</strong></p>';

        // 1. Test addTaskComment
        prisma.taskComment.findUnique = async () => ({
            id: 'comment-created',
            content: expectedCleanHtml,
            author: { name: 'Test User' },
            attachments: []
        });

        let req = {
            params: { taskId: 'task-abc' },
            body: { content: maliciousHtml },
            user: { userId: 'user-1' }
        };
        let res = mockRes();

        await addTaskComment(req, res);
        assert.strictEqual(res.statusCode, 201);
        assert.strictEqual(res.jsonData.content, expectedCleanHtml);

        // Restore original transaction
        prisma.$transaction = originalTransaction;

        // 2. Test updateTaskComment
        prisma.taskComment.findUnique = async () => ({
            id: 'comment-1',
            taskId: 'task-abc',
            authorId: 'user-1'
        });

        let updatedData = null;
        prisma.taskComment.update = async ({ where, data }) => {
            updatedData = data;
            return {
                id: 'comment-1',
                taskId: 'task-abc',
                authorId: 'user-1',
                content: data.content,
                isEdited: data.isEdited,
                reactions: []
            };
        };

        req = {
            params: { taskId: 'task-abc', commentId: 'comment-1' },
            body: { content: maliciousHtml },
            user: { userId: 'user-1' }
        };
        res = mockRes();

        await updateTaskComment(req, res);
        assert.strictEqual(res.statusCode, 200);
        assert.strictEqual(updatedData.content, expectedCleanHtml);
    });
});
