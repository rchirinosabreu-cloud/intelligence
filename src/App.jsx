import React, { useState } from 'react';
import AppLayout from './components/layout/AppLayout';
import Dashboard from './components/modules/Dashboard';
import Tasks from './components/modules/Tasks';
import Chat from './components/modules/Chat';
import Clients from './components/modules/Clients';
import { ThemeProvider } from './context/ThemeContext';

function AppContent() {
  const [activeTab, setActiveTab] = useState('dashboard');

  const renderContent = () => {
    switch(activeTab) {
      case 'dashboard': return <Dashboard />;
      case 'bria': return <Chat />;
      case 'tasks': return <Tasks />;
      case 'clients': return <Clients />;
      default: return <Dashboard />;
    }
  };

  return (
    <AppLayout activeTab={activeTab} setActiveTab={setActiveTab}>
      {renderContent()}
    </AppLayout>
  );
}

function App() {
  return (
    <ThemeProvider>
      <AppContent />
    </ThemeProvider>
  );
}

export default App;
