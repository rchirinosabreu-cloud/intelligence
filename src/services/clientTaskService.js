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
export async function createTask(clientId, data) {
  // data can be a string (text only) or an object { text, dueDate, assignee }
  // Backwards compatibility handling
  let text, dueDate, assignee;

  if (typeof data === 'string') {
      text = data;
  } else {
      text = data.text;
      dueDate = data.dueDate; // Can be undefined
      assignee = data.assignee; // Can be undefined
  }

  try {
    if (!text) throw new Error("Task text is required");

    const task = await prisma.clientTask.create({
      data: {
        text,
        clientId,
        completed: false,
        dueDate: dueDate ? new Date(dueDate) : null,
        assignee: assignee || null
      }
    });
    return task;
  } catch (error) {
    console.error(`[ClientTaskService] Error creating task for client ${clientId}:`, error);
    throw error;
  }
}

// Update a task (toggle completion or update metadata)
export async function updateTask(id, data) {
  try {
    // Sanitize updates
    const updates = {};
    if (data.completed !== undefined) updates.completed = data.completed;
    if (data.text !== undefined) updates.text = data.text;
    if (data.dueDate !== undefined) updates.dueDate = data.dueDate ? new Date(data.dueDate) : null;
    if (data.assignee !== undefined) updates.assignee = data.assignee;

    const task = await prisma.clientTask.update({
      where: { id },
      data: updates
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
