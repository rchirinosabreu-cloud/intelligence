import express from 'express';
import { createTaskDeliverableController } from '../../controllers/taskDeliverableController.js';
import { receivesFiles } from '../../lib/uploadMarker.js';
import { receiveTaskDeliverables } from '../../lib/taskDeliverableUpload.js';

export function createTaskDeliverableRouter(dependencies = {}) {
  const router = express.Router({ mergeParams: true });
  const controller = createTaskDeliverableController(dependencies);
  router.get('/', controller.get);
  router.post('/', controller.authorize, receivesFiles(receiveTaskDeliverables, { field: 'files', max: 20 }), controller.replace);
  router.post('/direct-upload', controller.prepare);
  router.post('/confirm', controller.confirm);
  router.put('/order', controller.reorder);
  router.get('/:fileId/file', controller.file);
  router.get('/:fileId/download', controller.download);
  return router;
}
