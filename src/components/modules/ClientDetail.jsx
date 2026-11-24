import React from 'react';
import { ArrowLeft, Layout } from '@/components/ui/icons';
import PageHeader from '@/components/ui/PageHeader';
import ClientAvatar from '@/components/ui/ClientAvatar';
import DigitalIdentityWidget from './DigitalIdentityWidget';
import ClientTasksWidget from './ClientTasksWidget';
import KeyLinksWidget from './KeyLinksWidget';
import SocialAccountsWidget from './SocialAccountsWidget';
import { useAuth } from '@/context/AuthContext';
import { usePageLabel } from '@/components/layout/BackToOrigin';

const ClientDetail = ({ client, onBack }) => {
  const { currentUser } = useAuth();
  const canManageSocial = ['ADMIN', 'PROJECT_MANAGER'].includes(String(currentUser?.role || '').toUpperCase());
  usePageLabel(client?.name ? `Espacio · ${client.name}` : null);

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

        {/* Anuncios, Entregables y Chat Flow salieron del espacio del cliente (Rodny, 24 de noviembre de 2026:
            «esas funciones ya no me sirven para nada»). No reponerlos; sus datos no se borraron. */}
        {/* Left Column (Main Content) */}
        <div className="lg:col-span-2 flex flex-col gap-6">
            <ClientTasksWidget clientId={client.id} />
        </div>

        {/* Right Column (Sidebar). `lg:self-start`: la rejilla estiraba esta columna a la altura de la
            izquierda y dos widgets con `h-full` (Identidad Digital, Enlaces clave) reclamaban cada uno
            esa altura entera, así que el flex aplastaba a Redes conectadas hasta dejar
            solo la cabecera (30 de septiembre de 2026). Con la columna a su altura natural, `h-full`
            deja de significar nada y cada tarjeta mide lo que contiene. */}
        <div className="lg:col-span-1 lg:self-start flex flex-col gap-6">
            <SocialAccountsWidget clientId={client.id} canManage={canManageSocial} />
            <DigitalIdentityWidget client={client} />
            <KeyLinksWidget clientId={client.id} />
        </div>

      </div>
    </div>
  );
};

export default ClientDetail;
