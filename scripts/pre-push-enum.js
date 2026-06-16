import pg from 'pg';

const { Client } = pg;

async function prePushEnum() {
    console.log("--- INICIANDO MIGRACIÓN NATIVA DE ENUMS ---");

    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
        console.warn("DATABASE_URL no encontrada. Saltando migración nativa.");
        return;
    }

    const client = new Client({ connectionString });

    try {
        await client.connect();

        // 1. Create the Enum type if it doesn't exist
        console.log("Registrando tipo Enum ServiceCategory...");
        await client.query(`
            DO $$ BEGIN
                CREATE TYPE "ServiceCategory" AS ENUM (
                    'BRANDING', 'DISENO', 'PRODUCCION_AUDIOVISUAL',
                    'MARKETING', 'ADS', 'EDITORIAL', 'WEB', 'DESARROLLO'
                );
            EXCEPTION
                WHEN duplicate_object THEN null;
            END $$;
        `);

        // 2. Alter the column type with explicit mapping
        console.log("Transformando columna category en ServiceCatalog...");
        await client.query(`
            ALTER TABLE "ServiceCatalog"
            ALTER COLUMN "category" TYPE "ServiceCategory"
            USING (
                CASE
                    WHEN "category" = 'Branding' THEN 'BRANDING'::"ServiceCategory"
                    WHEN "category" = 'Diseño' THEN 'DISENO'::"ServiceCategory"
                    WHEN "category" = 'Producción audiovisual' THEN 'PRODUCCION_AUDIOVISUAL'::"ServiceCategory"
                    WHEN "category" = 'Marketing' THEN 'MARKETING'::"ServiceCategory"
                    WHEN "category" = 'Ads' THEN 'ADS'::"ServiceCategory"
                    WHEN "category" = 'Editorial' THEN 'EDITORIAL'::"ServiceCategory"
                    WHEN "category" = 'Web' THEN 'WEB'::"ServiceCategory"
                    WHEN "category" = 'Desarrollo web y tecnología' THEN 'DESARROLLO'::"ServiceCategory"
                    WHEN "category" = 'Desarrollo' THEN 'DESARROLLO'::"ServiceCategory"
                    ELSE 'WEB'::"ServiceCategory"
                END
            );
        `);

        console.log("--- MIGRACIÓN NATIVA COMPLETADA EXITOSAMENTE ---");
    } catch (err) {
        console.error("Fallo crítico en migración nativa:", err.message);
        // We don't exit with error here to allow prisma db push to attempt its work if possible
    } finally {
        await client.end();
    }
}

prePushEnum();
