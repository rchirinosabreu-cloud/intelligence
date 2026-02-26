import React, { useState, useEffect } from 'react';
import { Card } from '@/components/ui/Card';
import { Plus, Users, Search, MoreVertical, ExternalLink, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import * as Dialog from '@radix-ui/react-dialog';
import { cn } from '@/lib/utils';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';
import ClientDetail from './ClientDetail';

const Clients = () => {
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');

  // This is the variable that caused the ReferenceError.
  // Ensuring it is declared at the top level of the component scope.
  const [selectedClient, setSelectedClient] = useState(null);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newClientName, setNewClientName] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const fetchClients = async () => {
    try {
      setLoading(true);
      const baseUrl = getApiBaseUrl();
      const res = await fetch(`${baseUrl}/api/db/clients`);
      if (!res.ok) throw new Error('Error al cargar clientes');
      const data = await res.json();
      setClients(data);
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
    if (!newClientName.trim()) return;

    try {
      setIsCreating(true);
      const baseUrl = getApiBaseUrl();
      const res = await fetch(`${baseUrl}/api/db/clients`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newClientName }),
      });

      if (!res.ok) throw new Error('Error al crear cliente');

      await fetchClients(); // Refresh list
      setNewClientName('');
      setIsModalOpen(false);
    } catch (err) {
      console.error("Error creating client:", err);
      alert(err.message);
    } finally {
      setIsCreating(false);
    }
  };

  const filteredClients = clients.filter(client =>
    client.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Render Client Detail if a client is selected
  if (selectedClient) {
    return (
      <ClientDetail
        client={selectedClient}
        onBack={() => setSelectedClient(null)}
      />
    );
  }

  // Otherwise render Client List
  return (
    <div className="space-y-8 p-6 pb-20">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold text-zinc-900 dark:text-white mb-2 tracking-tight">Clientes</h2>
          <p className="text-zinc-500 dark:text-zinc-400">Gestiona los espacios de trabajo y activos de tus clientes.</p>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 group-focus-within:text-indigo-500 transition-colors" />
            <input
              type="text"
              placeholder="Buscar cliente..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 pr-4 py-2.5 bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-white/10 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all w-64 shadow-sm"
            />
          </div>

          <Dialog.Root open={isModalOpen} onOpenChange={setIsModalOpen}>
            <Dialog.Trigger asChild>
              <button className="flex items-center gap-2 px-5 py-2.5 bg-zinc-900 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-200 text-white dark:text-zinc-900 rounded-xl font-medium transition-all shadow-lg hover:shadow-xl hover:-translate-y-0.5 active:translate-y-0">
                <Plus className="w-4 h-4" />
                <span>Nuevo Cliente</span>
              </button>
            </Dialog.Trigger>

            <Dialog.Portal>
              <Dialog.Overlay className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 animate-in fade-in duration-200" />
              <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-white/10 p-6 rounded-2xl shadow-2xl z-50 animate-in zoom-in-95 duration-200">
                <Dialog.Title className="text-xl font-semibold text-zinc-900 dark:text-white mb-4">
                  Crear Nuevo Cliente
                </Dialog.Title>

                <form onSubmit={handleCreateClient} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1.5">
                      Nombre del Cliente
                    </label>
                    <input
                      type="text"
                      value={newClientName}
                      onChange={(e) => setNewClientName(e.target.value)}
                      placeholder="Ej. SunPartners"
                      className="w-full px-4 py-2.5 bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-white/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                      autoFocus
                    />
                  </div>

                  <div className="flex justify-end gap-3 pt-2">
                    <Dialog.Close asChild>
                      <button type="button" className="px-4 py-2 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-white/5 rounded-lg transition-colors font-medium text-sm">
                        Cancelar
                      </button>
                    </Dialog.Close>
                    <button
                      type="submit"
                      disabled={isCreating || !newClientName.trim()}
                      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-medium transition-colors shadow-lg shadow-indigo-500/20 text-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                      {isCreating ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Crear Espacio'}
                    </button>
                  </div>
                </form>
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog.Root>
        </div>
      </div>

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
          <button onClick={fetchClients} className="mt-4 px-4 py-2 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-white/10 rounded-lg text-sm shadow-sm hover:bg-zinc-50 transition-colors">
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
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-medium transition-colors shadow-lg shadow-indigo-500/20 text-sm"
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
                <Card
                  onClick={() => setSelectedClient(client)}
                  className="group h-full flex flex-col cursor-pointer hover:border-indigo-500/30 dark:hover:border-indigo-400/30 transition-all duration-300"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="relative">
                        <div className="w-12 h-12 rounded-xl overflow-hidden bg-zinc-100 dark:bg-zinc-800 shadow-sm border border-zinc-200 dark:border-white/5">
                            {client.logoUrl ? (
                                <img src={client.logoUrl} alt={client.name} className="w-full h-full object-cover" />
                            ) : (
                                <div className="w-full h-full flex items-center justify-center text-zinc-400">
                                    <Users className="w-6 h-6" />
                                </div>
                            )}
                        </div>
                        <div className={`absolute -bottom-1 -right-1 w-3 h-3 rounded-full border-2 border-white dark:border-zinc-900 ${client.status === 'active' ? 'bg-emerald-500' : 'bg-zinc-400'}`} />
                    </div>

                    <button className="p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors opacity-0 group-hover:opacity-100">
                        <MoreVertical className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="flex-1">
                    <h3 className="font-semibold text-zinc-900 dark:text-white text-lg mb-1 truncate">
                        {client.name}
                    </h3>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 font-mono">
                        /{client.slug}
                    </p>
                  </div>

                  <div className="mt-6 pt-4 border-t border-zinc-100 dark:border-white/5 flex items-center justify-between">
                    <div className="flex items-center gap-3 text-xs text-zinc-500 dark:text-zinc-400">
                        <span className="flex items-center gap-1">
                            <ExternalLink className="w-3 h-3" />
                            Space
                        </span>
                        {client._count?.files > 0 && (
                             <span>• {client._count.files} Archivos</span>
                        )}
                        {client._count?.links > 0 && (
                             <span>• {client._count.links} Links</span>
                        )}
                    </div>
                    <span className="text-xs px-2 py-1 rounded-full bg-zinc-100 dark:bg-white/5 text-zinc-600 dark:text-zinc-400 font-medium">
                        {new Date(client.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                </Card>
              </motion.div>
            ))}
          </AnimatePresence>
        </motion.div>
      )}
    </div>
  );
};

export default Clients;
