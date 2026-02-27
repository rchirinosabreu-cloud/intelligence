
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Get announcements (limit to recent 5)
export const getGlobalAnnouncements = async () => {
    try {
        const announcements = await prisma.globalAnnouncement.findMany({
            orderBy: {
                createdAt: 'desc',
            },
            take: 5,
        });
        return announcements;
    } catch (error) {
        console.error("Error fetching global announcements:", error);
        return [];
    }
};

// Create announcement (with auto-delete oldest if > 5)
export const createGlobalAnnouncement = async ({ content, type }) => {
    try {
        // Enforce max 5 items logic:
        // 1. Count current items
        const count = await prisma.globalAnnouncement.count();

        // 2. If count >= 5, find and delete the oldest one
        if (count >= 5) {
            const oldest = await prisma.globalAnnouncement.findFirst({
                orderBy: {
                    createdAt: 'asc',
                },
            });

            if (oldest) {
                await prisma.globalAnnouncement.delete({
                    where: {
                        id: oldest.id,
                    },
                });
            }
        }

        // 3. Create new
        const announcement = await prisma.globalAnnouncement.create({
            data: {
                content,
                type: type || 'info',
            },
        });
        return announcement;
    } catch (error) {
        console.error("Error creating global announcement:", error);
        throw error;
    }
};

// Delete announcement
export const deleteGlobalAnnouncement = async (id) => {
    try {
        await prisma.globalAnnouncement.delete({
            where: {
                id,
            },
        });
        return { success: true };
    } catch (error) {
        console.error("Error deleting global announcement:", error);
        throw error;
    }
};
