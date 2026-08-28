import React, { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
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
import { cn } from '@/lib/utils';
import { toast } from 'react-hot-toast';
import { useConfirmDialog } from '@/components/ui/ConfirmDialog';
import { matchesServiceSearch } from '@/utils/serviceCatalogSearch';
import ServiceCatalogModal, { SERVICE_CATEGORIES as CATEGORIES } from './ServiceCatalogModal';

const CatalogManagement = () => {
    const confirm = useConfirmDialog();
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedCategory, setSelectedCategory] = useState('All');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingService, setEditingService] = useState(null);


    const { data: services = [], isLoading } = useQuery({
        queryKey: ['services-catalog'],
        queryFn: async () => {
            const res = await fetch(`${getApiBaseUrl()}/api/services`, {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('authToken')}`
                }
            });
            if (!res.ok) throw new Error("Failed to fetch services");
            return await res.json();
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
        setEditingService(service);
        setIsModalOpen(true);
    };

    const closeModal = () => {
        setIsModalOpen(false);
        setEditingService(null);
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
        const matchesSearch = matchesServiceSearch(s, searchTerm);
        const matchesCategory = selectedCategory === 'All' || s.category === selectedCategory;
        return matchesSearch && matchesCategory;
    });

    const groupedServices = CATEGORIES.reduce((acc, cat) => {
        const catServices = filteredServices.filter(s => s.category === cat.id);
        if (catServices.length > 0) acc[cat.label] = catServices;
        return acc;
    }, {});

    const formatCurrency = (value) => new Intl.NumberFormat('es-CO', {
        style: 'currency',
        currency: 'COP',
        minimumFractionDigits: 0
    }).format(Number(value) || 0);

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h2 className="text-2xl font-bold tracking-tight">Catálogo de Servicios</h2>
                    <p className="text-zinc-500 text-sm">Gestiona los productos y tarifas oficiales de la agencia.</p>
                </div>
                <div className="flex w-full md:w-auto items-center gap-2">
                    <div className="relative flex-1 md:w-72">
                        <Search className="absolute left-3 top-1/2 w-4 h-4 -translate-y-1/2 text-zinc-400" />
                        <input
                            type="text"
                            placeholder="Buscar en el catálogo..."
                            className="w-full bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl pl-10 pr-4 py-2 text-sm outline-none focus:ring-2 ring-primary/20"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <Button onClick={() => openModal()} className="rounded-xl flex shrink-0 items-center gap-2">
                        <Plus className="w-4 h-4" /> Nuevo Servicio
                    </Button>
                </div>
            </div>

            <div className="flex flex-wrap gap-2">
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
                                        <div className="pt-4 border-t border-zinc-100 dark:border-zinc-800 space-y-3">
                                            <div className="flex justify-between items-end gap-3">
                                                <span className="text-[10px] font-bold text-zinc-400 uppercase">Precio oficial</span>
                                                <span className="text-lg font-black text-primary">{item.precio_variable ? 'Valor variable' : formatCurrency(item.valor_neto)}</span>
                                            </div>
                                            <div className="grid grid-cols-2 gap-3">
                                                <div className="space-y-1">
                                                    <p className="text-[10px] text-zinc-400">Costo de producción</p>
                                                    <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-200">{formatCurrency(item.costo_real_estimado)}</p>
                                                </div>
                                                <div className="space-y-1 text-right">
                                                    <p className="text-[10px] text-zinc-400">Ganancia</p>
                                                    <p className={cn(
                                                        "text-xs font-semibold",
                                                        item.ganancia_estimada === null
                                                            ? "text-zinc-400"
                                                            : item.ganancia_estimada >= 0
                                                                ? "text-emerald-600 dark:text-emerald-400"
                                                                : "text-rose-600 dark:text-rose-400"
                                                    )}>
                                                        {item.ganancia_estimada === null ? 'Sin costo' : formatCurrency(item.ganancia_estimada)}
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="grid grid-cols-2 gap-3">
                                                {item.precio_comercial_sugerido !== null && !item.precio_variable && (
                                                    <div className="space-y-1">
                                                        <p className="text-[10px] text-zinc-400">Precio comercial sugerido</p>
                                                        <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-200">{formatCurrency(item.precio_comercial_sugerido)}</p>
                                                    </div>
                                                )}
                                                {item.margen_estimado !== null && (
                                                    <div className="space-y-1 text-right col-start-2">
                                                        <p className="text-[10px] text-zinc-400">Margen estimado</p>
                                                        <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-200">{item.margen_estimado}%</p>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </Card>
                                ))}
                            </div>
                        </div>
                    ))
                )}
            </div>

            <ServiceCatalogModal
                open={isModalOpen}
                onOpenChange={(open) => open ? setIsModalOpen(true) : closeModal()}
                service={editingService}
            />
        </div>
    );
};

export default CatalogManagement;
