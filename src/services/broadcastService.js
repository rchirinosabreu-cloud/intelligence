import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Get broadcasts (optionally filtered by clientId)
export async function getBroadcasts(clientId = null) {
  try {
    const where = clientId ? { clientId } : { clientId: null };

    // Fetch latest first
    const broadcasts = await prisma.broadcast.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 20 // Limit to recent items to keep UI clean
    });

    return broadcasts;
  } catch (error) {
    console.error('Error fetching broadcasts:', error);
    throw error;
  }
}

// Create a new broadcast
export async function createBroadcast(data) {
  try {
    const { content, type, clientId, authorName, authorAvatar } = data;

    // Validate
    if (!content || !type) {
      throw new Error('Content and Type are required.');
    }

    const broadcast = await prisma.broadcast.create({
      data: {
        content,
        type,
        clientId: clientId || null, // Ensure null if undefined/empty
        authorName: authorName || 'Team Lead',
        authorAvatar: authorAvatar || '/brainstudio-logo.png'
      }
    });

    return broadcast;
  } catch (error) {
    console.error('Error creating broadcast:', error);
    throw error;
  }
}

// Delete a broadcast
export async function deleteBroadcast(id) {
  try {
    await prisma.broadcast.delete({
      where: { id }
    });
    return true;
  } catch (error) {
    console.error(`Error deleting broadcast ${id}:`, error);
    throw error;
  }
}
