import prisma from '../lib/prisma.js';
import { createTask } from './nativeTaskService.js';
import { uploadToS3, deleteFromS3 } from './s3Service.js';
import { createNotification } from './notificationService.js';
import { createBriaTaskDraftService } from './briaTaskDraftService.js';
export const briaTaskDrafts = createBriaTaskDraftService({ db: prisma, createTask, uploadFile: uploadToS3, removeFile: deleteFromS3, notify: createNotification });
