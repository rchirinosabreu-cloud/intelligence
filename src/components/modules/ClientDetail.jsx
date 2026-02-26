import React from 'react';
import { ArrowLeft } from 'lucide-react';
import StudioBroadcastWidget from './StudioBroadcastWidget';
import CampfireWidget from './CampfireWidget';
import DigitalIdentityWidget from './DigitalIdentityWidget';
import DeliverablesWidget from './DeliverablesWidget';
import ClientTasksWidget from './ClientTasksWidget';
import KeyLinksWidget from './KeyLinksWidget';

const ClientDetail = ({ client, onBack }) => {
  if (!client) return <div>No se seleccionó cliente</div>;

  return (
    <div className="space-y-6 animate-in fade-in duration-300 pb-20">
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
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Left Column (Main Content) */}
        <div className="lg:col-span-2 space-y-6">
            <StudioBroadcastWidget variant="client" />
            <DeliverablesWidget />
            <ClientTasksWidget clientId={client.id} />
        </div>

        {/* Right Column (Sidebar) */}
        <div className="space-y-6">
            <CampfireWidget />
            <DigitalIdentityWidget />
            <KeyLinksWidget clientId={client.id} />
        </div>

      </div>
    </div>
  );
};

export default ClientDetail;
