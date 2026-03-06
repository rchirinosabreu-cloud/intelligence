
import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'https://minutes-production.up.railway.app';
const WHISPER_API_URL = `${API_BASE_URL}/api/openai/v1/audio/transcriptions`;

export const processAudio = async (file) => {
  if (!file) {
    throw new Error('No audio file provided');
  }

  // Updated to 25MB Limit
  const MAX_SIZE = 25 * 1024 * 1024;
  if (file.size > MAX_SIZE) {
    throw new Error('El archivo no debe exceder 25MB.');
  }

  const formData = new FormData();
  formData.append('file', file);
  formData.append('model', 'whisper-1');
  formData.append('language', 'es'); // Force Spanish
  // Optional: prompt to guide style or vocabulary
  // formData.append('prompt', 'Transcribe la siguiente reunión de negocios en español.');

  try {
    const response = await axios.post(WHISPER_API_URL, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });

    if (response.data && response.data.text) {
      return response.data.text;
    } else {
      throw new Error('La respuesta de la API no contiene texto.');
    }
  } catch (error) {
    console.error('Whisper API Error:', error);
    if (error.response) {
      // Check for specific Whisper API error from the image
      if (error.response.status === 403 && error.response.data?.error?.message.includes("does not have access to model 'whisper-1'")) {
        throw new Error(`Error de transcripción (403): Tu proyecto no tiene acceso al modelo 'whisper-1'. Por favor, verifica tu plan y permisos de OpenAI.`);
      }
      throw new Error(`Error de transcripción (${error.response.status}): ${error.response.data?.error?.message || error.message}`);
    }
    throw new Error(`Error de conexión: ${error.message}`);
  }
};
