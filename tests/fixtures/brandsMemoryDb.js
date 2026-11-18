// Base en memoria para la muestra local de Marcas: lo justo que usa `clientBrandService`.
export function createBrandsDb(clients) {
    const brands = [];
    const files = [];
    const liveFiles = (brandId) => files.filter((f) => f.brandId === brandId && !f.deletedAt);
    const withFiles = (brand) => (brand ? { ...brand, files: liveFiles(brand.id) } : null);
    return {
        brands, files,
        client: {
            findUnique: async ({ where }) => clients.find((c) => c.id === where.id) || null,
            findMany: async () => [...clients].sort((a, b) => a.name.localeCompare(b.name, 'es'))
                .map((c) => ({ ...c, brand: withFiles(brands.find((b) => b.clientId === c.id)) }))
        },
        clientBrand: {
            findUnique: async ({ where }) => withFiles(brands.find((b) => b.clientId === where.clientId)),
            create: async ({ data }) => { const row = { id: `b${brands.length + 1}`, revision: 1, colors: [], fonts: [], links: [], updatedAt: new Date(), ...data }; brands.push(row); return row; },
            updateMany: async ({ where, data }) => {
                const row = brands.find((b) => b.id === where.id && b.revision === where.revision);
                if (!row) return { count: 0 };
                Object.assign(row, { ...data, revision: row.revision + 1, updatedAt: new Date() });
                return { count: 1 };
            }
        },
        clientBrandFile: {
            create: async ({ data }) => { const row = { id: `f${files.length + 1}`, createdAt: new Date(), deletedAt: null, ...data }; files.push(row); return row; },
            findFirst: async ({ where }) => {
                const brand = brands.find((b) => b.clientId === where.brand.clientId);
                return files.find((f) => f.id === where.id && !f.deletedAt && f.brandId === brand?.id) || null;
            },
            update: async ({ where, data }) => Object.assign(files.find((f) => f.id === where.id), data)
        }
    };
}
