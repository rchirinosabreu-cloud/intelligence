import React, { useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { Loader2 } from '@/components/ui/icons';
import { useAuth } from '@/context/AuthContext';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';
import TaskCreateModal from '../../TaskCreateModal';
import ClientOperationPage from './ClientOperationPage';
import ClientOperationDialog from './ClientOperationDialog';
import { useClientOperation, useMarkPiecePublished, useSaveOperationProfile, useSetMonthlyReport } from './clientOperationsApi';
import { bogotaDate } from '@/lib/colombiaBusinessDays';

// `/clientes/operacion/:slug`: la página completa de un cliente (Rodny, 2 de octubre de 2026: «necesito
// entrar a una sección completa»). Solo administradores y project managers.

const MANAGER_ROLES = ['ADMIN', 'PROJECT_MANAGER'];

export default function ClientOperationRoute() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const canManage = MANAGER_ROLES.includes(String(currentUser?.role || '').toUpperCase());
  const { data: client, isLoading, error, refetch } = useClientOperation(canManage ? slug : null);
  const { data: team = [] } = useQuery({
    queryKey: ['team-active'],
    enabled: canManage,
    staleTime: 60_000,
    queryFn: async () => {
      const response = await fetch(`${getApiBaseUrl()}/api/team`);
      if (!response.ok) throw new Error('No se pudo cargar el equipo.');
      return (await response.json()).filter((member) => member.isActive);
    },
  });
  const saveProfile = useSaveOperationProfile();
  const setReport = useSetMonthlyReport();
  const markPublished = useMarkPiecePublished();
  const [editing, setEditing] = useState(false);
  const [creatingTask, setCreatingTask] = useState(false);
  // El día se fija una vez por visita, nunca un `new Date()` en cada render (incidente del 18 de septiembre).
  const [today] = useState(() => bogotaDate());

  if (!canManage) return <Navigate to="/clientes" replace />;
  if (isLoading) return <div className="flex min-h-[50vh] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-brand-cyan" /></div>;
  if (error || !client) {
    return (
      <div className="mx-auto max-w-xl space-y-3 py-20 text-center">
        <p className="text-lg font-semibold">{error?.status === 404 ? 'No encontramos ese cliente.' : 'No se pudo cargar la operación del cliente.'}</p>
        <button type="button" onClick={() => navigate('/clientes')} className="min-h-11 rounded-xl px-4 text-sm font-medium text-brand-cyan-deep hover:bg-brand-cyan/10 dark:text-brand-cyan">Volver a Clientes</button>
      </div>
    );
  }

  const planId = client.cycles?.current?.pieces?.[0]?.planId;

  return (
    <>
      <ClientOperationPage client={client} evaluation={client.evaluation} today={today} canManage
        onEditProfile={() => setEditing(true)}
        onMarkPublished={async (piece) => {
          try {
            await markPublished.mutateAsync({ clientId: client.id, itemId: piece.id });
            await refetch();
            toast.success(`«${piece.title}» quedó como publicada.`);
          } catch (failure) {
            toast.error(failure.message);
          }
        }}
        onMarkReport={async (month) => {
          try {
            await setReport.mutateAsync({ clientId: client.id, year: month.year, month: month.month, delivered: true });
            await refetch();
            toast.success(`Informe de ${month.label.toLowerCase()} marcado como entregado.`);
          } catch (failure) {
            toast.error(failure.message);
          }
        }}
        onOpenPlan={() => navigate(planId ? `/parrillas/${planId}` : '/parrillas')}
        onNewTask={() => setCreatingTask(true)}
        onOpenWorkspace={() => navigate(`/cliente/${client.slug}`)} />

      {editing && (
        <ClientOperationDialog client={client} team={team} onClose={() => setEditing(false)}
          onSave={async (input) => {
            await saveProfile.mutateAsync({ clientId: client.id, input });
            setEditing(false);
            toast.success('Ficha operativa guardada.');
          }} />
      )}

      <TaskCreateModal isOpen={creatingTask} onClose={() => setCreatingTask(false)}
        onSuccess={() => { refetch(); }}
        clientsList={[{ id: client.id, name: client.name }]} defaultClientId={client.id} />
    </>
  );
}
