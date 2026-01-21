import React from 'react';
import { motion } from 'framer-motion';

const SplashScreen = () => {
  return (
    <motion.div
      initial={{ opacity: 1 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.8, delay: 3.5 }}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#F5F1FA] overflow-hidden"
    >
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.8, ease: "easeOut" }}
        className="flex flex-col items-center relative z-10"
      >
        {/* Animated Glow Behind Logo */}
        <motion.div 
          animate={{ scale: [1, 1.2, 1], opacity: [0.3, 0.6, 0.3] }}
          transition={{ duration: 3, repeat: Infinity }}
          className="absolute inset-0 bg-brand-teal/20 blur-3xl rounded-full -z-10"
        />

        {/* Logo */}
        <motion.div
          animate={{ 
            rotate: [0, 0, 360],
            scale: [0.8, 1, 1]
          }}
          transition={{ duration: 2.5, times: [0, 0.4, 1], ease: "easeInOut" }}
          className="mb-8 relative"
        >
          <img 
            src="https://horizons-cdn.hostinger.com/34bef26f-0844-4404-9c29-5bd38530bac6/818eb0a9481bbea858b332955da3caac.png" 
            alt="Brainstudio Intelligence Logo"
            className="w-24 h-24 object-contain drop-shadow-xl"
          />
        </motion.div>

        {/* Text */}
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.8, delay: 0.5 }}
          className="text-center space-y-3"
        >
          <h1 className="text-4xl md:text-5xl font-bold text-brand-charcoal tracking-tight">
            Brainstudio
            <span className="text-brand-teal"> Intelligence</span>
          </h1>
          <p className="text-brand-charcoal/60 text-lg font-medium">
            Your personal AI assistant
          </p>
        </motion.div>

        {/* Loading indicator bar */}
        <motion.div
          className="mt-12 h-1 w-48 bg-brand-lavender rounded-full overflow-hidden"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1 }}
        >
          <motion.div 
            className="h-full bg-brand-teal"
            initial={{ width: "0%" }}
            animate={{ width: "100%" }}
            transition={{ duration: 2.5, delay: 1, ease: "easeInOut" }}
          />
        </motion.div>
      </motion.div>

      {/* Background decoration */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
         <div className="absolute -top-[20%] -right-[10%] w-[50%] h-[50%] bg-brand-lavender/30 blur-3xl rounded-full opacity-50" />
         <div className="absolute -bottom-[10%] -left-[10%] w-[40%] h-[40%] bg-brand-teal/10 blur-3xl rounded-full opacity-50" />
      </div>
    </motion.div>
  );
};

export default SplashScreen;
