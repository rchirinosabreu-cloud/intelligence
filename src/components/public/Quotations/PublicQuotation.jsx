import React from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';
import { Calendar, Clock, Download, MessageCircle, AlertCircle, CheckCircle2, ChevronRight, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/Card';
import { cn } from '@/lib/utils';

const PublicQuotation = () => {
    const { slug } = useParams();

    const { data: quotation, isLoading, error } = useQuery({
        queryKey: ['public-quotation', slug],
        queryFn: async () => {
            const res = await fetch(`${getApiBaseUrl()}/api/quotations/public/${slug}`);
            if (!res.ok) throw new Error("Propuesta no encontrada");
            return await res.json();
        }
    });

    const formatCurrency = (val) => {
        return new Intl.NumberFormat('es-CO', {
            style: 'currency',
            currency: quotation?.currency || 'COP',
            minimumFractionDigits: 0
        }).format(val);
    };

    if (isLoading) {
        return (
            <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex items-center justify-center p-4">
                <div className="text-center space-y-4">
                    <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
                    <p className="text-zinc-500 font-medium animate-pulse">Cargando propuesta comercial...</p>
                </div>
            </div>
        );
    }

    if (error || !quotation) {
        return (
            <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex items-center justify-center p-4">
                <Card className="max-w-md w-full p-8 text-center space-y-6">
                    <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto">
                        <AlertCircle className="w-8 h-8 text-red-500" />
                    </div>
                    <div className="space-y-2">
                        <h2 className="text-xl font-bold">Enlace no válido</h2>
                        <p className="text-sm text-zinc-500">La propuesta que intentas visualizar no existe o el enlace es incorrecto.</p>
                    </div>
                    <Button variant="outline" className="w-full rounded-xl" onClick={() => window.location.href = 'https://brainstudioagencia.com'}>
                        Ir a la web principal
                    </Button>
                </Card>
            </div>
        );
    }

    if (quotation.isExpired) {
        return (
            <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex items-center justify-center p-4 font-sans">
                <Card className="max-w-xl w-full p-10 text-center space-y-8 overflow-hidden relative border-zinc-200 dark:border-zinc-800">
                    <div className="absolute top-0 left-0 w-full h-1.5 bg-amber-500" />

                    <div className="w-20 h-20 bg-amber-500/10 rounded-3xl flex items-center justify-center mx-auto rotate-12">
                        <Clock className="w-10 h-10 text-amber-500 -rotate-12" />
                    </div>

                    <div className="space-y-4">
                        <h2 className="text-3xl font-black tracking-tight text-zinc-900 dark:text-white">Propuesta Vencida</h2>
                        <p className="text-zinc-600 dark:text-zinc-400 text-lg leading-relaxed">
                            Esta propuesta ha superado su vigencia de <span className="font-bold text-zinc-900 dark:text-white">15 días</span>.
                            Por favor, ponte en contacto con tu asesor para actualizar los valores y la disponibilidad.
                        </p>
                    </div>

                    <div className="pt-4 flex flex-col sm:flex-row gap-4">
                        <Button
                            className="flex-1 h-14 rounded-2xl bg-zinc-900 dark:bg-white dark:text-zinc-950 hover:opacity-90 transition-all font-bold text-base"
                            onClick={() => window.open(`https://wa.me/573004329276?text=Hola! Mi propuesta comercial ha expirado y me gustaría actualizarla.`, '_blank')}
                        >
                            <MessageCircle className="w-5 h-5 mr-2" />
                            Contactar por WhatsApp
                        </Button>
                    </div>
                </Card>
            </div>
        );
    }

    const isBrain = quotation.emisor_type === 'BRAIN_STUDIO';

    return (
        <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 pb-20 font-sans selection:bg-primary/20">
            {/* Top Identity Bar */}
            <div className="h-2 bg-primary w-full sticky top-0 z-50" />

            <header className="bg-white dark:bg-zinc-900 border-b border-zinc-100 dark:border-zinc-800 py-8 px-6 lg:px-12">
                <div className="max-w-5xl mx-auto flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                    <div>
                        {isBrain ? (
                            <div className="flex items-center gap-4">
                                <div className="p-3 bg-zinc-50 dark:bg-zinc-800 rounded-2xl">
                                    <img src="/brainstudio-logo.png" alt="Brainstudio" className="w-10 h-10 object-contain" />
                                </div>
                                <div>
                                    <h1 className="text-2xl font-black tracking-tighter uppercase">Brainstudio</h1>
                                    <p className="text-xs text-zinc-500 font-bold uppercase tracking-widest">
                                        {quotation.emisor_data?.razonSocial} · NIT {quotation.emisor_data?.nit}
                                    </p>
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-1">
                                <h1 className="text-2xl font-black tracking-tight">{quotation.emisor_data?.nombre}</h1>
                                <p className="text-xs text-zinc-500 font-bold uppercase">
                                    Persona Natural · {quotation.emisor_data?.identificacion}
                                </p>
                            </div>
                        )}
                    </div>

                    <div className="text-right">
                        <div className="bg-primary/5 px-4 py-2 rounded-2xl border border-primary/10">
                            <p className="text-[10px] font-black text-primary uppercase tracking-[0.2em] mb-1">Consecutivo</p>
                            <p className="text-2xl font-black text-zinc-900 dark:text-white tracking-tighter">
                                {quotation.consecutive_formatted}
                            </p>
                        </div>
                    </div>
                </div>
            </header>

            <main className="max-w-5xl mx-auto px-6 lg:px-12 pt-12 space-y-12">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    <Card className="lg:col-span-2 p-8 bg-white dark:bg-zinc-900 border-zinc-100 dark:border-zinc-800 relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-24 h-24 bg-primary/5 rounded-full -mr-12 -mt-12" />
                        <h4 className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-4">Información del Cliente</h4>
                        <div className="space-y-4">
                             <div>
                                <h2 className="text-3xl font-black tracking-tight text-zinc-900 dark:text-white">
                                    {quotation.client_company || quotation.client_name}
                                </h2>
                                {quotation.client_company && (
                                    <p className="text-sm font-bold text-zinc-500 uppercase mt-1">Atn: {quotation.client_name}</p>
                                )}
                             </div>
                             <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t border-zinc-100 dark:border-zinc-800">
                                 <div className="space-y-1">
                                     <p className="text-[10px] font-bold text-zinc-400 uppercase">Correo Electrónico</p>
                                     <p className="text-sm font-medium">{quotation.client_email || 'No proporcionado'}</p>
                                 </div>
                                 <div className="space-y-1">
                                     <p className="text-[10px] font-bold text-zinc-400 uppercase">Teléfono de Contacto</p>
                                     <p className="text-sm font-medium">{quotation.client_phone}</p>
                                 </div>
                             </div>
                        </div>
                    </Card>

                    <div className="flex items-center gap-3">
                        <Button disabled variant="outline" className="h-12 px-6 rounded-2xl bg-zinc-50 dark:bg-zinc-800 border-none font-bold text-zinc-400">
                            <Download className="w-4 h-4 mr-2" />
                            Descargar PDF (Próximamente)
                        </Button>
                    </div>
                </div>

                {/* Intro Card */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    <div className="lg:col-span-2 space-y-6">
                        <div className="space-y-2">
                            <span className="inline-flex items-center px-3 py-1 rounded-full bg-primary/10 text-primary text-[10px] font-black uppercase tracking-wider">
                                Propuesta Comercial
                            </span>
                            <h2 className="text-4xl font-black tracking-tight text-zinc-900 dark:text-white">
                                Servicios de Estrategia & Diseño para <span className="text-primary">{quotation.client_name}</span>
                            </h2>
                        </div>

                        <p className="text-lg text-zinc-500 dark:text-zinc-400 leading-relaxed">
                            A continuación, detallamos la inversión estratégica requerida para alcanzar los objetivos discutidos.
                            Cada servicio ha sido seleccionado para maximizar el impacto y retorno de su marca.
                        </p>
                    </div>

                    <Card className="p-6 bg-white dark:bg-zinc-900 border-zinc-100 dark:border-zinc-800 space-y-4">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-primary/5 flex items-center justify-center shrink-0">
                                <Calendar className="w-5 h-5 text-primary" />
                            </div>
                            <div>
                                <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest leading-none mb-1">Fecha Emisión</p>
                                <p className="text-sm font-bold">{new Date(quotation.created_at).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-amber-500/5 flex items-center justify-center shrink-0">
                                <Clock className="w-5 h-5 text-amber-500" />
                            </div>
                            <div>
                                <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest leading-none mb-1">Válida Hasta</p>
                                <p className="text-sm font-bold">{new Date(quotation.expires_at).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
                            </div>
                        </div>
                    </Card>
                </div>

                {/* Items List */}
                <div className="space-y-6">
                    <h3 className="text-xl font-bold flex items-center gap-2">
                        <FileText className="w-5 h-5 text-zinc-400" />
                        Desglose de Servicios
                    </h3>
                    <div className="space-y-4">
                        {quotation.items?.map((item, idx) => (
                            <div key={idx} className="group p-6 bg-white dark:bg-zinc-900 rounded-3xl border border-zinc-100 dark:border-zinc-800 hover:border-primary/20 transition-all shadow-sm">
                                <div className="flex flex-col md:flex-row justify-between gap-6">
                                    <div className="space-y-2 flex-1">
                                        <div className="flex items-center gap-2">
                                            <span className="w-6 h-6 rounded-lg bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-[10px] font-black text-zinc-400">
                                                {idx + 1}
                                            </span>
                                            <h4 className="text-lg font-bold group-hover:text-primary transition-colors">{item.name}</h4>
                                        </div>
                                        <p className="text-sm text-zinc-500 dark:text-zinc-400 leading-relaxed pl-8">
                                            {item.description}
                                        </p>
                                        {item.note && (
                                            <p className="text-xs italic text-zinc-400 pl-8 pt-2">
                                                * {item.note}
                                            </p>
                                        )}
                                    </div>
                                    <div className="md:text-right space-y-1 shrink-0 flex flex-row md:flex-col justify-between items-center md:items-end">
                                        <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Inversión x {item.quantity}</p>
                                        <p className="text-xl font-black text-zinc-900 dark:text-white">
                                            {formatCurrency(Number(item.price) * Number(item.quantity))}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Redesigned Summary Section */}
                <div className="pt-12 border-t border-zinc-100 dark:border-zinc-800 flex flex-col items-center">
                    <div className="w-full max-w-md space-y-6 text-center">
                        <div className="space-y-4">
                            <div className="flex justify-between items-center text-zinc-500 text-sm font-medium">
                                <span>Subtotal Neto</span>
                                <span className="text-zinc-900 dark:text-white">{formatCurrency(quotation.subtotal)}</span>
                            </div>

                            {!quotation.is_tax_exempt && (
                                <div className="flex justify-between items-center text-zinc-500 text-sm font-medium">
                                    <span>IVA (19%)</span>
                                    <span className="text-zinc-900 dark:text-white">{formatCurrency(quotation.tax_amount)}</span>
                                </div>
                            )}

                            <div className="pt-4 border-t border-zinc-100 dark:border-zinc-800 flex justify-between items-end">
                                <div className="text-left">
                                    <p className="text-primary text-[10px] font-black uppercase tracking-[0.2em]">Inversión Total</p>
                                    <p className="text-4xl font-black tracking-tighter text-zinc-900 dark:text-white">
                                        {formatCurrency(quotation.total_amount)}
                                    </p>
                                </div>
                                <div className="bg-zinc-100 dark:bg-zinc-800 px-3 py-1 rounded-full text-[10px] font-bold text-zinc-500 uppercase tracking-widest">
                                    {quotation.currency}
                                </div>
                            </div>
                        </div>

                        <Button
                            className="w-full h-12 rounded-xl bg-primary hover:opacity-90 transition-all font-bold text-sm shadow-lg shadow-primary/20"
                            onClick={() => window.open(`https://wa.me/573004329276?text=Hola! Acabo de ver la propuesta para ${quotation.client_name} y me gustaría proceder.`, '_blank')}
                        >
                            Aceptar & Comenzar Ahora
                            <ChevronRight className="w-4 h-4 ml-2" />
                        </Button>
                    </div>
                </div>

                {/* Terms and Conditions in 2 columns */}
                <div className="pt-16 space-y-6">
                    <h4 className="text-sm font-bold uppercase tracking-widest text-zinc-400 text-center">Términos & Condiciones</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-4 text-[11px] text-zinc-500 dark:text-zinc-400 leading-relaxed">
                        {quotation.terms_and_conditions?.split('\n').map((line, i) => (
                            <div key={i} className="flex gap-3">
                                <span className="text-primary shrink-0">•</span>
                                <p>{line.replace('● ', '')}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </main>

            <footer className="max-w-5xl mx-auto px-6 lg:px-12 mt-24 pt-8 border-t border-zinc-100 dark:border-zinc-800 text-center">
                <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-widest">
                    Brain OS Intelligence · Sistema de Gestión Comercial v2.0
                </p>
            </footer>
        </div>
    );
};

export default PublicQuotation;
