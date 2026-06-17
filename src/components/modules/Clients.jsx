
import React, { useState, useEffect } from 'react';
import { Card } from '@/components/ui/Card';
import { Plus, Users, Search, MoreVertical, ExternalLink, Loader2, Edit, Briefcase } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import PageHeader from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/button';
import * as Dialog from '@radix-ui/react-dialog';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { cn } from '@/lib/utils';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';
import { useNavigate } from 'react-router-dom';
import ClientAvatar from '@/components/ui/ClientAvatar';

const Clients = () => {
  const navigate = useNavigate();
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Create Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newClientName, setNewClientName] = useState('');
  const [newClientSlug, setNewClientSlug] = useState('');
  const [isManualSlugCreate, setIsManualSlugCreate] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  // Edit Modal State
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingClient, setEditingClient] = useState(null);
  const [editClientName, setEditClientName] = useState('');
  const [editClientSlug, setEditClientSlug] = useState('');
  const [isManualSlugEdit, setIsManualSlugEdit] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);

  const generateSlug = (name) => {
    return name
      .toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // remove accents
      .replace(/[^a-z0-9\s-]/g, '') // remove invalid chars
      .trim()
      .replace(/\s+/g, '-'); // replace spaces with dashes
  };

  // Auto-complete slug when typing name (Create)
  useEffect(() => {
    if (!isManualSlugCreate && newClientName) {
      setNewClientSlug(generateSlug(newClientName));
    } else if (!newClientName) {
      setNewClientSlug('');
    }
  }, [newClientName, isManualSlugCreate]);

  // Auto-complete slug when typing name (Edit)
  useEffect(() => {
    if (!isManualSlugEdit && editClientName) {
      setEditClientSlug(generateSlug(editClientName));
    }
  }, [editClientName, isManualSlugEdit]);

  const handleOpenEditModal = (client) => {
    setEditingClient(client);
    setEditClientName(client.name);
    setEditClientSlug(client.slug);
    setIsManualSlugEdit(true);
    setIsEditModalOpen(true);
  };

  const fetchClients = async () => {
    try {
      setLoading(true);
      const baseUrl = getApiBaseUrl();
      const res = await fetch(`${baseUrl}/api/db/clients`);
      if (!res.ok) throw new Error('Error al cargar clientes');
      const data = await res.json();
      setClients(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchClients();
  }, []);

  const handleCreateClient = async (e) => {
    e.preventDefault();
    if (!newClientName.trim() || !newClientSlug.trim()) return;

    try {
      setIsCreating(true);
      const baseUrl = getApiBaseUrl();
      const res = await fetch(`${baseUrl}/api/clients`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newClientName, slug: newClientSlug }),
      });

      if (!res.ok) throw new Error('Error al crear el cliente en el servidor');

      const newClient = await res.json();
      setClients(prev => [newClient, ...prev]);

      setNewClientName('');
      setNewClientSlug('');
      setIsManualSlugCreate(false);
      setIsModalOpen(false);
    } catch (err) {
      console.error("Error creating client:", err);
      alert(err.message);
    } finally {
      setIsCreating(false);
    }
  };

  const handleUpdateClient = async (e) => {
    e.preventDefault();
    if (!editClientName.trim() || !editClientSlug.trim() || !editingClient) return;

    try {
      setIsUpdating(true);
      const baseUrl = getApiBaseUrl();
      const response = await fetch(`${baseUrl}/api/clients/${editingClient.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editClientName, slug: editClientSlug })
      });

      if (!response.ok) {
        throw new Error('Failed to update client');
      }

      const updatedClient = await response.json();
      setClients(prev => prev.map(c => c.id === updatedClient.id ? updatedClient : c));

      setIsEditModalOpen(false);
      setEditingClient(null);
    } catch (err) {
      console.error(err);
      alert(err.message);
    } finally {
      setIsUpdating(false);
    }
  };

  const filteredClients = clients.filter(client =>
    client.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-8 pb-20">
      <PageHeader
        title="Clientes"
        subtitle="Gestiona los espacios de trabajo y activos de tus clientes."

      >
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full sm:w-auto">
          <div className="relative group flex-1 sm:flex-none">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 group-focus-within:text-indigo-600 transition-colors" />
            <input
              type="text"
              placeholder="Buscar cliente..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full sm:w-64 pl-10 pr-4 py-2.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-white/10 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-600/20 transition-all"
            />
          </div>

          <Dialog.Root open={isModalOpen} onOpenChange={setIsModalOpen}>
            <Dialog.Trigger asChild>
              <Button size="lg">
                <Plus className="w-4 h-4 mr-2" />
                Nuevo Cliente
              </Button>
            </Dialog.Trigger>

            <Dialog.Portal>
              <Dialog.Overlay className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 animate-in fade-in duration-200" />
              <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-white/10 p-6 rounded-2xl shadow-2xl z-50 animate-in zoom-in-95 duration-200">
                <Dialog.Title className="text-xl font-semibold text-zinc-900 dark:text-white mb-4">
                  Crear nuevo cliente
                </Dialog.Title>

                <form onSubmit={handleCreateClient} className="space-y-4">
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
                        Nombre del cliente
                      </label>
                      <input
                        type="text"
                        value={newClientName}
                        onChange={(e) => {
                          setNewClientName(e.target.value);
                          setIsManualSlugCreate(false);
                        }}
                        placeholder="Ej. SunPartners"
                        className="w-full px-4 py-2.5 bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-white/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all text-zinc-900 dark:text-white"
                        autoFocus
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
                        URL (Slug)
                      </label>
                      <input
                        type="text"
                        value={newClientSlug}
                        onChange={(e) => {
                          setNewClientSlug(e.target.value);
                          setIsManualSlugCreate(true);
                        }}
                        placeholder="ej-sunpartners"
                        className="w-full px-4 py-2.5 bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-white/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all font-mono text-sm text-zinc-900 dark:text-white"
                        required
                      />
                    </div>
                  </div>

                  <div className="flex justify-end gap-3 pt-4">
                    <Dialog.Close asChild>
                      <button type="button" className="px-4 py-2 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-white/5 rounded-xl transition-colors font-medium text-sm">
                        Cancelar
                      </button>
                    </Dialog.Close>
                    <button
                      type="submit"
                      disabled={isCreating || !newClientName.trim() || !newClientSlug.trim()}
                      className="px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl font-medium transition-colors shadow-lg shadow-primary/20 text-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                      {isCreating ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Crear espacio'}
                    </button>
                  </div>
                </form>
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog.Root>
        </div>
      </PageHeader>

      {/* Edit Client Modal */}
      <Dialog.Root open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 animate-in fade-in duration-200" />
          <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-white/10 p-6 rounded-2xl shadow-2xl z-50 animate-in zoom-in-95 duration-200">
            <Dialog.Title className="text-xl font-semibold text-zinc-900 dark:text-white mb-4">
              Editar cliente
            </Dialog.Title>

            <form onSubmit={handleUpdateClient} className="space-y-4">
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
                    Nombre del cliente
                  </label>
                  <input
                    type="text"
                    value={editClientName}
                    onChange={(e) => {
                      setEditClientName(e.target.value);
                      setIsManualSlugEdit(false);
                    }}
                    placeholder="Ej. SunPartners"
                    className="w-full px-4 py-2.5 bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-white/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all text-zinc-900 dark:text-white"
                    autoFocus
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
                    URL (Slug)
                  </label>
                  <input
                    type="text"
                    value={editClientSlug}
                    onChange={(e) => {
                      setEditClientSlug(e.target.value);
                      setIsManualSlugEdit(true);
                    }}
                    placeholder="ej-sunpartners"
                    className="w-full px-4 py-2.5 bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-white/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all font-mono text-sm text-zinc-900 dark:text-white"
                    required
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <Dialog.Close asChild>
                  <button type="button" className="px-4 py-2 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-white/5 rounded-xl transition-colors font-medium text-sm">
                    Cancelar
                  </button>
                </Dialog.Close>
                <button
                  type="submit"
                  disabled={isUpdating || !editClientName.trim() || !editClientSlug.trim()}
                  className="px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl font-medium transition-colors shadow-lg shadow-primary/20 text-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {isUpdating ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Guardar cambios'}
                </button>
              </div>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Content Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
           {[...Array(4)].map((_, i) => (
             <div key={i} className="h-48 rounded-2xl bg-zinc-100 dark:bg-zinc-800/50 animate-pulse" />
           ))}
        </div>
      ) : error ? (
        <div className="p-8 text-center rounded-2xl bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-900/30">
          <p className="text-red-600 dark:text-red-400 font-medium">Error: {error}</p>
          <button onClick={fetchClients} className="mt-4 px-4 py-2 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-white/10 rounded-xl text-sm shadow-sm hover:bg-zinc-50 transition-colors">
            Reintentar
          </button>
        </div>
      ) : filteredClients.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-16 h-16 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center mb-4">
                <Users className="w-8 h-8 text-zinc-400" />
            </div>
            <h3 className="text-lg font-medium text-zinc-900 dark:text-white mb-1">No hay clientes aún</h3>
            <p className="text-zinc-500 dark:text-zinc-400 max-w-sm mx-auto mb-6">
               {searchQuery ? 'No se encontraron resultados para tu búsqueda.' : 'Comienza creando tu primer espacio de cliente para gestionar sus activos.'}
            </p>
            {!searchQuery && (
              <button
                onClick={() => setIsModalOpen(true)}
                className="px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl font-medium transition-colors shadow-lg shadow-primary/20 text-sm"
              >
                Crear primer cliente
              </button>
            )}
        </div>
      ) : (
        <motion.div
          layout
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6"
        >
          <AnimatePresence>
            {filteredClients.map((client) => (
              <motion.div
                key={client.id}
                layout
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.2 }}
              >
                <div
                  onClick={() => navigate(`/cliente/${client.slug}`)}
                  className="group h-full flex flex-col cursor-pointer transition-all duration-300"
                >
                  <Card className="h-full flex flex-col bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm hover:border-primary/30 dark:hover:border-primary/30">
                    <div className="flex items-start justify-between mb-4">
                      <div className="relative">
                          <ClientAvatar client={client} size={48} className="w-12 h-12" />
                          <div className={`absolute -bottom-1 -right-1 w-3 h-3 rounded-full border-2 border-white dark:border-slate-900 ${client.status === 'active' ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                      </div>

                      <DropdownMenu.Root>
                        <DropdownMenu.Trigger asChild>
                          <button
                            onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
                            className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors opacity-0 group-hover:opacity-100 focus:outline-none"
                          >
                              <MoreVertical className="w-4 h-4" />
                          </button>
                        </DropdownMenu.Trigger>
                        <DropdownMenu.Portal>
                          <DropdownMenu.Content
                            align="end"
                            sideOffset={5}
                            className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-lg p-1 min-w-[150px] z-50 animate-in fade-in-80 zoom-in-95"
                          >
                            <DropdownMenu.Item
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                handleOpenEditModal(client);
                              }}
                              className="flex items-center gap-2 px-3 py-2 text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl cursor-pointer outline-none"
                            >
                              <Edit className="w-4 h-4" />
                              <span>Editar</span>
                            </DropdownMenu.Item>
                          </DropdownMenu.Content>
                        </DropdownMenu.Portal>
                      </DropdownMenu.Root>
                    </div>

                    <div className="flex-1">
                      <h3 className="font-semibold text-slate-900 dark:text-white text-lg mb-1 truncate">
                          {client.name}
                      </h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                          /{client.slug}
                      </p>
                    </div>

                    <div className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                      <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
                          <span className="flex items-center gap-1">
                              <ExternalLink className="w-3 h-3" />
                              Space
                          </span>
                          {client._count?.clientFiles > 0 && (
                              <span>• {client._count.clientFiles} archivos</span>
                          )}
                          {client._count?.links > 0 && (
                              <span>• {client._count.links} Links</span>
                          )}
                      </div>
                      <span className="text-xs px-2 py-1 rounded-full text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800/50 font-medium">
                          {new Date(client.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                  </Card>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </motion.div>
      )}
    </div>
  );
};

export default Clients;
