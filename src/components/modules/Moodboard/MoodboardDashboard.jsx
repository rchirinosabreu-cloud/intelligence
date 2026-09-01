import React, { useState, useEffect } from 'react';
import {
  Plus,
  Search,
  LayoutGrid,
  Maximize2,
  User,
  Globe,
  MoreVertical,
  Trash2,
  ExternalLink,
  Loader2,
  Filter
} from '@/components/ui/icons';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'react-hot-toast';
import PageHeader from '@/components/ui/PageHeader';
import { useConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';

const MoodboardDashboard = () => {
  const confirm = useConfirmDialog();
  const [boards, setBoards] = useState([]);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newBoard, setNewBoard] = useState({ name: '', clientId: null });
  const [creating, setCreating] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [boardsRes, clientsRes] = await Promise.all([
        axios.get('/api/boards'),
        axios.get('/api/db/clients')
      ]);
      setBoards(boardsRes.data);
      setClients(clientsRes.data);
    } catch (error) {
      console.error("Error fetching moodboards:", error);
      toast.error("Error al cargar los tableros");
    } finally {
      setLoading(false);
    }
  };

  const handleCreateBoard = async (e) => {
    e.preventDefault();
    if (!newBoard.name) return;
    setCreating(true);
    try {
      const response = await axios.post('/api/boards', newBoard);
      setBoards([response.data, ...boards]);
      setIsModalOpen(false);
      setNewBoard({ name: '', clientId: null });
      toast.success("Tablero creado");
      navigate(`/moodboard/${response.data.id}`);
    } catch (error) {
      toast.error("Error al crear tablero");
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteBoard = async (e, id) => {
    e.stopPropagation();
    if (!(await confirm({
      title: 'Eliminar tablero',
      description: 'El tablero y sus referencias se eliminarán permanentemente.',
      confirmLabel: 'Eliminar'
    }))) return;
    try {
      await axios.delete(`/api/boards/${id}`);
      setBoards(boards.filter(b => b.id !== id));
      toast.success("Eliminado");
    } catch (error) {
      toast.error("Error al eliminar");
    }
  };

  const filteredBoards = boards.filter(b =>
    b.name.toLowerCase().includes(search.toLowerCase()) ||
    (b.client?.name || 'Global').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="w-full max-w-7xl mx-auto space-y-6 animate-in fade-in duration-500 pb-20">
      <PageHeader
        title="Inspiración & Moodboards"
        subtitle="Lienzos creativos para la agencia y clientes"
      />

      {/* Toolbar */}
      <div className="flex flex-col md:flex-row gap-4 justify-between items-center bg-white dark:bg-zinc-900 p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm">
        <div className="relative w-full md:w-96">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
          <input
            type="text"
            placeholder="Buscar tableros o clientes..."
            className="w-full pl-10 pr-4 py-2 bg-zinc-50 dark:bg-zinc-800 border-none rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 transition-all"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <button
          onClick={() => setIsModalOpen(true)}
          className="w-full md:w-auto flex items-center justify-center gap-2 bg-[#009EB9] hover:bg-[#008CA4] text-white px-6 py-2.5 rounded-xl text-sm font-bold transition-all shadow-lg shadow-[#009EB9]/20 active:scale-95"
        >
          <Plus className="w-4 h-4" />
          Nuevo Tablero
        </button>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 text-zinc-400 gap-4">
          <Loader2 className="w-10 h-10 animate-spin text-indigo-500" />
          <p className="font-medium">Cargando tu inspiración...</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {filteredBoards.map(board => (
            <div
              key={board.id}
              onClick={() => navigate(`/moodboard/${board.id}`)}
              className="group relative flex flex-col bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden hover:shadow-xl hover:-translate-y-1 transition-all cursor-pointer"
            >
              {/* Preview Placeholder */}
              <div className="aspect-video bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center relative overflow-hidden">
                <LayoutGrid className="w-12 h-12 text-zinc-300 dark:text-zinc-700 opacity-20 group-hover:scale-110 transition-transform duration-500" />

                {/* Badge Overlay */}
                <div className="absolute top-3 left-3 flex gap-2">
                  {board.clientId ? (
                    <div className="flex items-center gap-1.5 bg-white/90 dark:bg-zinc-900/90 backdrop-blur-md px-2 py-1 rounded-lg border border-zinc-200 dark:border-zinc-700 shadow-sm">
                      <User className="w-3 h-3 text-indigo-500" />
                      <span className="text-[10px] font-bold text-zinc-600 dark:text-zinc-300 uppercase tracking-tighter truncate max-w-[100px]">
                        {board.client?.name}
                      </span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 bg-indigo-500 text-white px-2 py-1 rounded-lg shadow-sm">
                      <Globe className="w-3 h-3" />
                      <span className="text-[10px] font-bold uppercase tracking-tighter">Agencia</span>
                    </div>
                  )}
                </div>

                <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
                   <button
                    onClick={(e) => handleDeleteBoard(e, board.id)}
                    className="p-1.5 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors shadow-sm"
                   >
                     <Trash2 className="w-3.5 h-3.5" />
                   </button>
                </div>
              </div>

              {/* Info */}
              <div className="p-4">
                <h3 className="font-bold text-zinc-900 dark:text-zinc-100 line-clamp-1 mb-1">
                  {board.name}
                </h3>
                <div className="flex items-center justify-between text-xs text-zinc-400">
                  <span>{board._count?.items || 0} elementos</span>
                  <div className="flex items-center gap-1 text-indigo-500 font-medium">
                    <span>Abrir</span>
                    <Maximize2 className="w-3 h-3" />
                  </div>
                </div>
              </div>
            </div>
          ))}

          {filteredBoards.length === 0 && (
            <div className="col-span-full py-20 text-center space-y-4">
              <div className="w-20 h-20 bg-zinc-100 dark:bg-zinc-800 rounded-full flex items-center justify-center mx-auto">
                <Search className="w-8 h-8 text-zinc-300" />
              </div>
              <div className="text-zinc-500 font-medium">No se encontraron tableros</div>
            </div>
          )}
        </div>
      )}

      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent overlayClassName="z-[100]" className="z-[101] max-w-md rounded-3xl border-zinc-200 bg-white p-0 shadow-2xl dark:border-zinc-800 dark:bg-zinc-900">
          <form
            onSubmit={handleCreateBoard}
            className="p-5 sm:p-8"
          >
            <DialogTitle className="mb-2 pr-10 text-2xl font-black tracking-tighter text-zinc-900 dark:text-zinc-100">
              Nuevo Tablero
            </DialogTitle>
            <DialogDescription className="mb-6 text-sm text-zinc-500 dark:text-zinc-400">Organiza referencias visuales para la agencia o un cliente.</DialogDescription>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-zinc-400 uppercase mb-1 ml-1">Nombre</label>
                <input
                  autoFocus
                  required
                  type="text"
                  placeholder="Ej: Lanzamiento Verano 2026"
                  className="w-full px-4 py-3 bg-zinc-50 dark:bg-zinc-800 border-none rounded-xl text-zinc-900 dark:text-zinc-100 focus:ring-2 focus:ring-indigo-500"
                  value={newBoard.name}
                  onChange={(e) => setNewBoard({ ...newBoard, name: e.target.value })}
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-400 uppercase mb-1 ml-1">Cliente (Opcional)</label>
                <select
                  className="w-full px-4 py-3 bg-zinc-50 dark:bg-zinc-800 border-none rounded-xl text-zinc-900 dark:text-zinc-100 focus:ring-2 focus:ring-indigo-500"
                  value={newBoard.clientId || ''}
                  onChange={(e) => setNewBoard({ ...newBoard, clientId: e.target.value || null })}
                >
                  <option value="">Tablero Global de Agencia</option>
                  {clients.map(client => (
                    <option key={client.id} value={client.id}>{client.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row">
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="min-h-11 flex-1 rounded-xl bg-zinc-100 px-6 py-3 font-bold text-zinc-600 transition-colors hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300"
              >
                Cancelar
              </button>
              <button
                disabled={creating}
                type="submit"
                className="min-h-11 flex-1 rounded-xl bg-[#009EB9] px-6 py-3 font-bold text-white shadow-lg shadow-[#009EB9]/20 transition-all hover:bg-[#008CA4] disabled:opacity-50"
              >
                {creating ? 'Creando...' : 'Crear Tablero'}
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default MoodboardDashboard;
