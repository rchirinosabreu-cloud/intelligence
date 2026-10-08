// Metadata verification and retirement of the explicitly fictitious browser-test learnings.
import pg from 'pg';
import { loadResearchConfig } from './lib/briaResearchRuntime.js';
import { createBriaKnowledgeRepository } from '../src/services/briaKnowledgeRepository.js';
const config = await loadResearchConfig(process.env.BRIA_PROJECT_ENV || 'C:/Proyectos/intelligence/.env');
const pool = new pg.Pool({ connectionString: config.DATABASE_URL, max: 2 });
try {
  const repo = createBriaKnowledgeRepository({ pool, workspace: 'research:social.brainstudio@gmail.com' }), actor = { ref: 'local-research-owner', name: 'Rodny', role: 'ADMIN' };
  const disposable = (await repo.list(actor)).filter(row => row.status === 'ACTIVE' && row.entity === 'Cuenta de prueba Bria' && row.topic.startsWith('Entrega de prueba ') && row.text.includes('clientes reales'));
  for (const row of disposable) await repo.revoke({ actor, id: row.id, expectedRevision: row.revision });
  console.log(JSON.stringify({ ...await repo.status(), fictitiousLearningsRetired: disposable.length, operationalDataChanged: false }));
} finally { await pool.end(); }
