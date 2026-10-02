import prisma from '../lib/prisma.js';
import { normalizeClientProfile } from '../lib/clientProfile.js';

// Helper to slugify strings
function slugify(text) {
  return text
    .toString()
    .toLowerCase()
    .trim()
    // Las tildes y la eñe se convierten a su letra base antes de limpiar: sin esto
    // «Javid Trámite y Asesorías» quedaba como «javid-trmite-y-asesoras», porque el
    // paso siguiente borra la vocal acentuada entera en vez de reemplazarla.
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, '-')     // Replace spaces with -
    .replace(/[^\w\-]+/g, '') // Remove all non-word chars
    .replace(/\-\-+/g, '-')   // Replace multiple - with single -
    .replace(/^-+/, '')       // Trim - from start of text
    .replace(/-+$/, '');      // Trim - from end of text
}

export async function getClientByIdentifier(identifier) {
  try {
    // Check if the identifier is a valid UUID
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(identifier);

    const client = await prisma.client.findFirst({
      where: isUUID ? { id: identifier } : { slug: identifier },
      include: {
        _count: {
            select: {
              clientFiles: true,
              links: true,
              tasks: true
            }
        }
      }
    });

    return client;
  } catch (error) {
    console.error(`[${new Date().toISOString()}] [ClientService] Error fetching client by identifier:`, error?.message || error);
    throw new Error("Failed to fetch client");
  }
}

export async function getClients(filters = {}) {
  try {
    const { isArchived = false, responsibleId } = filters;

    // «all» devuelve activos y archivados. Un cliente archivado sigue debiendo
    // plata, así que financiero necesita poder nombrarlo; el resto de módulos
    // conservan el comportamiento por defecto, que es solo los activos.
    const where = isArchived === 'all'
        ? {}
        : { isArchived: isArchived === 'true' || isArchived === true };

    if (responsibleId) {
        where.responsibleId = responsibleId;
    }

    // La «salud» manual, la bitácora y la telemetría que viajaban aquí se retiraron el 2 de octubre de
    // 2026: el avance de cada cliente lo calcula la Operación de clientes (`clientOperationsService.js`).
    return await prisma.client.findMany({
      where,
      orderBy: {
        name: 'asc',
      },
      include: {
        _count: {
            select: {
              clientFiles: true,
              links: true,
              tasks: true
            }
        },
        responsible: {
            select: { id: true, name: true, avatarUrl: true }
        },
        projectManager: {
            select: { id: true, name: true, avatarUrl: true }
        }
      }
    });
  } catch (error) {
    console.error(`[${new Date().toISOString()}] [ClientService] Error fetching clients:`, error?.message || error);
    throw new Error("Failed to fetch clients");
  }
}

/**
 * Crea la ficha con `db`, que puede ser una transacción. Una cuenta por cobrar puede
 * crear a su cliente en el mismo acto (Rodny, 23 de septiembre de 2026), y eso tiene
 * que ocurrir dentro de su transacción: o quedan las dos cosas, o no queda ninguna.
 */
export async function createClientWith(db, data) {
  if (!String(data?.name ?? '').trim()) {
    throw new Error("Client name is required");
  }
  // La ficha completa (30 de septiembre de 2026): nombre, identidad para la cuenta de
  // cobro, contacto y ubicación. Un dato mal escrito no deja crear una ficha a medias.
  const profile = normalizeClientProfile(data, { requireName: true });
  if (!profile.valid) {
    throw Object.assign(new Error(Object.values(profile.errors)[0]), { statusCode: 400, code: 'CLIENT_PROFILE_INVALID', errors: profile.errors });
  }
  const { name, ...details } = profile.data;

  let slug = slugify(data.slug || name);
  if (!slug) {
    slug = slugify(name);
  }
  let uniqueSlug = slug;
  let counter = 1;
  while (true) {
      const existing = await db.client.findUnique({
          where: { slug: uniqueSlug }
      });
      if (!existing) break;
      uniqueSlug = `${slug}-${counter}`;
      counter++;
  }

  return db.client.create({
    data: {
      name,
      ...details,
      slug: uniqueSlug,
      status: 'ACTIVO',
      logoUrl: `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=random&color=fff&size=128`
    }
  });
}

export async function createClient(data) {
  try {
    return await createClientWith(prisma, data);
  } catch (error) {
    if (error?.message === 'Client name is required' || error?.statusCode === 400) throw error;
    console.error("[ClientService] Error creating client:", error);
    throw new Error("Failed to create client");
  }
}

// --- LINK MANAGEMENT ---

export async function getClientLinks(clientId) {
    if (!clientId) throw new Error("Client ID required");
    try {
        const links = await prisma.clientLink.findMany({
            where: { clientId },
            orderBy: { createdAt: 'asc' }
        });
        return links;
    } catch (error) {
        console.error("[ClientService] Error fetching links:", error);
        throw error; // Re-throw to handle in controller
    }
}

export async function addClientLink(clientId, title, url) {
    if (!clientId || !title || !url) throw new Error("Missing required fields");

    try {
        const link = await prisma.clientLink.create({
            data: {
                clientId,
                title,
                url
            }
        });
        return link;
    } catch (error) {
        console.error("[ClientService] Error creating link:", error);
        throw new Error("Failed to create link");
    }
}

export async function removeClientLink(linkId) {
    if (!linkId) throw new Error("Link ID required");
    try {
        await prisma.clientLink.delete({
            where: { id: linkId }
        });
        return true;
    } catch (error) {
         console.error("[ClientService] Error deleting link:", error);
         throw new Error("Failed to delete link");
    }
}

export async function toggleClientArchive(clientId, archiveStatus) {
    return await prisma.client.update({
        where: { id: clientId },
        data: { isArchived: archiveStatus }
    });
}
