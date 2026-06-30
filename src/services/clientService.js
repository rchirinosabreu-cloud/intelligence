import prisma from '../lib/prisma.js';

// Helper to slugify strings
function slugify(text) {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')     // Replace spaces with -
    .replace(/[^\w\-]+/g, '') // Remove all non-word chars
    .replace(/\-\-+/g, '-')   // Replace multiple - with single -
    .replace(/^-+/, '')       // Trim - from start of text
    .replace(/-+$/, '');      // Trim - from end of text
}

export async function getClientGuidelines(identifier) {
  try {
    const client = await getClientByIdentifier(identifier);
    if (!client) {
      return `Error: No se encontró ningún cliente bajo el nombre o identificador "${identifier}".`;
    }

    if (!client.aiInstructions || client.aiInstructions.trim() === '') {
      return `El cliente "${client.name}" no tiene reglas específicas de redacción configuradas en la base de datos. Utiliza las reglas generales de la agencia.`;
    }

    return `Guidelines para ${client.name}:\n\n${client.aiInstructions}`;
  } catch (error) {
    console.error("[ClientService] Error fetching guidelines:", error);
    return `Error al obtener las guías del cliente.`;
  }
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
    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();

    const where = {
        isArchived: isArchived === 'true' || isArchived === true
    };

    if (responsibleId) {
        // Implementation note: if responsibleId is added to Client model later, filter here.
        // For now, keeping it extensible.
    }

    const clients = await prisma.client.findMany({
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
        healthRecords: {
            where: {
                month: currentMonth,
                year: currentYear
            },
            take: 1
        },
        agencyContexts: {
            orderBy: { createdAt: 'desc' },
            take: 1
        }
      }
    });
    return clients;
  } catch (error) {
    console.error(`[${new Date().toISOString()}] [ClientService] Error fetching clients:`, error?.message || error);
    throw new Error("Failed to fetch clients");
  }
}

export async function createClient(data) {
  const { name } = data;
  if (!name) {
    throw new Error("Client name is required");
  }

  let slug = slugify(name);
  let uniqueSlug = slug;
  let counter = 1;
  while (true) {
      const existing = await prisma.client.findUnique({
          where: { slug: uniqueSlug }
      });
      if (!existing) break;
      uniqueSlug = `${slug}-${counter}`;
      counter++;
  }

  try {
    const client = await prisma.client.create({
      data: {
        name,
        slug: uniqueSlug,
        status: 'active',
        logoUrl: `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=random&color=fff&size=128`
      }
    });
    return client;
  } catch (error) {
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

    // 1. Check limit (Max 5)
    const count = await prisma.clientLink.count({
        where: { clientId }
    });

    if (count >= 5) {
        throw new Error("MAX_LINKS_REACHED");
    }

    // 2. Create Link
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

export async function addHealthComment(clientId, content, authorId) {
    return await prisma.agencyContext.create({
        data: {
            clientId,
            content,
            type: 'TEXT',
            status: 'APPROVED',
            metadata: {
                authorId,
                category: 'HEALTH_COMMENT'
            }
        }
    });
}
