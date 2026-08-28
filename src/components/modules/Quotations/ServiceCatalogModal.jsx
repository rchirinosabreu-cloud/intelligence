import React, { useEffect, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';
import { Button } from '@/components/ui/button';
import { Loader2, Tag } from '@/components/ui/icons';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { toast } from 'react-hot-toast';

export const SERVICE_CATEGORIES = [
    { id: 'BRANDING', label: 'Branding' },
    { id: 'DISENO', label: 'Diseño' },
    { id: 'COMUNICACION_CORPORATIVA', label: 'Comunicación Corporativa' },
    { id: 'PRODUCCION_AUDIOVISUAL', label: 'Producción Audiovisual' },
    { id: 'MARKETING', label: 'Marketing' },
    { id: 'ADS', label: 'Ads' },
    { id: 'EDITORIAL', label: 'Editorial' },
    { id: 'WEB', label: 'Web' },
    { id: 'DESARROLLO', label: 'Desarrollo' },
    { id: 'MERCHANDISING_IMPRESION', label: 'Merchandising / Impresión' }
];

const emptyForm = (initialName = '') => ({
    name: initialName.trim(),
    category: SERVICE_CATEGORIES[0].id,
    description: '',
    costo_real_estimado: '',
    valor_neto: '',
    valor_neto_actual: ''
});

const ServiceCatalogModal = ({ open, onOpenChange, service = null, initialName = '', onSaved }) => {
    const queryClient = useQueryClient();
    const [formData, setFormData] = useState(() => emptyForm(initialName));
    const [formError, setFormError] = useState(null);

    useEffect(() => {
        if (!open) return;
        setFormError(null);
        setFormData(service ? {
            name: service.name,
            category: service.category,
            description: service.description || '',
            costo_real_estimado: service.costo_real_estimado ?? '',
            valor_neto: service.valor_neto ?? '',
            valor_neto_actual: service.valor_neto_actual ?? ''
        } : emptyForm(initialName));
    }, [initialName, open, service]);

    const mutation = useMutation({
        mutationFn: async (data) => {
            setFormError(null);
            const response = await fetch(
                service ? `${getApiBaseUrl()}/api/services/${service.id}` : `${getApiBaseUrl()}/api/services`,
                {
                    method: service ? 'PUT' : 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${localStorage.getItem('authToken')}`
                    },
                    body: JSON.stringify(data)
                }
            );
            const result = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(result.error || 'No fue posible guardar el servicio');
            return result;
        },
        onSuccess: (savedService) => {
            queryClient.invalidateQueries({ queryKey: ['services-catalog'] });
            queryClient.invalidateQueries({ queryKey: ['service-catalog'] });
            toast.success(service ? 'Servicio actualizado' : (onSaved ? 'Servicio creado y agregado' : 'Servicio creado'));
            onSaved?.(savedService);
            onOpenChange(false);
        },
        onError: (error) => {
            setFormError(error.message);
            toast.error(error.message);
        }
    });

    const economics = useMemo(() => {
        const finalPrice = Number(formData.valor_neto) || 0;
        const cost = Number(formData.costo_real_estimado) || 0;
        const profit = finalPrice - cost;
        return { profit, margin: finalPrice > 0 ? (profit / finalPrice) * 100 : 0 };
    }, [formData.costo_real_estimado, formData.valor_neto]);

    const formatCurrency = (value) => new Intl.NumberFormat('es-CO', {
        style: 'currency', currency: 'COP', minimumFractionDigits: 0
    }).format(Number(value) || 0);

    const updateField = (field, value) => setFormData((current) => ({ ...current, [field]: value }));

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-lg rounded-2xl">
                <DialogHeader>
                    <DialogTitle className="text-xl font-bold">{service ? 'Editar Servicio' : 'Nuevo Servicio'}</DialogTitle>
                </DialogHeader>
                <form onSubmit={(event) => { event.preventDefault(); mutation.mutate(formData); }} className="space-y-4 pt-4">
                    {formError && (
                        <div className="bg-red-50 dark:bg-red-950/30 border border-red-100 dark:border-red-900/30 p-3 rounded-xl flex items-start gap-2">
                            <Tag className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                            <div><p className="text-xs font-bold text-red-600 dark:text-red-400">Error de guardado</p><p className="text-[10px] text-red-500">{formError}</p></div>
                        </div>
                    )}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="col-span-2 space-y-1.5">
                            <label className="text-xs font-bold uppercase text-zinc-500">Nombre del Servicio</label>
                            <input required autoFocus className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 ring-primary/20" value={formData.name} onChange={(e) => updateField('name', e.target.value)} placeholder="Ej: Auditoría de marca" />
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-xs font-bold uppercase text-zinc-500">Categoría</label>
                            <select className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-2.5 text-sm outline-none" value={formData.category} onChange={(e) => updateField('category', e.target.value)}>
                                {SERVICE_CATEGORIES.map((category) => <option key={category.id} value={category.id}>{category.label}</option>)}
                            </select>
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-xs font-bold uppercase text-zinc-500">Costo real estimado</label>
                            <input type="number" required min="0" className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 ring-primary/20" value={formData.costo_real_estimado} onChange={(e) => updateField('costo_real_estimado', e.target.value)} placeholder="220000" />
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-xs font-bold uppercase text-zinc-500">Precio actual</label>
                            <input type="number" required min="0" className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 ring-primary/20" value={formData.valor_neto_actual} onChange={(e) => updateField('valor_neto_actual', e.target.value)} placeholder="350000" />
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-xs font-bold uppercase text-zinc-500">Precio final</label>
                            <input type="number" required min="0" className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 ring-primary/20" value={formData.valor_neto} onChange={(e) => updateField('valor_neto', e.target.value)} placeholder="730000" />
                        </div>
                        <div className="col-span-2 grid grid-cols-2 gap-4 rounded-lg bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-4">
                            <div><p className="text-[10px] font-bold uppercase text-zinc-400">Ganancia</p><p className={cn('mt-1 text-base font-bold', economics.profit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400')}>{formatCurrency(economics.profit)}</p></div>
                            <div className="text-right"><p className="text-[10px] font-bold uppercase text-zinc-400">Margen estimado</p><p className="mt-1 text-base font-bold text-zinc-800 dark:text-zinc-100">{economics.margin.toFixed(1)}%</p></div>
                        </div>
                        <div className="col-span-2 space-y-1.5">
                            <label className="text-xs font-bold uppercase text-zinc-500">Descripción Comercial</label>
                            <textarea className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 ring-primary/20 min-h-[100px]" value={formData.description} onChange={(e) => updateField('description', e.target.value)} placeholder="Describe el alcance del servicio..." />
                        </div>
                    </div>
                    <DialogFooter className="pt-6">
                        <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} className="rounded-xl">Cancelar</Button>
                        <Button type="submit" disabled={mutation.isPending} className="rounded-xl px-8">{mutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : (service ? 'Guardar Cambios' : 'Crear Servicio')}</Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
};

export default ServiceCatalogModal;
