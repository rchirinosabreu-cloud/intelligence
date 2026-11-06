import prisma from '../lib/prisma.js';
import { finalAssetOrderProblem } from '../lib/finalAssetOrder.js';
import { createContentDeliveryService } from './contentDeliveryService.js';

const httpError = (status, message) => Object.assign(new Error(message), { status });

/**
 * Guarda el orden de los archivos de una pieza: todas las posiciones cambian juntas o ninguna. El
 * archivo heredado de las columnas antiguas (`legacy`) no tiene fila y va siempre primero; no entra aquí.
 */
export const reorderContentItemFinalAssets = async (itemId, orderedIds, { db = prisma, actor, expectedRevision } = {}) => {
  const result = await createContentDeliveryService({ db }).mutate(itemId, { actor, expectedRevision, action: 'REORDERED', material: false }, async (tx, _item, assets) => {
    if (!assets.length) throw httpError(404, 'La pieza no tiene archivos que ordenar.');
    const problem = finalAssetOrderProblem(assets.map((asset) => asset.id), orderedIds);
    if (problem) throw httpError(400, problem);

    for (const [position, id] of orderedIds.entries()) await tx.contentItemFinalAsset.update({ where: { id: String(id) }, data: { position } });
  });
  return result.files;
};
