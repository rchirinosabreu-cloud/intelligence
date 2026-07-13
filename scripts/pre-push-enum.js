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
                    WHEN UPPER(BTRIM("category"::text)) = 'BRANDING' THEN 'BRANDING'::"ServiceCategory"
                    WHEN UPPER(BTRIM("category"::text)) = 'DISEÑO' THEN 'DISENO'::"ServiceCategory"
                    WHEN UPPER(BTRIM("category"::text)) = 'PRODUCCIÓN AUDIOVISUAL' THEN 'PRODUCCION_AUDIOVISUAL'::"ServiceCategory"
                    WHEN UPPER(BTRIM("category"::text)) = 'MARKETING' THEN 'MARKETING'::"ServiceCategory"
                    WHEN UPPER(BTRIM("category"::text)) = 'ADS' THEN 'ADS'::"ServiceCategory"
                    WHEN UPPER(BTRIM("category"::text)) = 'EDITORIAL' THEN 'EDITORIAL'::"ServiceCategory"
                    WHEN UPPER(BTRIM("category"::text)) = 'WEB' THEN 'WEB'::"ServiceCategory"
                    WHEN UPPER(BTRIM("category"::text)) = 'DESARROLLO WEB Y TECNOLOGÍA' THEN 'DESARROLLO'::"ServiceCategory"
                    WHEN UPPER(BTRIM("category"::text)) = 'DESARROLLO' THEN 'DESARROLLO'::"ServiceCategory"
                    WHEN UPPER(BTRIM("category"::text)) = 'DISENO' THEN 'DISENO'::"ServiceCategory"
                    WHEN UPPER(BTRIM("category"::text)) = 'PRODUCCION_AUDIOVISUAL' THEN 'PRODUCCION_AUDIOVISUAL'::"ServiceCategory"
                    ELSE 'WEB'::"ServiceCategory"
                END
            );
        `);

        // 3. Register ClientStatus Enum type
        console.log("Registrando tipo Enum ClientStatus...");
        await client.query(`
            DO $$ BEGIN
                CREATE TYPE "ClientStatus" AS ENUM (
                    'PROPUESTA_ENVIADA', 'CONTRATO_PENDIENTE', 'RECOPILANDO_ACCESOS',
                    'ACTIVO', 'ALERTA_RENOVACION', 'CERRADO'
                );
            EXCEPTION
                WHEN duplicate_object THEN null;
            END $$;
        `);

        // 4. Alter Client.status column to ClientStatus
        console.log("Transformando columna status en Client...");
        await client.query(`
            ALTER TABLE "Client"
            ALTER COLUMN "status" TYPE "ClientStatus"
            USING (
                CASE
                    WHEN BTRIM(LOWER("status"::text)) = 'active' THEN 'ACTIVO'::"ClientStatus"
                    WHEN BTRIM(LOWER("status"::text)) = 'activo' THEN 'ACTIVO'::"ClientStatus"
                    WHEN BTRIM(LOWER("status"::text)) = 'paused' THEN 'CERRADO'::"ClientStatus"
                    WHEN BTRIM(LOWER("status"::text)) = 'archived' THEN 'CERRADO'::"ClientStatus"
                    ELSE 'ACTIVO'::"ClientStatus"
                END
            );
        `);

        // 5. Register FinancialCategory, FinancialType, AdjustmentType, ReceivableStatus
        console.log("Registrando tipos Enums Financieros...");
        await client.query(`
            DO $$ BEGIN
                CREATE TYPE "FinancialCategory" AS ENUM (
                    'MEMBRESIA', 'PAUTA', 'NOMINA', 'LOGISTICA', 'ADMINISTRATIVO', 'TAX', 'FINANCIAL', 'OPERATIVO'
                );
            EXCEPTION
                WHEN duplicate_object THEN null;
            END $$;

            DO $$ BEGIN
                CREATE TYPE "FinancialType" AS ENUM (
                    'INCOME', 'EXPENSE'
                );
            EXCEPTION
                WHEN duplicate_object THEN null;
            END $$;

            DO $$ BEGIN
                CREATE TYPE "AdjustmentType" AS ENUM (
                    'BONUS', 'COMMISSION', 'DEDUCTION', 'NOVELTY'
                );
            EXCEPTION
                WHEN duplicate_object THEN null;
            END $$;

            DO $$ BEGIN
                CREATE TYPE "ReceivableStatus" AS ENUM (
                    'DEBE', 'PAGADO', 'PROMESADO'
                );
            EXCEPTION
                WHEN duplicate_object THEN null;
            END $$;
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
