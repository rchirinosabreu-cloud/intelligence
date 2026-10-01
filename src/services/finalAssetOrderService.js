import prisma from '../lib/prisma.js';
import { finalAssetOrderProblem } from '../lib/finalAssetOrder.js';

const httpError = (status, message) => Object.assign(new Error(message), { status });

/**
 * Guarda el orden de los archivos de una pieza: todas las posiciones cambian juntas o ninguna. El
 * archivo heredado de las columnas antiguas (`legacy`) no tiene fila y va siempre primero; no entra aquí.
 */
export const reorderContentItemFinalAssets = async (itemId, orderedIds, { db = prisma } = {}) => {
  const assets = await db.contentItemFinalAsset.findMany({
    where: { contentItemId: itemId },
    orderBy: [{ position: 'asc' }, { createdAt: 'asc' }]
  });
  if (!assets.length) throw httpError(404, 'La pieza no tiene archivos que ordenar.');
  const problem = finalAssetOrderProblem(assets.map((asset) => asset.id), orderedIds);
  if (problem) throw httpError(400, problem);

  await db.$transaction(orderedIds.map((id, position) => db.contentItemFinalAsset.update({
    where: { id: String(id) },
    data: { position }
  })));
  return db.contentItemFinalAsset.findMany({
    where: { contentItemId: itemId },
    orderBy: [{ position: 'asc' }, { createdAt: 'asc' }]
  });
};
