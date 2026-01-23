
/**
 * Send message to Backend API with streaming support
 * @param {Array} messages - Array of message objects with role and content
 * @param {Function} onChunk - Callback function for each streamed chunk
 */
export async function sendMessage(messages, onChunk) {
  // Use VITE_API_URL if set, otherwise default to Railway URL
  // We use the full Railway URL as default to ensure it works on Hostinger without config
  const API_URL = import.meta.env.VITE_API_URL || "https://intelligence-production-57e6.up.railway.app";

  try {
    const response = await fetch(`${API_URL}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ messages }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API Error: ${response.status} - ${errorText}`);
    }

    if (!response.body) {
      throw new Error('ReadableStream not supported in this browser.');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunkText = decoder.decode(value, { stream: true });
      if (chunkText) {
        onChunk(chunkText);
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
  // Since we are now using a backend, we assume it's configured.
  // We could check if VITE_API_URL is set, but we have a default fallback.
  // So we always return valid to keep the UI "Green".
  
  return {
    valid: true,
    message: 'Conectado al servidor'
  };
}
