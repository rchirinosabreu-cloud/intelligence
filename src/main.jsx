import React from 'react';
import ReactDOM from 'react-dom/client';
import App from '@/App';
import '@/index.css';

// React.StrictMode disabled to prevent drag and drop issues in development
ReactDOM.createRoot(document.getElementById('root')).render(
  <App />
);
