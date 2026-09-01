import { getApiBaseUrl } from '../lib/apiBaseUrl';

const getBaseUrl = () => getApiBaseUrl();

const getOpenAiUrl = () => `${getBaseUrl()}/api/openai/v1/chat/completions`;
const getFirefliesUrl = () => `${getBaseUrl()}/api/fireflies/graphql`;
const getAuthHeaders = () => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${localStorage.getItem('authToken')}`
});

// Helper for delay
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const frontendApiService = {
  // OpenAI API Call with retry and SSE streaming logic
  generateCompletion: async (prompt, systemMessage = "You are a helpful assistant.", onChunk = null) => {
    // Add Spanish instruction to system message
    const languageInstruction = " Responde SIEMPRE en español. Todos los textos, títulos, labels deben estar en español.";
    const finalSystemMessage = systemMessage + languageInstruction;

    let retries = 3;
    let attempt = 0;

    while (attempt < retries) {
      try {
        const response = await fetch(getOpenAiUrl(), {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({
            messages: [
              { role: "system", content: finalSystemMessage },
              { role: "user", content: prompt }
            ],
            stream: true
          })
        });

        if (!response.ok) {
            if (response.status === 429) throw new Error("Rate limited");
            const errText = await response.text();
            throw new Error(`OpenAI HTTP Error: ${response.status} - ${errText}`);
        }

        // Handle streaming response
        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let fullText = "";
        let buffer = ""; // Required to handle chunk fragmentation in TCP streams

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });

            // Split by newline, keeping the last potentially incomplete line in the buffer
            const lines = buffer.split('\n');
            buffer = lines.pop() || ""; // The last element is either empty (if ended in \n) or an incomplete line

            for (const line of lines) {
                const trimmedLine = line.trim();
                if (trimmedLine.startsWith('data: ') && trimmedLine !== 'data: [DONE]') {
                    try {
                        const jsonStr = trimmedLine.slice(6);
                        const data = JSON.parse(jsonStr);
                        const content = data.choices[0]?.delta?.content || "";
                        if (content) {
                            fullText += content;
                            if (onChunk) {
                                onChunk(content, fullText);
                            }
                        }
                    } catch (e) {
                        console.warn("Error parsing chunk:", e, trimmedLine);
                    }
                }
            }
        }

        // If there's anything left in the buffer that looks like a data line, process it
        if (buffer.trim().startsWith('data: ') && buffer.trim() !== 'data: [DONE]') {
             try {
                 const jsonStr = buffer.trim().slice(6);
                 const data = JSON.parse(jsonStr);
                 const content = data.choices[0]?.delta?.content || "";
                 if (content) fullText += content;
             } catch(e) {
                 // Ignore trailing garbage
             }
        }

        return fullText;

      } catch (error) {
        if (error.message.includes("Rate limited") || error.message.includes("429")) {
          attempt++;
          const waitTime = Math.pow(2, attempt) * 1000;
          console.warn(`Rate limited by OpenAI. Retrying in ${waitTime}ms...`);
          await delay(waitTime);
        } else {
          console.error("OpenAI API Error:", error);
          if (error.message === 'Network Error' && !error.response) {
            throw new Error("Network Error: Failed to connect to proxy.");
          }
          throw new Error(error.message || "Failed to generate completion from OpenAI");
        }
      }
    }
    throw new Error("Failed to connect to OpenAI after multiple attempts due to rate limiting.");
  },

  // Batch Analysis Helper
  // Takes an array of file objects { title, text, type } and prepares a combined context
  generateBatchAnalysis: async (files, analysisType) => {
    if (!files || files.length === 0) throw new Error("No files provided for analysis");

    // Concatenate contents
    const parts = ["A continuación se presentan los contenidos de múltiples fuentes para su análisis integrado:\n\n"];

    files.forEach((file, index) => {
      parts.push(`--- FUENTE ${index + 1}: ${file.title} (${file.type}) ---\n`);
      // No truncation: el backend controla el contexto del proveedor.
      parts.push(file.text);
      parts.push(' \n\n');
    });

    return parts.join('');
  },

  // Fireflies GraphQL Call
  fetchFirefliesData: async (query, variables = {}) => {
    try {
      const response = await fetch(getFirefliesUrl(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, variables })
      });

      if (!response.ok) {
          throw new Error(`Fireflies HTTP Error: ${response.status}`);
      }

      const data = await response.json();

      if (data.errors) {
        throw new Error(data.errors[0].message);
      }

      return data.data;
    } catch (error) {
      console.error("Fireflies API Error:", error);
      // CORS errors are common in frontend-only calls to some APIs.
      if (error.message === 'Network Error' && !error.response) {
        throw new Error(
          "Network Error: This may be due to CORS restrictions on the Fireflies API when called directly from the browser. In a production environment, a proxy server is required."
        );
      }

      if (error.response?.status === 504) {
        throw new Error(
          "El proxy de Fireflies no respondió (504). Verifica que el backend esté en línea y que VITE_API_BASE_URL apunte a tu servidor."
        );
      }

      if (error.response?.status === 502) {
         throw new Error("Error de autenticación con el servicio de Fireflies. Por favor contacta al soporte.");
      }

      if (error.response?.status === 401 || error.response?.status === 403) {
        throw new Error(
          "No autorizado para Fireflies. Revisa que FIREFLIES_API_KEY esté configurada en el backend."
        );
      }

      throw new Error(error.response?.data?.message || error.message || "Failed to fetch data from Fireflies");
    }
  },
  checkFirefliesConnection: async () => {
    const query = `
      query FirefliesHealth($limit: Int, $skip: Int) {
        transcripts(limit: $limit, skip: $skip) {
          id
        }
      }
    `;

    try {
      const response = await fetch(getFirefliesUrl(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, variables: { limit: 1, skip: 0 } })
      });

      if (!response.ok) return false;
      const data = await response.json();
      if (data.errors) return false;

      return true;
    } catch (error) {
      console.warn("Fireflies Health Check Error:", error);
      return false;
    }
  },
  checkOpenAiConnection: async () => {
    try {
      const response = await fetch(`${getBaseUrl()}/api/openai/v1/models`);
      return response.ok;
    } catch (error) {
      console.warn("OpenAI Health Check Error:", error);
      return false;
    }
  },

  // Specific Fireflies Queries
  getTranscripts: async (limit = 50, skip = 0) => {
    const query = `
      query Transcripts($limit: Int, $skip: Int) {
        transcripts(limit: $limit, skip: $skip) {
          id
          title
          date
          duration
          organizer_email
        }
      }
    `;
    return frontendApiService.fetchFirefliesData(query, { limit, skip });
  },

  getTranscriptDetails: async (id) => {
    const query = `
      query GetTranscriptDetails($id: String!) {
        transcript(id: $id) {
          id
          title
          duration
          summary {
            overview
            outline
            keywords
            action_items
            notes
          }
          sentences {
            text
            speaker_name
          }
        }
      }
    `;
    return frontendApiService.fetchFirefliesData(query, { id });
  },

  getAutomatedMinutes: async (limit = 50) => {
    const response = await fetch(`${getBaseUrl()}/api/minutes?limit=${encodeURIComponent(limit)}`, {
      headers: getAuthHeaders()
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.message || `No fue posible cargar las minutas (${response.status})`);
    }
    return response.json();
  },

  syncAutomatedMinutes: async () => {
    const response = await fetch(`${getBaseUrl()}/api/minutes/sync`, {
      method: 'POST',
      headers: getAuthHeaders()
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.message || `No fue posible sincronizar Fireflies (${response.status})`);
    }
    return response.json();
  },

  getDriveContents: async ({ folderId, query, trash = false } = {}) => {
    const params = new URLSearchParams();
    if (folderId) params.set('folderId', folderId);
    if (query) params.set('query', query);
    if (trash) params.set('trash', 'true');
    const response = await fetch(`${getBaseUrl()}/api/drive/contents?${params}`, { headers: getAuthHeaders() });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.message || `No fue posible cargar Drive (${response.status})`);
    }
    return response.json();
  },

  getDriveFiles: async ({ query, kind } = {}) => {
    const params = new URLSearchParams();
    if (query) params.set('query', query);
    if (kind) params.set('kind', kind);
    const response = await fetch(`${getBaseUrl()}/api/drive/files?${params}`, { headers: getAuthHeaders() });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.message || `No fue posible cargar los archivos (${response.status})`);
    }
    return response.json();
  },

  getDriveFile: async (meetingId, kind) => {
    const response = await fetch(`${getBaseUrl()}/api/drive/files/${encodeURIComponent(meetingId)}/${encodeURIComponent(String(kind).toLowerCase())}`, { headers: getAuthHeaders() });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.message || `No fue posible abrir el archivo (${response.status})`);
    }
    return response.json();
  },

  createDriveFolder: async ({ name, parentId }) => {
    const response = await fetch(`${getBaseUrl()}/api/drive/folders`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ name, parentId })
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.message || 'No fue posible crear la carpeta.');
    }
    return response.json();
  },

  uploadDriveFile: async ({ file, folderId, subtitle }) => {
    const body = new FormData();
    body.append('file', file);
    if (folderId) body.append('folderId', folderId);
    if (subtitle) body.append('subtitle', subtitle);
    const response = await fetch(`${getBaseUrl()}/api/drive/upload`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${localStorage.getItem('authToken')}` },
      body
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.message || `No fue posible subir el archivo (${response.status})`);
    }
    return response.json();
  },

  updateDriveFile: async (id, updates) => {
    const response = await fetch(`${getBaseUrl()}/api/drive/files/${encodeURIComponent(id)}`, {
      method: 'PATCH', headers: getAuthHeaders(), body: JSON.stringify(updates)
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.message || 'No fue posible actualizar el archivo.');
    }
    return response.json();
  },

  updateDriveFolder: async (id, updates) => {
    const response = await fetch(`${getBaseUrl()}/api/drive/folders/${encodeURIComponent(id)}`, {
      method: 'PATCH', headers: getAuthHeaders(), body: JSON.stringify(updates)
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.message || 'No fue posible actualizar la carpeta.');
    }
    return response.json();
  },

  trashDriveFile: async (id) => {
    const response = await fetch(`${getBaseUrl()}/api/drive/files/${encodeURIComponent(id)}`, { method: 'DELETE', headers: getAuthHeaders() });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.message || 'No fue posible enviar el archivo a la papelera.');
    }
    return response.json();
  },

  trashDriveFolder: async (id) => {
    const response = await fetch(`${getBaseUrl()}/api/drive/folders/${encodeURIComponent(id)}`, { method: 'DELETE', headers: getAuthHeaders() });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.message || 'No fue posible enviar la carpeta a la papelera.');
    }
    return response.json();
  },

  restoreDriveFile: async (id) => {
    const response = await fetch(`${getBaseUrl()}/api/drive/files/${encodeURIComponent(id)}/restore`, { method: 'PATCH', headers: getAuthHeaders() });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.message || 'No fue posible restaurar el archivo.');
    }
    return response.json();
  },

  restoreDriveFolder: async (id) => {
    const response = await fetch(`${getBaseUrl()}/api/drive/folders/${encodeURIComponent(id)}/restore`, { method: 'PATCH', headers: getAuthHeaders() });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.message || 'No fue posible restaurar la carpeta.');
    }
    return response.json();
  },

  getManagedDriveFile: async (id, { download = false } = {}) => {
    const response = await fetch(`${getBaseUrl()}/api/drive/managed-files/${encodeURIComponent(id)}/content${download ? '?download=true' : ''}`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('authToken')}` }
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.message || 'No fue posible abrir el archivo.');
    }
    return response.blob();
  }
};

export default frontendApiService;
