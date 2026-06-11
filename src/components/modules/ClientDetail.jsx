import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, Layout } from 'lucide-react';
import PageHeader from '@/components/ui/PageHeader';
import FlowWidget from './FlowWidget';
import DigitalIdentityWidget from './DigitalIdentityWidget';
import DeliverablesWidget from './DeliverablesWidget';
import ClientTasksWidget from './ClientTasksWidget';
import KeyLinksWidget from './KeyLinksWidget';
import AnnouncementWidget from './AnnouncementWidget';
import MoodboardCanvas from './Moodboard/MoodboardCanvas';

const ClientDetail = ({ client, onBack }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('openChat') === 'true') {
        setIsChatOpen(true);
        // Clean up URL parameter without refreshing
        const newParams = new URLSearchParams(location.search);
        newParams.delete('openChat');
        const newSearch = newParams.toString();
        navigate(`${location.pathname}${newSearch ? `?${newSearch}` : ''}`, { replace: true });
    }
  }, [location, navigate]);

  if (!client) return <div>No se seleccionó cliente</div>;

  return (
    <div className="w-full max-w-7xl mx-auto space-y-6 animate-in fade-in duration-300 pb-20">
      <PageHeader
        title={client.name}
        subtitle={`/${client.slug} • Espacio Activo de Trabajo`}

        breadcrumbs={[
          { label: 'Clientes', href: '/clientes' },
          { label: client.name }
        ]}
      />

      {/* Tabs Navigation */}
      <div className="flex border-b border-slate-200 gap-8 mb-2">
          <button
            onClick={() => setActiveTab('overview')}
            className={`pb-3 text-sm font-medium transition-colors relative ${activeTab === 'overview' ? 'text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}
          >
              Gestión General
              {activeTab === 'overview' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-indigo-600 rounded-full" />}
          </button>
          <button
            onClick={() => setActiveTab('moodboard')}
            className={`pb-3 text-sm font-medium transition-colors relative ${activeTab === 'moodboard' ? 'text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}
          >
              Inspiración (Moodboard)
              {activeTab === 'moodboard' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-indigo-600 rounded-full" />}
          </button>
      </div>

      {/* Main Content Area */}
      {activeTab === 'overview' ? (
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 w-full animate-in fade-in slide-in-from-bottom-4 duration-500">

        {/* Left Column (Main Content) */}
        <div className="lg:col-span-2 flex flex-col gap-6">
            <AnnouncementWidget scope="client" clientId={client.id} />
            <DeliverablesWidget clientId={client.id} />
            <ClientTasksWidget clientId={client.id} />
        </div>

        {/* Right Column (Sidebar) */}
        <div className="lg:col-span-1 flex flex-col gap-6">
            <FlowWidget
                clientId={client.id}
                externalOpen={isChatOpen}
                onExternalOpenChange={setIsChatOpen}
            />
            <DigitalIdentityWidget />
            <KeyLinksWidget clientId={client.id} />
        </div>

      </div>
      ) : (
        <div className="w-full h-[800px] animate-in fade-in slide-in-from-bottom-4 duration-500">
            <MoodboardCanvas clientId={client.id} />
        </div>
      )}
    </div>
  );
};

export default ClientDetail;
