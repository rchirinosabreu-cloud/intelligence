import React, { useState } from 'react';
import AppLayout from './components/layout/AppLayout';
import Dashboard from './components/modules/Dashboard';
import Tasks from './components/modules/Tasks';
import Chat from './components/modules/Chat';
import Files from './components/modules/Files';

function App() {
  const [activeTab, setActiveTab] = useState('dashboard');

  const renderContent = () => {
    switch(activeTab) {
      case 'dashboard': return <Dashboard />;
      case 'bria': return <Chat />;
      case 'tasks': return <Tasks />;
      case 'files': return <Files />;
      default: return <Dashboard />;
    }
  };

  return (
    <AppLayout activeTab={activeTab} setActiveTab={setActiveTab}>
      {renderContent()}
    </AppLayout>
  );
}

export default App;
