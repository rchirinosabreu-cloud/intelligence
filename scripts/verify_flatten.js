import 'dotenv/config';
import prisma from '../src/lib/prisma.js';

async function verify() {
  console.log('🔍 VERIFICANDO ESTADO DE LA BASE DE DATOS...');

  try {
    const checkNested = async (table, column) => {
      try {
        const result = await prisma.$queryRawUnsafe(`
          SELECT count(*) as count
          FROM "${table}"
          WHERE array_ndims("${column}") > 1
        `);
        const count = Number(result[0].count);
        console.log(`📊 ${table}.${column}: ${count} registros con arrays anidados.`);
        return count;
      } catch (e) {
        if (e.message.includes('does not exist')) {
            console.log(`ℹ️ ${table}.${column}: Columna o tabla no existe (omitido).`);
            return 0;
        }
        throw e;
      }
    };

    let totalNested = 0;
    totalNested += await checkNested('Task', 'mediaUrl');
    totalNested += await checkNested('Task', 'assetsLinks');
    totalNested += await checkNested('ContentItem', 'mediaUrl');
    totalNested += await checkNested('ContentItem', 'assetsLinks');

    if (totalNested === 0) {
      console.log('✅ TODO LIMPIO. No se encontraron arrays multidimensionales.');
    } else {
      console.error('❌ ALERTA: Aún existen arrays multidimensionales.');
    }

    const checkInternalNotes = await prisma.$queryRaw`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'ContentPlan' AND column_name = 'internalNotes'
    `;
    if (checkInternalNotes.length > 0) {
        console.log('✅ ContentPlan.internalNotes existe.');
    } else {
        console.error('❌ ContentPlan.internalNotes NO existe.');
    }

  } catch (error) {
    console.error('❌ Error durante la verificación:', error);
  } finally {
    await prisma.$disconnect();
  }
}

verify();
