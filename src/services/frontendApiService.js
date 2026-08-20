import { getApiBaseUrl } from '../lib/apiBaseUrl';

const getBaseUrl = () => getApiBaseUrl();

const getOpenAiUrl = () => `${getBaseUrl()}/api/openai/v1/chat/completions`;
const getFirefliesUrl = () => `${getBaseUrl()}/api/fireflies/graphql`;

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
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: "gpt-4o",
            messages: [
              { role: "system", content: finalSystemMessage },
              { role: "user", content: prompt }
            ],
            stream: true, // Request streaming from OpenAI
            temperature: 0.7
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
      // Preserve complete source context for the model.
      parts.push(file.text);
      parts.push(' \n\n');
    });

    return parts.join('');
  },

  generateOpenAIHtmlReport: async (prompt) => {
    const text = await frontendApiService.generateCompletion(prompt, 'Genera el informe solicitado como HTML limpio y completo.');
    if (!text?.trim()) throw new Error('OpenAI devolvió una respuesta vacía.');
    return text.trim().replace(/^```html\n?/i, '').replace(/\n?```$/, '');
  },

  generateOpenAICompletion: async (prompt, systemMessage = "You are a helpful assistant.") =>
    frontendApiService.generateCompletion(prompt, systemMessage),

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
  }
};

export default frontendApiService;
