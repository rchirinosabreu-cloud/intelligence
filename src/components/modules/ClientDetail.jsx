import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, Layout } from 'lucide-react';
import PageHeader from '@/components/ui/PageHeader';
import ClientAvatar from '@/components/ui/ClientAvatar';
import FlowWidget from './FlowWidget';
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
    <div className="w-full max-w-7xl mx-auto space-y-6 animate-in fade-in duration-300 pb-20">
      <PageHeader
        title={
          <div className="flex items-center gap-4">
             <ClientAvatar client={client} size={48} className="shadow-lg border-2 border-white dark:border-zinc-800" />
             <span>{client.name}</span>
          </div>
        }
        subtitle={`/${client.slug} • Espacio Activo de Trabajo`}

        breadcrumbs={[
          { label: 'Clientes', href: '/clientes' },
          { label: client.name }
        ]}
      />

      {/* Main Content Area */}
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
    </div>
  );
};

export default ClientDetail;
