import React, { useState } from 'react';
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { Loader2 } from '@/components/ui/icons';
import { useAuth } from '@/context/AuthContext';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';
import TaskSidePanel from '../../TaskSidePanel';
import ClientOperationPage from './ClientOperationPage';
import ClientOperationDialog from './ClientOperationDialog';
import ClientProjects from './ClientProjects';
import ClientAdBudgets from '@/components/modules/AdBudgets/ClientAdBudgets';
import {
  useAddObservation, useAuthorizeWork, useClientOperation, useConfirmMonthlyClose, useLiftSuspension, useRefreshExternalPlan, useReopenMonthlyClose, useDeleteObservation, useMarkPiecePublished, useSaveOperationProfile, useSetMonthlyReport, useSuspendClient,
  useUndoPiecePublished, useClientProjects, useSaveClientProject,
} from './clientOperationsApi';
import { bogotaDate } from '@/lib/colombiaBusinessDays';
import { clientOperationPlanPath } from '@/lib/clientOperationAlerts';
import { useNavigateFrom, usePageLabel } from '@/components/layout/BackToOrigin';

// `/clientes/operacion/:slug`: la página completa de un cliente (Rodny, 2 de octubre de 2026: «necesito
// entrar a una sección completa»). Solo administradores y project managers.

const MANAGER_ROLES = ['ADMIN', 'PROJECT_MANAGER'];

export default function ClientOperationRoute() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  // Lo que se abre desde aquí ofrece volver a esta misma página (30 de octubre de 2026).
  const navigateFrom = useNavigateFrom();
  const { currentUser } = useAuth();
  const canManage = MANAGER_ROLES.includes(String(currentUser?.role || '').toUpperCase());
  const { data: client, isLoading, error, refetch } = useClientOperation(canManage ? slug : null);
  const viewerId = currentUser?.id || currentUser?.userId;
  const projectQuery = useClientProjects(canManage ? client?.id : null, viewerId);
  const saveProject = useSaveClientProject(client?.id, viewerId);
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
  const confirmClose = useConfirmMonthlyClose();
  const authorizeWork = useAuthorizeWork();
  const suspendClient = useSuspendClient();
  const liftSuspension = useLiftSuspension();
  const reopenClose = useReopenMonthlyClose();
  const refreshExternalPlan = useRefreshExternalPlan();
  const markPublished = useMarkPiecePublished();
  const undoPublished = useUndoPiecePublished();
  const addObservation = useAddObservation();
  const deleteObservation = useDeleteObservation();
  const [editing, setEditing] = useState(false);
  const renewing = searchParams.get('action') === 'renew-contract';
  const closeEditing = () => { setEditing(false); if (renewing) { const next = new URLSearchParams(searchParams); next.delete('action'); setSearchParams(next, { replace: true }); } };
  const [creatingTask, setCreatingTask] = useState(false);
  // El día se fija una vez por visita, nunca un `new Date()` en cada render (incidente del 18 de septiembre).
  const [today] = useState(() => bogotaDate());
  usePageLabel(client?.name ? `Operación · ${client.name}` : null);

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

  return (
    <>
      <ClientOperationPage client={client} evaluation={client.evaluation} today={today} canManage
        currentUserId={currentUser?.id} isAdmin={String(currentUser?.role || '').toUpperCase() === 'ADMIN'}
        adBudgetsSection={<ClientAdBudgets clientId={client.id} className="mt-4 border-t border-zinc-100 dark:border-white/5 pt-3" />}
        projectsSection={<ClientProjects key={`${client.id}:${viewerId}`} projects={projectQuery.data || []} team={team}
          loading={projectQuery.isLoading} error={projectQuery.error}
          onRetry={async () => {
            const result = await projectQuery.refetch();
            if (result.error) throw result.error;
            return result.data;
          }}
          onSave={async (project, input) => {
            const saved = await saveProject.mutateAsync({ projectId: project.id, input });
            toast.success(input.review ? 'Ficha del proyecto revisada.' : 'Borrador del proyecto guardado.');
            return saved;
          }} />}
        onAddObservation={async (text) => {
          // Si falla, el error vuelve a la tarjeta y lo escrito no se pierde.
          await addObservation.mutateAsync({ clientId: client.id, text });
          await refetch();
          toast.success('Observación guardada.');
        }}
        onDeleteObservation={async (observation) => {
          try {
            await deleteObservation.mutateAsync({ clientId: client.id, observationId: observation.id });
            await refetch();
            toast.success('Observación borrada.');
          } catch (failure) {
            toast.error(failure.message);
          }
        }}
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
        // Un error vuelve al diálogo, que lo muestra y conserva lo escrito.
        onSaveReport={async (month, data) => {
          await setReport.mutateAsync({ clientId: client.id, year: month.year, month: month.month, ...data });
          await refetch();
          toast.success(`Informe de ${month.label.toLowerCase()} actualizado.`);
        }}
        onReopenClose={async (month) => {
          try {
            await reopenClose.mutateAsync({ clientId: client.id, year: month.year, month: month.month });
            await refetch();
            toast.success(`Cierre de ${month.label.toLowerCase()} reabierto.`);
          } catch (failure) {
            toast.error(failure.message);
          }
        }}
        onRefreshExternalPlan={async () => {
          try {
            await refreshExternalPlan.mutateAsync({ clientId: client.id });
            await refetch();
            toast.success('Hoja de MIO leída.');
          } catch (failure) {
            toast.error(failure.message);
          }
        }}
        onAuthorizeWork={async (data) => {
          await authorizeWork.mutateAsync({ clientId: client.id, ...data });
          await refetch();
          toast.success('Autorización guardada.');
        }}
        onSuspend={async (data) => {
          await suspendClient.mutateAsync({ clientId: client.id, ...data });
          await refetch();
          toast.success('Cliente suspendido por cartera.');
        }}
        onLiftSuspension={async (data) => {
          await liftSuspension.mutateAsync({ clientId: client.id, ...data });
          await refetch();
          toast.success('Suspensión levantada.');
        }}
        onConfirmClose={async (month, note) => {
          await confirmClose.mutateAsync({ clientId: client.id, year: month.year, month: month.month, note });
          await refetch();
          toast.success(`Cierre de ${month.label.toLowerCase()} confirmado.`);
        }}
        onOpenPlan={(cycle) => navigateFrom(clientOperationPlanPath(client, cycle))}
        onOpenPiece={(path) => navigateFrom(path)}
        onNewTask={() => setCreatingTask(true)}
        onOpenWorkspace={() => navigateFrom(`/cliente/${client.slug}`)}
        onOpenTask={(task) => navigateFrom(`/gestion?taskId=${task.id}`)}
        onUndoPublished={async (piece) => {
          try {
            await undoPublished.mutateAsync({ clientId: client.id, itemId: piece.id });
            await refetch();
            toast.success(`«${piece.title}» volvió a su estado anterior.`);
          } catch (failure) {
            toast.error(failure.message);
          }
        }} />

      {(editing || renewing) && (
        <ClientOperationDialog client={client} team={team} initialRenew={renewing} onClose={closeEditing}
          adBudgetsSection={<ClientAdBudgets clientId={client.id} inDialog className="border-t border-zinc-100 dark:border-white/5 pt-4" />}
          onSave={async (input) => {
            await saveProfile.mutateAsync({ clientId: client.id, input });
            closeEditing();
            toast.success('Ficha operativa guardada.');
          }} />
      )}

      {/* El mismo creador de tareas de Gestión, con el cliente ya elegido: es el único de la plataforma. */}
      <TaskSidePanel isOpen={creatingTask} onClose={() => setCreatingTask(false)}
        onSuccess={() => { refetch(); }}
        clientsList={[{ id: client.id, name: client.name, slug: client.slug }]} defaultClientId={client.id} />
    </>
  );
}
