/**
 * Send message to Gemini API with streaming support
 * @param {Array} messages - Array of message objects with role and content
 * @param {Function} onChunk - Callback function for each streamed chunk
 */
export async function sendMessage(messages, onChunk) {
  const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
  const MODEL = import.meta.env.VITE_GEMINI_MODEL || 'gemini-1.5-flash';

  if (!GEMINI_API_KEY) {
    throw new Error('VITE_GEMINI_API_KEY no está configurado. Por favor, configura tu API key en el archivo .env');
  }

  // System prompt based on user requirements
  const systemPrompt = `Eres Brain Intelligence, el sistema operativo de inteligencia artificial de la agencia Brain Studio. Tu propósito es centralizar los procesos creativos, estratégicos y operativos, actuando como un consultor experto.

Tono de voz: Profesional, estratégico, proactivo y profundamente creativo. No solo respondes preguntas; investigas, conectas puntos y sugieres los siguientes pasos.

Instrucciones de Operación:
1. Investigación Total: Asume que debes consultar documentación de clientes específicos (ej. La Sazón de Iris, Salsipuedes, New Pueblito Suites, etc.). Aunque ahora no tengas acceso real a archivos, actúa como si tuvieras acceso a su contexto histórico.
2. Gestión de Pendientes: Identifica tareas no resueltas en las conversaciones y recuérdalas.
3. Multimodalidad: Estás preparado para analizar briefings y piezas gráficas.
4. Seguridad: Mantén separación estricta entre información de clientes.
5. Objetivo Final: Ayudar a escalar la agencia permitiendo que cualquier miembro del equipo tenga el contexto completo de un proyecto en segundos.

Actúa como un sistema híbrido avanzado.`;

  // Format messages for Gemini API
  const contents = messages.map(msg => ({
    role: msg.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: msg.content }]
  }));

  // Add system prompt as first message
  contents.unshift({
    role: 'user',
    parts: [{ text: systemPrompt }]
  });
  contents.splice(1, 0, {
    role: 'model',
    parts: [{ text: 'Entendido. Soy Brain Intelligence, listo para operar con capacidad estratégica y creativa para Brain Studio.' }]
  });

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:streamGenerateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents,
          generationConfig: {
            temperature: 0.7,
            topK: 40,
            topP: 0.95,
            maxOutputTokens: 2048,
          },
        }),
      }
    );

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`API Error: ${errorData.error?.message || 'Unknown error'}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value);
      const lines = chunk.split('\n');

      for (const line of lines) {
        if (line.trim() && line.trim() !== '[' && line.trim() !== ']') {
          try {
            // Remove trailing comma if present
            const cleanLine = line.trim().replace(/,$/, '');
            const data = JSON.parse(cleanLine);
            
            if (data.candidates && data.candidates[0]?.content?.parts) {
              const text = data.candidates[0].content.parts[0]?.text || '';
              if (text) {
                onChunk(text);
              }
            }
          } catch (e) {
            // Skip invalid JSON lines
            continue;
          }
        }
      }
    }
  } catch (error) {
    console.error('Error in sendMessage:', error);
    throw error;
  }
}

/**
 * Format message for display
 * @param {Object} message - Message object
 * @returns {String} Formatted message
 */
export function formatMessage(message) {
  return message.content.trim();
}

/**
 * Validate API configuration
 * @returns {Object} Validation result with status and message
 */
export function validateApiConfig() {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
  
  if (!apiKey) {
    return {
      valid: false,
      message: 'VITE_GEMINI_API_KEY no está configurado'
    };
  }

  return {
    valid: true,
    message: 'Configuración válida'
  };
}
