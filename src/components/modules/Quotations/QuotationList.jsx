import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/button';
import {
    Search,
    Plus,
    Copy,
    ExternalLink,
    Calendar,
    Building2,
    User as UserIcon,
    FileText,
    MoreVertical,
    CheckCircle2,
    Clock,
    Download,
    Filter,
    Loader2
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';

const QuotationList = () => {
    const navigate = useNavigate();
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('ALL');
    const [downloadingId, setDownloadingId] = useState(null);

    const { data: quotations = [], isLoading } = useQuery({
        queryKey: ['quotations-list'],
        queryFn: async () => {
            const res = await fetch(`${getApiBaseUrl()}/api/quotations`, {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                }
            });
            if (!res.ok) throw new Error("Failed to fetch quotations");
            return await res.json();
        }
    });

    const filteredQuotations = quotations.filter(q => {
        const matchesSearch = q.client_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                             q.consecutive_formatted?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                             (q.client_company && q.client_company.toLowerCase().includes(searchTerm.toLowerCase()));
        const matchesStatus = statusFilter === 'ALL' || q.status === statusFilter;
        return matchesSearch && matchesStatus;
    });

    const downloadPDF = async (id, consecutive) => {
        setDownloadingId(id);
        try {
            const res = await fetch(`${getApiBaseUrl()}/api/quotations/${id}/pdf`, {
                headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
            });
            if (!res.ok) throw new Error("Failed to generate PDF");

            const blob = await res.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `Propuesta_${consecutive}.pdf`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            toast.success("PDF descargado");
        } catch (error) {
            toast.error("Error al generar PDF");
        } finally {
            setDownloadingId(null);
        }
    };

    const copyLink = (uuid) => {
        const link = `${window.location.origin}/cotizaciones/ver/${uuid}`;
        navigator.clipboard.writeText(link);
        toast.success("Enlace copiado al portapapeles");
    };

    const formatCurrency = (val, currency) => {
        return new Intl.NumberFormat('es-CO', {
            style: 'currency',
            currency: currency || 'COP',
            minimumFractionDigits: 0
        }).format(val);
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Historial de Cotizaciones</h1>
                    <p className="text-zinc-500 mt-1 text-sm">Auditoría comercial y gestión de propuestas.</p>
                </div>
                <Button onClick={() => navigate('/cotizaciones/nueva')} className="rounded-xl flex items-center gap-2">
                    <Plus className="w-4 h-4" /> Nueva Cotización
                </Button>
            </div>

            <Card className="p-4 bg-zinc-50/50 dark:bg-zinc-900/50 border-zinc-200 dark:border-zinc-800 flex flex-col md:flex-row gap-4">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-3 w-4 h-4 text-zinc-400" />
                    <input
                        type="text"
                        placeholder="Buscar por cliente, empresa o consecutivo..."
                        className="w-full bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl pl-10 pr-4 py-2 text-sm outline-none focus:ring-2 ring-primary/20"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
                <div className="flex items-center gap-2 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2">
                    <Filter className="w-4 h-4 text-zinc-400" />
                    <select
                        className="bg-transparent text-sm outline-none font-medium"
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                    >
                        <option value="ALL">Todos los Estados</option>
                        <option value="ACTIVA">Emitidas (Activas)</option>
                        <option value="BORRADOR">Borradores</option>
                    </select>
                </div>
            </Card>

            <Card className="overflow-hidden border-zinc-200 dark:border-zinc-800">
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-zinc-50 dark:bg-zinc-900/50 border-b border-zinc-200 dark:border-zinc-800">
                            <tr>
                                <th className="px-6 py-4 font-bold text-xs uppercase tracking-wider text-zinc-500">Consecutivo</th>
                                <th className="px-6 py-4 font-bold text-xs uppercase tracking-wider text-zinc-500">Fecha</th>
                                <th className="px-6 py-4 font-bold text-xs uppercase tracking-wider text-zinc-500">Cliente / Empresa</th>
                                <th className="px-6 py-4 font-bold text-xs uppercase tracking-wider text-zinc-500">Emisor</th>
                                <th className="px-6 py-4 font-bold text-xs uppercase tracking-wider text-zinc-500">Total</th>
                                <th className="px-6 py-4 font-bold text-xs uppercase tracking-wider text-zinc-500">Estado</th>
                                <th className="px-6 py-4 font-bold text-xs uppercase tracking-wider text-zinc-500 text-right">Acciones</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                            {isLoading ? (
                                <tr>
                                    <td colSpan="7" className="px-6 py-12 text-center text-zinc-400">Cargando cotizaciones...</td>
                                </tr>
                            ) : filteredQuotations.length === 0 ? (
                                <tr>
                                    <td colSpan="7" className="px-6 py-12 text-center text-zinc-400">No se encontraron cotizaciones.</td>
                                </tr>
                            ) : (
                                filteredQuotations.map((q) => (
                                    <tr key={q.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors group">
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <span className="font-bold text-primary">{q.consecutive_formatted}</span>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-zinc-500">
                                            <div className="flex items-center gap-2">
                                                <Calendar className="w-3.5 h-3.5" />
                                                {new Date(q.created_at).toLocaleDateString('es-ES')}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex flex-col">
                                                <span className="font-bold">{q.client_company || q.client_name}</span>
                                                {q.client_company && <span className="text-[10px] text-zinc-500 uppercase">{q.client_name}</span>}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <span className={cn(
                                                "px-2 py-1 rounded-full text-[10px] font-bold uppercase border",
                                                q.emisor_type === 'BRAIN_STUDIO'
                                                    ? "bg-indigo-50 text-indigo-600 border-indigo-100 dark:bg-indigo-900/20 dark:text-indigo-400 dark:border-indigo-800"
                                                    : "bg-zinc-100 text-zinc-600 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:border-zinc-700"
                                            )}>
                                                {q.emisor_type === 'BRAIN_STUDIO' ? 'Brain Studio' : 'Francisco Villa'}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap font-bold">
                                            {formatCurrency(q.total_amount, q.currency)}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            {q.status === 'BORRADOR' ? (
                                                <span className="flex items-center gap-1 text-zinc-400 text-xs font-bold bg-zinc-100 dark:bg-zinc-800 px-2 py-1 rounded-full w-fit">
                                                    <FileText className="w-3 h-3" /> Borrador
                                                </span>
                                            ) : q.isExpired ? (
                                                <span className="flex items-center gap-1 text-red-500 text-xs font-bold bg-red-50 dark:bg-red-950/20 px-2 py-1 rounded-full w-fit border border-red-100 dark:border-red-900/30">
                                                    <Clock className="w-3 h-3" /> Expirada
                                                </span>
                                            ) : (
                                                <span className="flex items-center gap-1 text-emerald-500 text-xs font-bold bg-emerald-50 dark:bg-emerald-950/20 px-2 py-1 rounded-full w-fit border border-emerald-100 dark:border-emerald-900/30">
                                                    <CheckCircle2 className="w-3 h-3" /> Activa
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-right">
                                            <div className="flex items-center justify-end gap-2">
                                                <button
                                                    onClick={() => downloadPDF(q.id, q.consecutive_formatted)}
                                                    disabled={downloadingId === q.id}
                                                    className="p-2 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-lg text-zinc-500 transition-colors disabled:opacity-50"
                                                    title="Descargar PDF"
                                                >
                                                    {downloadingId === q.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                                                </button>
                                                <button
                                                    onClick={() => copyLink(q.uuid_slug)}
                                                    className="p-2 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-lg text-zinc-500 transition-colors"
                                                    title="Copiar enlace público"
                                                >
                                                    <Copy className="w-4 h-4" />
                                                </button>
                                                <button
                                                    onClick={() => window.open(`/cotizaciones/ver/${q.uuid_slug}`, '_blank')}
                                                    className="p-2 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-lg text-zinc-500 transition-colors"
                                                    title="Ver propuesta"
                                                >
                                                    <ExternalLink className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </Card>
        </div>
    );
};

export default QuotationList;
