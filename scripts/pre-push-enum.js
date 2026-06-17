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
                    WHEN UPPER(TRIM("category")) = 'BRANDING' THEN 'BRANDING'::"ServiceCategory"
                    WHEN UPPER(TRIM("category")) = 'DISEÑO' THEN 'DISENO'::"ServiceCategory"
                    WHEN UPPER(TRIM("category")) = 'PRODUCCIÓN AUDIOVISUAL' THEN 'PRODUCCION_AUDIOVISUAL'::"ServiceCategory"
                    WHEN UPPER(TRIM("category")) = 'MARKETING' THEN 'MARKETING'::"ServiceCategory"
                    WHEN UPPER(TRIM("category")) = 'ADS' THEN 'ADS'::"ServiceCategory"
                    WHEN UPPER(TRIM("category")) = 'EDITORIAL' THEN 'EDITORIAL'::"ServiceCategory"
                    WHEN UPPER(TRIM("category")) = 'WEB' THEN 'WEB'::"ServiceCategory"
                    WHEN UPPER(TRIM("category")) = 'DESARROLLO WEB Y TECNOLOGÍA' THEN 'DESARROLLO'::"ServiceCategory"
                    WHEN UPPER(TRIM("category")) = 'DESARROLLO' THEN 'DESARROLLO'::"ServiceCategory"
                    WHEN UPPER(TRIM("category")) = 'DISENO' THEN 'DISENO'::"ServiceCategory"
                    WHEN UPPER(TRIM("category")) = 'PRODUCCION_AUDIOVISUAL' THEN 'PRODUCCION_AUDIOVISUAL'::"ServiceCategory"
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
