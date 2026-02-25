import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Get tasks for a specific client
export async function getTasks(clientId) {
  try {
    const tasks = await prisma.clientTask.findMany({
      where: { clientId },
      orderBy: { createdAt: 'desc' } // Newest first
    });
    return tasks;
  } catch (error) {
    console.error(`[ClientTaskService] Error fetching tasks for client ${clientId}:`, error);
    throw error;
  }
}

// Create a new task
export async function createTask(clientId, text) {
  try {
    if (!text) throw new Error("Task text is required");

    const task = await prisma.clientTask.create({
      data: {
        text,
        clientId,
        completed: false
      }
    });
    return task;
  } catch (error) {
    console.error(`[ClientTaskService] Error creating task for client ${clientId}:`, error);
    throw error;
  }
}

// Update a task (toggle completion)
export async function updateTask(id, data) {
  try {
    const task = await prisma.clientTask.update({
      where: { id },
      data: data
    });
    return task;
  } catch (error) {
    console.error(`[ClientTaskService] Error updating task ${id}:`, error);
    throw error;
  }
}

// Delete a task
export async function deleteTask(id) {
  try {
    await prisma.clientTask.delete({
      where: { id }
    });
    return true;
  } catch (error) {
    console.error(`[ClientTaskService] Error deleting task ${id}:`, error);
    throw error;
  }
}
