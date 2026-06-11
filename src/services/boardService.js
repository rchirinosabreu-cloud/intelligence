import prisma from '../lib/prisma.js';

/**
 * Get all boards, optionally filtered by client.
 */
export const getBoards = async (clientId = null) => {
  const where = clientId ? { clientId } : {};
  return await prisma.board.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: {
        _count: {
            select: { items: true }
        },
        client: {
            select: { name: true, logoUrl: true }
        }
    }
  });
};

/**
 * Get a single board by ID.
 */
export const getBoardById = async (boardId) => {
  return await prisma.board.findUnique({
    where: { id: boardId },
    include: {
      client: {
        select: { name: true }
      }
    }
  });
};

/**
 * Create a new board for a client.
 */
export const createBoard = async (clientId, name) => {
  return await prisma.board.create({
    data: {
      clientId,
      name
    }
  });
};

/**
 * Delete a board and its items (handled by cascade in DB).
 */
export const deleteBoard = async (boardId) => {
  return await prisma.board.delete({
    where: { id: boardId }
  });
};

/**
 * Get all items for a specific board.
 */
export const getBoardItems = async (boardId) => {
  return await prisma.boardItem.findMany({
    where: { boardId },
    orderBy: { createdAt: 'asc' }
  });
};

/**
 * Create a new board item.
 */
export const createBoardItem = async (boardId, data) => {
  return await prisma.boardItem.create({
    data: {
      boardId,
      type: data.type,
      contentUrl: data.contentUrl,
      assetUrl: data.assetUrl,
      metadata: data.metadata || {},
      positionX: data.positionX || 0,
      positionY: data.positionY || 0,
      comment: data.comment
    }
  });
};

/**
 * Update a board item (position, comment, etc.).
 */
export const updateBoardItem = async (itemId, data) => {
  return await prisma.boardItem.update({
    where: { id: itemId },
    data: {
        positionX: data.positionX,
        positionY: data.positionY,
        comment: data.comment,
        metadata: data.metadata
    }
  });
};

/**
 * Delete a specific board item.
 */
export const deleteBoardItem = async (itemId) => {
  return await prisma.boardItem.delete({
    where: { id: itemId }
  });
};
