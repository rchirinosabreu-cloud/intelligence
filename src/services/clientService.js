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

export async function getClients() {
  try {
    const clients = await prisma.client.findMany({
      orderBy: {
        createdAt: 'desc',
      },
      include: {
        _count: {
            select: {
              files: true,
              links: true,
              tasks: true
            }
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
