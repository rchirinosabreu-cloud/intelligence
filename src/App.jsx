import React, { useState, useEffect } from 'react';
import { Helmet } from 'react-helmet';
import { AnimatePresence } from 'framer-motion';
import SplashScreen from '@/components/SplashScreen';
import ChatInterface from '@/components/ChatInterface';
import { Toaster } from '@/components/ui/toaster';

function App() {
  const [showSplash, setShowSplash] = useState(true);

  useEffect(() => {
    // Reduced duration to 2 seconds as requested
    const timer = setTimeout(() => {
      setShowSplash(false);
    }, 2000);

    return () => clearTimeout(timer);
  }, []);

  return (
    <>
      <Helmet>
        <title>Brainstudio Intelligence - AI Conversational Assistant</title>
        <meta name="description" content="Brainstudio Intelligence - A minimal ChatGPT-style conversational assistant powered by Google Gemini AI" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="true" />
      </Helmet>
      
      <div className="h-screen w-full bg-brand-mauve text-brand-charcoal font-sans antialiased overflow-hidden">
        <AnimatePresence mode="wait">
          {showSplash ? (
            <SplashScreen key="splash" />
          ) : (
            <ChatInterface key="chat" />
          )}
        </AnimatePresence>
      </div>
      
      <Toaster />
    </>
  );
}

export default App;
