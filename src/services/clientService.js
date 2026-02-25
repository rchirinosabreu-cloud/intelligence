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
            select: { files: true }
        }
      }
    });
    return clients;
  } catch (error) {
    console.error("[ClientService] Error fetching clients:", error);
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

export async function updateClient(id, data) {
  const { name, status, slug } = data;

  const updateData = {};

  if (name !== undefined && name !== null) {
    updateData.name = name;
    updateData.logoUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=random&color=fff&size=128`;
  }

  if (status !== undefined && status !== null) {
    updateData.status = status;
  }

  if (slug !== undefined && slug !== null) {
    updateData.slug = slugify(slug);
    // TODO: Ideally check uniqueness, but DB will throw if duplicate.
  }

  try {
    const client = await prisma.client.update({
      where: { id },
      data: updateData
    });
    return client;
  } catch (error) {
    console.error(`[ClientService] Error updating client ${id}:`, error);
    throw new Error("Failed to update client");
  }
}

export async function deleteClient(id) {
  try {
    await prisma.$transaction([
        prisma.brandAsset.deleteMany({ where: { clientId: id } }),
        prisma.clientFile.deleteMany({ where: { clientId: id } }),
        prisma.client.delete({ where: { id } })
    ]);

    return { success: true };
  } catch (error) {
    console.error(`[ClientService] Error deleting client ${id}:`, error);
    throw new Error("Failed to delete client");
  }
}
