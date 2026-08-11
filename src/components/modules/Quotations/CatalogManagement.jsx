import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/button';
import {
    Plus,
    Edit2,
    Trash2,
    Search,
    ChevronRight,
    Loader2,
    LayoutGrid,
    Tag
} from '@/components/ui/icons';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { toast } from 'react-hot-toast';
import { useConfirmDialog } from '@/components/ui/ConfirmDialog';

const CATEGORIES = [
    { id: 'BRANDING', label: 'Branding' },
    { id: 'DISENO', label: 'Diseño' },
    { id: 'PRODUCCION_AUDIOVISUAL', label: 'Producción Audiovisual' },
    { id: 'MARKETING', label: 'Marketing' },
    { id: 'ADS', label: 'Ads' },
    { id: 'EDITORIAL', label: 'Editorial' },
    { id: 'WEB', label: 'Web' },
    { id: 'DESARROLLO', label: 'Desarrollo' }
];

const CatalogManagement = () => {
    const confirm = useConfirmDialog();
    const queryClient = useQueryClient();
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedCategory, setSelectedCategory] = useState('All');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingService, setEditingService] = useState(null);

    // Form State
    const [formData, setFormData] = useState({
        name: '',
        category: CATEGORIES[0].id,
        description: '',
        valor_neto: '',
        valor_neto_actual: ''
    });

    const { data: services = [], isLoading } = useQuery({
        queryKey: ['services-catalog'],
        queryFn: async () => {
            const res = await fetch(`${getApiBaseUrl()}/api/services`);
            if (!res.ok) throw new Error("Failed to fetch services");
            return await res.json();
        }
    });

    const [formError, setFormError] = useState(null);

    const mutation = useMutation({
        mutationFn: async (data) => {
            setFormError(null);
            const url = editingService
                ? `${getApiBaseUrl()}/api/services/${editingService.id}`
                : `${getApiBaseUrl()}/api/services`;

            const res = await fetch(url, {
                method: editingService ? 'PUT' : 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('authToken')}`
                },
                body: JSON.stringify(data)
            });

            if (!res.ok) {
                const errorData = await res.json();
                throw new Error(errorData.error || "Operation failed");
            }

            return await res.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries(['services-catalog']);
            toast.success(editingService ? "Servicio actualizado" : "Servicio creado");
            closeModal();
        },
        onError: (error) => {
            setFormError(error.message);
            toast.error(error.message);
        }
    });

    const deleteMutation = useMutation({
        mutationFn: async (id) => {
            const res = await fetch(`${getApiBaseUrl()}/api/services/${id}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('authToken')}`
                }
            });
            if (!res.ok) throw new Error("Delete failed");
        },
        onSuccess: () => {
            queryClient.invalidateQueries(['services-catalog']);
            toast.success("Servicio eliminado");
        }
    });

    const openModal = (service = null) => {
        if (service) {
            setEditingService(service);
            setFormData({
                name: service.name,
                category: service.category,
                description: service.description,
                valor_neto: service.valor_neto,
                valor_neto_actual: service.valor_neto_actual
            });
        } else {
            setEditingService(null);
            setFormData({
                name: '',
                category: CATEGORIES[0],
                description: '',
                valor_neto: '',
                valor_neto_actual: ''
            });
        }
        setIsModalOpen(true);
    };

    const closeModal = () => {
        setIsModalOpen(false);
        setEditingService(null);
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        mutation.mutate(formData);
    };

    const handleDelete = async (serviceId) => {
        const accepted = await confirm({
            title: 'Eliminar servicio',
            description: 'El servicio dejará de estar disponible en el catálogo.',
            confirmLabel: 'Eliminar'
        });
        if (accepted) deleteMutation.mutate(serviceId);
    };

    const filteredServices = services.filter(s => {
        const matchesSearch = s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                             s.description.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesCategory = selectedCategory === 'All' || s.category === selectedCategory;
        return matchesSearch && matchesCategory;
    });

    const groupedServices = CATEGORIES.reduce((acc, cat) => {
        const catServices = filteredServices.filter(s => s.category === cat.id);
        if (catServices.length > 0) acc[cat.label] = catServices;
        return acc;
    }, {});

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h2 className="text-2xl font-bold tracking-tight">Catálogo de Servicios</h2>
                    <p className="text-zinc-500 text-sm">Gestiona los productos y tarifas oficiales de la agencia.</p>
                </div>
                <Button onClick={() => openModal()} className="rounded-xl flex items-center gap-2">
                    <Plus className="w-4 h-4" /> Nuevo Servicio
                </Button>
            </div>

            <div className="flex flex-col md:flex-row gap-4">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-3 w-4 h-4 text-zinc-400" />
                    <input
                        type="text"
                        placeholder="Buscar en el catálogo..."
                        className="w-full bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl pl-10 pr-4 py-2 text-sm outline-none focus:ring-2 ring-primary/20"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
                <div className="flex gap-2 overflow-x-auto pb-2 md:pb-0 scrollbar-hide">
                    <button
                        onClick={() => setSelectedCategory('All')}
                        className={cn(
                            "px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap border",
                            selectedCategory === 'All'
                                ? "bg-primary text-white border-primary"
                                : "bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-500 hover:border-zinc-300"
                        )}
                    >
                        Todos
                    </button>
                    {CATEGORIES.map(cat => (
                        <button
                            key={cat.id}
                            onClick={() => setSelectedCategory(cat.id)}
                            className={cn(
                                "px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap border",
                                selectedCategory === cat.id
                                    ? "bg-primary text-white border-primary"
                                    : "bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-500 hover:border-zinc-300"
                            )}
                        >
                            {cat.label}
                        </button>
                    ))}
                </div>
            </div>

            <div className="space-y-8">
                {isLoading ? (
                    <div className="flex justify-center py-20">
                        <Loader2 className="w-8 h-8 text-primary animate-spin" />
                    </div>
                ) : Object.keys(groupedServices).length === 0 ? (
                    <Card className="p-20 text-center text-zinc-400 italic border-dashed border-2">
                        No se encontraron servicios que coincidan con la búsqueda.
                    </Card>
                ) : (
                    Object.entries(groupedServices).map(([category, items]) => (
                        <div key={category} className="space-y-4">
                            <h3 className="text-sm font-black uppercase tracking-widest text-zinc-400 flex items-center gap-2">
                                <Tag className="w-4 h-4" />
                                {category}
                                <span className="ml-2 px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-[10px]">{items.length}</span>
                            </h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                {items.map(item => (
                                    <Card key={item.id} className="p-5 hover:border-primary/30 transition-all group flex flex-col justify-between">
                                        <div>
                                            <div className="flex justify-between items-start mb-2">
                                                <h4 className="font-bold text-zinc-900 dark:text-white line-clamp-1">{item.name}</h4>
                                                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <button onClick={() => openModal(item)} className="p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg text-zinc-500 hover:text-primary transition-colors">
                                                        <Edit2 className="w-3.5 h-3.5" />
                                                    </button>
                                                    <button
                                                        onClick={() => handleDelete(item.id)}
                                                        className="p-1.5 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg text-zinc-500 hover:text-red-500 transition-colors"
                                                    >
                                                        <Trash2 className="w-3.5 h-3.5" />
                                                    </button>
                                                </div>
                                            </div>
                                            <p className="text-xs text-zinc-500 dark:text-zinc-400 line-clamp-3 mb-4 leading-relaxed h-12">
                                                {item.description}
                                            </p>
                                        </div>
                                        <div className="pt-4 border-t border-zinc-100 dark:border-zinc-800 flex justify-between items-center">
                                            <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-tighter">Tarifa Actual</span>
                                            <span className="text-lg font-black text-primary">
                                                {new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(item.valor_neto_actual)}
                                            </span>
                                        </div>
                                    </Card>
                                ))}
                            </div>
                        </div>
                    ))
                )}
            </div>

            {/* CRUD Modal */}
            <Dialog open={isModalOpen} onOpenChange={closeModal}>
                <DialogContent className="sm:max-w-lg rounded-2xl">
                    <DialogHeader>
                        <DialogTitle className="text-xl font-bold">
                            {editingService ? 'Editar Servicio' : 'Nuevo Servicio'}
                        </DialogTitle>
                    </DialogHeader>
                    <form onSubmit={handleSubmit} className="space-y-4 pt-4">
                        {formError && (
                            <div className="bg-red-50 dark:bg-red-950/30 border border-red-100 dark:border-red-900/30 p-3 rounded-xl flex items-start gap-2 animate-in fade-in slide-in-from-top-1">
                                <Tag className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                                <div className="space-y-1">
                                    <p className="text-xs font-bold text-red-600 dark:text-red-400">Error de Guardado</p>
                                    <p className="text-[10px] text-red-500 dark:text-red-400/80 leading-tight">{formError}</p>
                                </div>
                            </div>
                        )}
                        <div className="grid grid-cols-2 gap-4">
                            <div className="col-span-2 space-y-1.5">
                                <label className="text-xs font-bold uppercase text-zinc-500">Nombre del Servicio</label>
                                <input
                                    required
                                    className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 ring-primary/20"
                                    value={formData.name}
                                    onChange={e => setFormData({...formData, name: e.target.value})}
                                    placeholder="Ej: Auditoría de marca"
                                />
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-xs font-bold uppercase text-zinc-500">Categoría</label>
                                <select
                                    className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-2.5 text-sm outline-none"
                                    value={formData.category}
                                    onChange={e => setFormData({...formData, category: e.target.value})}
                                >
                                    {CATEGORIES.map(cat => <option key={cat.id} value={cat.id}>{cat.label}</option>)}
                                </select>
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-xs font-bold uppercase text-zinc-500">Precio Actual (Neto)</label>
                                <input
                                    type="number"
                                    required
                                    className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 ring-primary/20"
                                    value={formData.valor_neto_actual}
                                    onChange={e => setFormData({...formData, valor_neto_actual: e.target.value})}
                                    placeholder="350000"
                                />
                            </div>
                            <div className="col-span-2 space-y-1.5">
                                <label className="text-xs font-bold uppercase text-zinc-500">Descripción Comercial</label>
                                <textarea
                                    className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 ring-primary/20 min-h-[100px]"
                                    value={formData.description}
                                    onChange={e => setFormData({...formData, description: e.target.value})}
                                    placeholder="Describe el alcance del servicio..."
                                />
                            </div>
                        </div>
                        <DialogFooter className="pt-6">
                            <Button type="button" variant="ghost" onClick={closeModal} className="rounded-xl">Cancelar</Button>
                            <Button type="submit" disabled={mutation.isLoading} className="rounded-xl px-8">
                                {mutation.isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : (editingService ? 'Guardar Cambios' : 'Crear Servicio')}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </div>
    );
};

export default CatalogManagement;
