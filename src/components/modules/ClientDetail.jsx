import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import CampfireWidget from './CampfireWidget';
import DigitalIdentityWidget from './DigitalIdentityWidget';
import DeliverablesWidget from './DeliverablesWidget';
import ClientTasksWidget from './ClientTasksWidget';
import KeyLinksWidget from './KeyLinksWidget';
import AnnouncementWidget from './AnnouncementWidget';

const ClientDetail = ({ client, onBack }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const [isChatOpen, setIsChatOpen] = useState(false);

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
    <div className="w-full max-w-7xl mx-auto p-6 space-y-6 animate-in fade-in duration-300 pb-20">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button
            onClick={onBack}
            className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
        >
            <ArrowLeft className="w-5 h-5 text-zinc-500" />
        </button>
        <div>
            <h2 className="text-2xl font-bold text-zinc-900 dark:text-white">{client.name}</h2>
            <p className="text-sm text-zinc-500">/{client.slug} • Espacio Activo</p>
        </div>
      </div>

      {/* Main Grid Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 w-full">

        {/* Left Column (Main Content) */}
        <div className="lg:col-span-2 flex flex-col gap-6">
            <AnnouncementWidget scope="client" clientId={client.id} />
            <DeliverablesWidget />
            <ClientTasksWidget clientId={client.id} />
        </div>

        {/* Right Column (Sidebar) */}
        <div className="lg:col-span-1 flex flex-col gap-6">
            <CampfireWidget
                clientId={client.id}
                externalOpen={isChatOpen}
                onExternalOpenChange={setIsChatOpen}
            />
            <DigitalIdentityWidget />
            <KeyLinksWidget clientId={client.id} />
        </div>

      </div>
    </div>
  );
};

export default ClientDetail;
