import prisma from '../lib/prisma.js';
import { createTask, auditAndDeleteTask, updateTask } from './nativeTaskService.js';
import { createBriaDeleteService } from './briaDeleteService.js';
import { createBriaActionService } from './briaActionService.js';
import { uploadToS3, deleteFromS3 } from './s3Service.js';
import { createNotification } from './notificationService.js';
import { createBriaTaskDraftService } from './briaTaskDraftService.js';
import { createBriaDispatchService } from './briaDispatchService.js';
import { sendItemToKanban, createContentPlan, updateContentPlan } from './contentService.js';
export const briaTaskDrafts = createBriaTaskDraftService({ db: prisma, createTask, uploadFile: uploadToS3, removeFile: deleteFromS3, notify: createNotification });
export const briaDispatchDrafts = createBriaDispatchService({ db: prisma, dispatchItem: sendItemToKanban });
// Eliminar desde el chat (10 de octubre de 2026): la misma vía que el botón de Gestión, con su registro.
export const briaDeleteDrafts = createBriaDeleteService({ db: prisma, deleteTask: auditAndDeleteTask });
// Acciones en la plataforma (10 de octubre de 2026): cambiar un pendiente y crear una parrilla, por las vías de siempre.
export const briaActions = createBriaActionService({ db: prisma, updateTask, createContentPlan, updateContentPlan });
