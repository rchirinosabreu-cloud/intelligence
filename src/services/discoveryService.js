import { SearchServiceClient } from '@google-cloud/discoveryengine';
import { JWT } from 'google-auth-library';
import credentials from '../lib/googleCredentials.js';

// Use explicit project ID 'brainstudio-intelligence' if not found in credentials
const PROJECT_ID = credentials?.project_id || 'brainstudio-intelligence';
const LOCATION = 'global';
const DISCOVERY_ENGINE_LOCATION = process.env.DISCOVERY_ENGINE_LOCATION || LOCATION;

// Engine ID for the App (Brainstudio Intelligence)
const ENGINE_ID = process.env.ENGINE_ID || process.env.DISCOVERY_ENGINE_ENGINE_ID || "brainstudio-intelligence-v_1769659564733";
// Data Store IDs for reference/logs (Brainstudio Unstructured Docs)
const DATA_STORE_ID = process.env.DATA_STORE_ID || "brainstudio-unstructured-v2_1769659124702";
const DATA_STORE_ENTITY_ID = process.env.DATA_STORE_ENTITY_ID || "brainstudio-unstructured-v2_1769659124702_gcs_store";

// Initialize Discovery Engine Client
let searchClient;
try {
    if (!PROJECT_ID) throw new Error("Project ID is missing from credentials");
    if (!credentials?.client_email || !credentials?.private_key) {
        throw new Error("Missing service account credentials for Discovery Engine client initialization");
    }

    const authClient = new JWT({
        email: credentials.client_email,
        key: credentials.private_key,
        subject: process.env.GOOGLE_CALENDAR_ID || process.env.GOOGLE_WORKSPACE_SUBJECT || 'contacto@brainstudioagencia.com',
        scopes: ['https://www.googleapis.com/auth/cloud-platform']
    });

    searchClient = new SearchServiceClient({
        authClient: authClient,
        projectId: PROJECT_ID,
        apiEndpoint: 'discoveryengine.googleapis.com'
    });
    console.log("[DiscoveryEngine] Client initialized successfully.");
} catch (e) {
     console.error("[DiscoveryEngine] Failed to initialize client:", e);
}

// HELPER: Desempaquetador de respuestas de Vertex AI (Maneja Protobuf structValue)
function extractGoogleContent(result) {
  try {
    const derived = result.document?.derivedStructData;
    if (!derived) return "";

    const getDeepValue = (obj, key) => {
      if (!obj) return null;
      if (obj.fields && obj.fields[key]) return obj.fields[key];
      return obj[key];
    };

    let combinedText = "";

    let answers = getDeepValue(derived, 'extractive_answers');
    if (answers) {
      const list = answers.listValue ? answers.listValue.values : answers;
      if (Array.isArray(list) && list.length > 0) {
         const answerTexts = list.map(item => {
             const struct = item.structValue ? item.structValue.fields : item;
             const contentObj = getDeepValue(struct, 'content');
             return contentObj?.stringValue || contentObj;
         }).filter(t => typeof t === 'string' && t);

         if (answerTexts.length > 0) {
             combinedText += "Respuestas extractivas:\n" + answerTexts.map(t => `- ${t}`).join("\n") + "\n\n";
         }
      }
    }

    let snippets = getDeepValue(derived, 'snippets');
    if (snippets) {
      const list = snippets.listValue ? snippets.listValue.values : snippets;
      if (Array.isArray(list) && list.length > 0) {
          const snippetTexts = list.map(item => {
             const struct = item.structValue ? item.structValue.fields : item;
             const snippetObj = getDeepValue(struct, 'snippet');
             return snippetObj?.stringValue || snippetObj;
          }).filter(t => typeof t === 'string' && t);

          if (snippetTexts.length > 0) {
             combinedText += "Contexto (Snippets):\n" + snippetTexts.map(t => `...${t}...`).join("\n") + "\n\n";
          }
      }
    }

    return combinedText;
  } catch (e) {
    console.error("Error parseando resultado de Vertex:", e);
  }
  return "";
}

const formatResults = (results, query, usedSource) => {
    let combinedContent = `Encontré ${results.length} documentos relevantes en el repositorio (${usedSource}) para "${query}":\n\n`;
    const linkEntries = [];

    for (const result of results) {
        const doc = result.document;
        const derived = doc.derivedStructData || doc.structData || {};
        const title = derived.title || doc.title || doc.name || "Documento sin título";
        const link = derived.link || (derived.sourceLink ? derived.sourceLink : (doc.uri || "Sin enlace"));
        const text = extractGoogleContent(result);

        combinedContent += `--- DOCUMENTO: ${title} ---\n`;
        combinedContent += `Enlace: ${link}\n`;
        if (text) {
            combinedContent += `${text}`;
        } else {
             combinedContent += " [Contenido no legible automáticamente] \n\n";
        }
        linkEntries.push(`- ${title}: ${link}`);
    }

    if (linkEntries.length) {
        combinedContent += `\n=== ENLACES ===\n${linkEntries.join('\n')}\n`;
    }
    return combinedContent;
};

export async function searchCloudStorage(query) {
    if (!searchClient) {
        return { text: "Error: Discovery Engine client no está inicializado.", inlineDataParts: [] };
    }

    try {
        console.log(`[Discovery] Searching Cloud Storage (Engine: ${ENGINE_ID}) for: ${query}`);

        const engineServingConfig = `projects/${PROJECT_ID}/locations/${DISCOVERY_ENGINE_LOCATION}/collections/default_collection/engines/${ENGINE_ID}/servingConfigs/default_search`;
        const engineRequest = {
            servingConfig: engineServingConfig,
            query: query,
            pageSize: 10,
            contentSearchSpec: {
                extractiveContentSpec: { maxExtractiveAnswerCount: 5 },
                snippetSpec: { returnSnippet: true }
            }
        };

        let results = [];
        let usedSource = "Engine";

        try {
            const [engineResults] = await searchClient.search(engineRequest, { autoPaginate: false });
            if (engineResults && engineResults.length > 0) {
                results = engineResults;
            }
        } catch (engineError) {
            console.warn(`[Discovery] Engine search failed: ${engineError.message}`);
        }

        if (results.length === 0) {
            const dataStoreIds = Array.from(new Set([DATA_STORE_ID, DATA_STORE_ENTITY_ID, "brainstudio-unstructured-v2_1769659124702"].filter(Boolean)));
            for (const dataStoreId of dataStoreIds) {
                const dataStoreServingConfig = `projects/${PROJECT_ID}/locations/${DISCOVERY_ENGINE_LOCATION}/collections/default_collection/dataStores/${dataStoreId}/servingConfigs/default_search`;
                const dataStoreRequest = {
                    servingConfig: dataStoreServingConfig,
                    query: query,
                    pageSize: 10,
                    contentSearchSpec: {
                        extractiveContentSpec: { maxExtractiveAnswerCount: 5 },
                        snippetSpec: { returnSnippet: true }
                    }
                };

                try {
                    const [dsResults] = await searchClient.search(dataStoreRequest, { autoPaginate: false });
                    if (dsResults && dsResults.length > 0) {
                        results = dsResults;
                        usedSource = `DataStore:${dataStoreId}`;
                        break;
                    }
                } catch (dsError) {
                    console.error(`[Discovery] Data Store fallback failed (${dataStoreId}): ${dsError.message}`);
                }
            }
        }

        if (!results || results.length === 0) {
            return { text: `No se encontraron documentos relevantes en Cloud Storage for: "${query}".`, inlineDataParts: [] };
        }

        return { text: formatResults(results, query, usedSource), inlineDataParts: [] };
    } catch (error) {
        console.error("Discovery Search Error:", error);
        return { text: `Error al buscar en Discovery Engine: ${error.message}`, inlineDataParts: [] };
    }
}
