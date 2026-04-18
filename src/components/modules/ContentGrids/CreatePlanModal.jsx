import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription
} from '@/components/ui/dialog';
import { Loader2 } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';

const CreatePlanModal = ({ isOpen, onClose }) => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    clientId: '',
    month: new Date().getMonth() + 1,
    year: new Date().getFullYear()
  });

  const { data: clients } = useQuery({
    queryKey: ['clients-list'],
    queryFn: async () => {
      const response = await axios.get(`${getApiBaseUrl()}/api/db/clients`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('authToken')}` }
      });
      return response.data;
    }
  });

  const createMutation = useMutation({
    mutationFn: async (data) => {
      const response = await axios.post(`${getApiBaseUrl()}/api/content/plans`, data, {
        headers: { Authorization: `Bearer ${localStorage.getItem('authToken')}` }
      });
      return response.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries(['content-plans']);
      toast.success('Parrilla creada con éxito');
      onClose();
      // Redirección UX: Ir al detalle de la parrilla recién creada
      if (data.client?.slug) {
        const months = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
        const monthName = months[data.month - 1];
        navigate(`/parrillas/${data.client.slug}/${monthName}-${data.year}`);
      } else {
        navigate(`/parrillas/${data.id}`);
      }
    },
    onError: () => {
      toast.error('Error al crear la parrilla');
      setLoading(false);
    }
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!formData.clientId) {
      toast.error('Selecciona un cliente');
      return;
    }
    setLoading(true);
    createMutation.mutate(formData);
  };

  const months = [
    { value: 1, label: 'Enero' },
    { value: 2, label: 'Febrero' },
    { value: 3, label: 'Marzo' },
    { value: 4, label: 'Abril' },
    { value: 5, label: 'Mayo' },
    { value: 6, label: 'Junio' },
    { value: 7, label: 'Julio' },
    { value: 8, label: 'Agosto' },
    { value: 9, label: 'Septiembre' },
    { value: 10, label: 'Octubre' },
    { value: 11, label: 'Noviembre' },
    { value: 12, label: 'Diciembre' }
  ];

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px] bg-white dark:bg-zinc-900 border-zinc-200 dark:border-white/10 shadow-2xl">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-zinc-900 dark:text-white">Nueva Parrilla</DialogTitle>
          <DialogDescription className="text-zinc-500 dark:text-zinc-400">
            Define el cliente y el periodo para el plan de contenido.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6 py-4">
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-widest text-zinc-500">Cliente</label>
              <select
                value={formData.clientId}
                onChange={(e) => setFormData({ ...formData, clientId: e.target.value })}
                className="w-full h-12 px-4 rounded-xl bg-zinc-50 dark:bg-white/5 border border-zinc-200 dark:border-white/10 focus:ring-2 focus:ring-indigo-600/20 outline-none transition-all font-medium"
                required
              >
                <option value="">Selecciona un cliente...</option>
                {clients?.map((client) => (
                  <option key={client.id} value={client.id}>{client.name}</option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-widest text-zinc-500">Mes</label>
                <select
                  value={formData.month}
                  onChange={(e) => setFormData({ ...formData, month: parseInt(e.target.value) })}
                  className="w-full h-12 px-4 rounded-xl bg-zinc-50 dark:bg-white/5 border border-zinc-200 dark:border-white/10 focus:ring-2 focus:ring-indigo-600/20 outline-none transition-all font-medium"
                >
                  {months.map((m) => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-widest text-zinc-500">Año</label>
                <input
                  type="number"
                  value={formData.year}
                  onChange={(e) => setFormData({ ...formData, year: parseInt(e.target.value) })}
                  className="w-full h-12 px-4 rounded-xl bg-zinc-50 dark:bg-white/5 border border-zinc-200 dark:border-white/10 focus:ring-2 focus:ring-indigo-600/20 outline-none transition-all font-medium"
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-3 rounded-xl hover:bg-zinc-100 dark:hover:bg-white/5 text-zinc-500 font-bold transition-all"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold shadow-lg shadow-indigo-600/20 transition-all flex items-center gap-2 disabled:opacity-50"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              Crear Parrilla
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default CreatePlanModal;
