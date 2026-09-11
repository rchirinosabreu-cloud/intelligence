import { createContext, useContext } from 'react';

// No provider is mounted by the production app yet. The existing completed-task feed remains intact.
export const RecognitionContext = createContext(null);
export const useRecognitionExperience = () => useContext(RecognitionContext);
