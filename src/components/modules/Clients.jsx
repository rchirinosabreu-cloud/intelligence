import Select from '@/components/ui/Select';
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Search, MoreVertical, Loader2, Edit,
  Archive, RotateCcw, ChevronDown, ChevronUp,
  User as UserIcon, ExternalLink,
} from '@/components/ui/icons';
import * as Dialog from '@radix-ui/react-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getApiBaseUrl } from '@/lib/apiBaseUrl';
import { useNavigate } from 'react-router-dom';
import ClientAvatar from '@/components/ui/ClientAvatar';
import TeamAvatar from '@/components/ui/TeamAvatar';
import { toast } from 'react-hot-toast';
import EditClientDialog from './Clients/EditClientDialog';
import ClientProfileFields from './Clients/ClientProfileFields';
import ClientsSection from './Clients/operations/ClientsSection';
import { useClientOperations, useSetTeamHighlight } from './Clients/operations/clientOperationsApi';
import { emptyClientProfile, normalizeClientProfile } from '@/lib/clientProfile';
import { OPERATION_LEVELS } from '@/lib/clientOperations';
import { useAuth } from '@/context/AuthContext';
import { useQueryClient } from '@tanstack/react-query';

// Clientes (2 de octubre de 2026). Administradores y project managers ven «Operación» y «Equipo», que
// sustituyen al Excel «PENDIENTES»; el directorio de siempre queda en su propia pestaña y es lo único
// que ven los demás. La «salud» manual y su bitácora se retiraron: el avance se calcula.

const MANAGER_ROLES = ['ADMIN', 'PROJECT_MANAGER'];

function Person({ member }) {
  if (!member?.name) return <span className="text-xs text-zinc-400">—</span>;
  return (
    <span className="inline-flex min-w-0 items-center gap-2">
      <TeamAvatar member={member} size={24} />
      <span className="truncate text-sm text-zinc-700 dark:text-zinc-300">{member.name}</span>
    </span>
  );
}

function ClientsDirectory({ clients, loading, team, onEdit, onArchiveToggle }) {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [responsibleId, setResponsibleId] = useState('all');
  const [showArchived, setShowArchived] = useState(false);
  const matches = (client) => client.name.toLowerCase().includes(searchQuery.toLowerCase())
    && (responsibleId === 'all' || client.responsible?.id === responsibleId);
  const active = clients.filter((c) => !c.isArchived && matches(c));
  const archived = clients.filter((c) => c.isArchived && matches(c));

  const row = (client) => (
    <tr key={client.id} className="transition-colors hover:bg-zinc-50 dark:hover:bg-white/[0.03]">
      <td className="px-6 py-4">
        <div className="flex items-center gap-3">
          <ClientAvatar client={client} size={32} className="rounded-lg border border-zinc-200 dark:border-white/10" />
          <span className="whitespace-nowrap font-semibold text-zinc-900 dark:text-zinc-100">{client.name}</span>
        </div>
      </td>
      <td className="px-6 py-4"><Person member={client.responsible} /></td>
      <td className="px-6 py-4"><Person member={client.projectManager} /></td>
      <td className="px-6 py-4 text-right">
        <div className="flex items-center justify-end gap-1">
          {!client.isArchived && (
            <button type="button" aria-label={`Abrir el espacio de ${client.name}`} onClick={() => navigate(`/cliente/${client.slug}`)}
              className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl text-zinc-400 transition-colors hover:bg-brand-cyan/10 hover:text-brand-cyan-deep dark:hover:text-brand-cyan">
              <ExternalLink className="h-4 w-4" />
            </button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" aria-label={`Opciones de ${client.name}`} className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-white/10 dark:hover:text-zinc-200">
                <MoreVertical className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              {!client.isArchived && (
                <DropdownMenuItem className="gap-2 py-2.5" onSelect={() => onEdit(client)}>
                  <Edit className="h-4 w-4" /><span>Editar cliente</span>
                </DropdownMenuItem>
              )}
              <DropdownMenuItem className="gap-2 py-2.5" onSelect={() => onArchiveToggle(client)}>
                {client.isArchived ? <RotateCcw className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
                <span>{client.isArchived ? 'Reactivar cliente' : 'Archivar cliente'}</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </td>
    </tr>
  );

  const head = (
    <thead>
      <tr className="border-b border-zinc-100 bg-zinc-50/60 text-xs font-medium text-zinc-500 dark:border-white/5 dark:bg-white/[0.02]">
        <th className="px-6 py-3">Cliente</th>
        <th className="px-6 py-3">Community manager</th>
        <th className="px-6 py-3">Project manager</th>
        <th className="px-6 py-3"><span className="sr-only">Acciones</span></th>
      </tr>
    </thead>
  );

  return (
    <div className="space-y-6">
      <div className="brain-glass flex flex-col gap-3 p-3 lg:flex-row lg:items-center">
        <label className="relative flex-1">
          <span className="sr-only">Buscar cliente</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
          <input type="text" placeholder="Buscar cliente…" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
            className="min-h-11 w-full rounded-xl border border-transparent bg-zinc-100 pl-10 pr-4 text-sm text-zinc-900 focus:border-primary/40 focus:outline-none dark:bg-white/5 dark:text-zinc-100" />
        </label>
        <div className="flex items-center gap-2 rounded-xl bg-zinc-100 pl-3 dark:bg-white/5">
          <UserIcon className="h-4 w-4 shrink-0 text-zinc-400" />
          <Select value={responsibleId} onChange={(e) => setResponsibleId(e.target.value)} aria-label="Community manager" className="min-h-11 border-none bg-transparent pl-0 pr-9 text-sm">
            <option value="all">Todos los CM</option>
            {team.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}
          </Select>
        </div>
      </div>

      <section className="overflow-hidden rounded-3xl border border-zinc-200 bg-white dark:border-white/10 dark:bg-zinc-900" aria-label="Clientes activos">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            {head}
            <tbody className="divide-y divide-zinc-100 dark:divide-white/5">
              {loading ? (
                <tr><td colSpan={4} className="p-16 text-center"><Loader2 className="mx-auto h-8 w-8 animate-spin text-brand-cyan" /></td></tr>
              ) : active.length ? active.map(row) : (
                <tr><td colSpan={4} className="p-16 text-center text-sm text-zinc-500">Ningún cliente activo con estos filtros.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <div className="border-t border-zinc-200 pt-6 dark:border-white/5">
        <button type="button" onClick={() => setShowArchived(!showArchived)} aria-expanded={showArchived}
          className="flex min-h-11 items-center gap-2 text-sm font-semibold text-zinc-500 transition-colors hover:text-zinc-900 dark:hover:text-zinc-100">
          {showArchived ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          Clientes archivados ({archived.length})
        </button>
        {showArchived && (
          <section className="mt-4 overflow-hidden rounded-3xl border border-zinc-200 bg-zinc-50 dark:border-white/10 dark:bg-white/5" aria-label="Clientes archivados">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left">
                {head}
                <tbody className="divide-y divide-zinc-100 dark:divide-white/5">
                  {archived.length ? archived.map(row) : <tr><td colSpan={4} className="p-10 text-center text-sm text-zinc-400">No hay clientes archivados.</td></tr>}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

const Clients = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { currentUser } = useAuth();
  const canManage = MANAGER_ROLES.includes(String(currentUser?.role || '').toUpperCase());
  const [clients, setClients] = useState([]);
  const [team, setTeam] = useState([]);
  const [loading, setLoading] = useState(true);
  const operations = useClientOperations({ enabled: canManage });
  const setTeamHighlight = useSetTeamHighlight();

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editingClient, setEditingClient] = useState(null);
  const [newClientName, setNewClientName] = useState('');
  const [newClientSlug, setNewClientSlug] = useState('');
  const [newClientProfile, setNewClientProfile] = useState(() => emptyClientProfile());
  const [newClientProfileErrors, setNewClientProfileErrors] = useState({});
  const [isManualSlugCreate, setIsManualSlugCreate] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  const fetchClients = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`${getApiBaseUrl()}/api/clients?isArchived=all`);
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        console.error('Error fetching clients:', errorData);
        throw new Error(errorData.error || 'Error al cargar clientes');
      }
      setClients(await res.json());
    } catch (err) {
      console.error('Error loading clients:', err);
      toast.error(err.message || 'Error al cargar clientes');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchTeam = useCallback(async () => {
    try {
      const res = await fetch(`${getApiBaseUrl()}/api/team`);
      const data = await res.json();
      setTeam(Array.isArray(data) ? data.filter((m) => m.isActive) : []);
    } catch (err) {
      console.error('Error fetching team:', err);
    }
  }, []);

  useEffect(() => {
    fetchClients();
    fetchTeam();
  }, [fetchClients, fetchTeam]);

  const evaluated = useMemo(() => (operations.data || [])
    .map((client) => ({ client, evaluation: client.evaluation }))
    .sort((a, b) => OPERATION_LEVELS.indexOf(a.evaluation.level) - OPERATION_LEVELS.indexOf(b.evaluation.level)
      || b.evaluation.reasons.length - a.evaluation.reasons.length
      || a.client.name.localeCompare(b.client.name, 'es')), [operations.data]);

  const refreshEverywhere = () => {
    for (const key of ['clients-list', 'clientsDropdown', 'client-operations', 'dashboard-assignment-clients', 'financial-record-clients']) {
      queryClient.invalidateQueries({ queryKey: [key] });
    }
  };

  const handleArchiveToggle = async (client) => {
    try {
      const res = await fetch(`${getApiBaseUrl()}/api/clients/${client.id}/archive`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isArchived: !client.isArchived }),
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        console.error('Error toggling client archive:', errorData);
        throw new Error(errorData.error || 'Error al procesar solicitud');
      }
      const updated = await res.json();
      setClients((prev) => prev.map((c) => (c.id === updated.id ? { ...c, isArchived: updated.isArchived } : c)));
      refreshEverywhere();
      toast.success(updated.isArchived ? 'Cliente archivado' : 'Cliente reactivado');
    } catch (err) {
      console.error('Error processing archive request:', err);
      toast.error(err.message || 'Error al procesar solicitud');
    }
  };

  const generateSlug = (name) => name
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');

  useEffect(() => {
    if (!isManualSlugCreate && newClientName) setNewClientSlug(generateSlug(newClientName));
    else if (!newClientName) setNewClientSlug('');
  }, [newClientName, isManualSlugCreate]);

  const handleCreateClient = async (e) => {
    e.preventDefault();
    if (!newClientName.trim() || !newClientSlug.trim()) return;
    const { name: _unusedName, ...profileFields } = newClientProfile;
    const check = normalizeClientProfile({ ...profileFields, name: newClientName }, { requireName: true });
    if (!check.valid) { setNewClientProfileErrors(check.errors); return; }

    try {
      setIsCreating(true);
      const res = await fetch(`${getApiBaseUrl()}/api/clients`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...profileFields, name: newClientName, slug: newClientSlug }),
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        console.error('Error creating client:', errorData);
        throw new Error(errorData.message || errorData.error || 'Error al crear el cliente en el servidor');
      }
      const newClient = await res.json();
      setClients((prev) => [newClient, ...prev]);
      refreshEverywhere();
      setNewClientName('');
      setNewClientSlug('');
      setNewClientProfile(emptyClientProfile());
      setNewClientProfileErrors({});
      setIsManualSlugCreate(false);
      setIsCreateModalOpen(false);
      toast.success('Cliente creado correctamente');
    } catch (err) {
      console.error('Error creating client:', err);
      toast.error(err.message);
    } finally {
      setIsCreating(false);
    }
  };

  const directory = (
    <ClientsDirectory clients={clients} loading={loading} team={team}
      onEdit={setEditingClient} onArchiveToggle={handleArchiveToggle} />
  );

  return (
    <>
      <ClientsSection canManage={canManage} evaluated={evaluated} team={team} directory={directory}
        loading={canManage && operations.isLoading}
        error={canManage && operations.isError ? 'No se pudo cargar la operación de clientes. Recarga la página para intentarlo de nuevo.' : ''}
        onOpenClient={(client) => navigate(`/clientes/operacion/${client.slug}`)}
        onSaveHighlight={async (member, text) => {
          await setTeamHighlight.mutateAsync({ memberId: member.id, text });
          toast.success(`Acción destacada de ${member.name} guardada.`);
        }}
        onNewClient={() => setIsCreateModalOpen(true)} />

      {editingClient && <EditClientDialog key={editingClient.id} client={editingClient}
        onClose={() => setEditingClient(null)}
        onSaved={(updated) => {
          setClients((previous) => previous.map((client) => (client.id === updated.id ? { ...client, ...updated } : client)));
          refreshEverywhere();
        }} />}

      <Dialog.Root open={isCreateModalOpen} onOpenChange={setIsCreateModalOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[70] bg-black/40 backdrop-blur-sm animate-in fade-in duration-200" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-[71] max-h-[90vh] w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-zinc-200 bg-white p-6 shadow-2xl animate-in zoom-in-95 duration-200 dark:border-white/10 dark:bg-zinc-900">
            <Dialog.Title className="mb-4 text-xl font-semibold text-zinc-900 dark:text-white">Crear nuevo cliente</Dialog.Title>
            <Dialog.Description className="sr-only">Nombre, dirección del espacio y ficha del cliente.</Dialog.Description>
            <form onSubmit={handleCreateClient} className="space-y-4">
              <div className="space-y-4">
                <div>
                  <label htmlFor="new-client-name" className="mb-1.5 block text-sm font-medium text-zinc-700 dark:text-zinc-300">Nombre del cliente</label>
                  <input id="new-client-name" type="text" value={newClientName}
                    onChange={(e) => { setNewClientName(e.target.value); setIsManualSlugCreate(false); }}
                    placeholder="Ej. SunPartners"
                    className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-zinc-900 transition-all focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/50 dark:border-white/10 dark:bg-zinc-800/50 dark:text-white"
                    autoFocus required />
                </div>
                <div>
                  <label htmlFor="new-client-slug" className="mb-1.5 block text-sm font-medium text-zinc-700 dark:text-zinc-300">URL (slug)</label>
                  <input id="new-client-slug" type="text" value={newClientSlug}
                    onChange={(e) => { setNewClientSlug(e.target.value); setIsManualSlugCreate(true); }}
                    placeholder="ej-sunpartners"
                    className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 font-mono text-sm text-zinc-900 transition-all focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/50 dark:border-white/10 dark:bg-zinc-800/50 dark:text-white"
                    required />
                </div>
                {/* La ficha completa del cliente, igual que en Financiero (30 de septiembre de 2026). */}
                <div className="border-t border-zinc-200 pt-4 dark:border-white/10">
                  <ClientProfileFields showName={false} value={newClientProfile} errors={newClientProfileErrors} disabled={isCreating}
                    onChange={(patch) => {
                      setNewClientProfileErrors((current) => { const next = { ...current }; for (const key of Object.keys(patch)) delete next[key]; return next; });
                      setNewClientProfile((current) => ({ ...current, ...patch }));
                    }} />
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-4">
                <Dialog.Close asChild>
                  <button type="button" className="min-h-11 rounded-xl px-4 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-white/5">Cancelar</button>
                </Dialog.Close>
                <button type="submit" disabled={isCreating || !newClientName.trim() || !newClientSlug.trim()}
                  className="flex min-h-11 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50">
                  {isCreating ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Crear espacio'}
                </button>
              </div>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
};

export default Clients;
