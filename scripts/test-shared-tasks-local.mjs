// Entorno de aceptación real: exclusivamente el clúster nuevo de compartidas, nunca .env.
import { generateSharedTaskClient, prepareSharedTaskDatabase } from '../tests/support/sharedTaskSandbox.js';

const prepared = await prepareSharedTaskDatabase();
console.log(`PostgreSQL listo: 127.0.0.1:${prepared.port}/${prepared.database} (${prepared.username}).`);
console.log('Preparación aditiva; sin reinicios, copias ni borrado de otras bases.');
if (process.argv.includes('--generate')) {
  await generateSharedTaskClient();
  console.log('Cliente Prisma generado desde el esquema fuente completo, sin cargar .env.');
}
