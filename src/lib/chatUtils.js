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

  // System prompt
  const systemPrompt = "Eres Brainstudio Intelligence, un asistente conversacional minimalista y eficiente. Responde de forma clara, concisa y profesional.";

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
    parts: [{ text: 'Entendido. Estoy aquí para ayudarte de forma clara y eficiente.' }]
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
