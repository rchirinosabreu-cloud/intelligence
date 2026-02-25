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

  // Ensure unique slug by appending random string if needed
  // Or check existence. For MVP, just try catch unique constraint or use uuid if needed.
  // Ideally check existence.

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
