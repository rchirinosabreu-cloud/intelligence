import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';
import {
    AlertCircle,
    Calendar,
    CheckCircle2,
    Clock,
    FileText,
    Mail,
    MessageCircle,
    ShieldCheck,
    Smartphone
} from '@/components/ui/icons';
import { Button } from '@/components/ui/button';
import { useConfirmDialog } from '@/components/ui/ConfirmDialog';
import { calculateQuotationTotals, groupQuotationScenarios } from '@/services/quotationDomainService';
import { parseContractTermsText } from '@/services/quotationContractTerms';

const WHATSAPP_NUMBER = '573004329276';

const formatDate = (value) => new Date(value).toLocaleDateString('es-CO', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
});

const PublicQuotation = () => {
    const { slug } = useParams();
    const queryClient = useQueryClient();
    const confirm = useConfirmDialog();
    const [acceptanceError, setAcceptanceError] = useState('');
    const [selectedScenarioId, setSelectedScenarioId] = useState('');

    const { data: quotation, isLoading, error } = useQuery({
        queryKey: ['public-quotation', slug],
        queryFn: async () => {
            const res = await fetch(`${getApiBaseUrl()}/api/quotations/public/${slug}`);
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || 'Propuesta no encontrada');
            return data;
        }
    });

    const acceptMutation = useMutation({
        mutationFn: async (scenarioId) => {
            const res = await fetch(`${getApiBaseUrl()}/api/quotations/public/${slug}/accept`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ scenarioId: scenarioId || undefined })
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || 'No fue posible aceptar la cotización');
            return data;
        },
        onSuccess: (data) => {
            setAcceptanceError('');
            queryClient.setQueryData(['public-quotation', slug], data);
        },
        onError: (mutationError) => {
            console.error('[PublicQuotation] Acceptance failed:', mutationError);
            setAcceptanceError(mutationError.message || 'No fue posible aceptar la cotización');
        }
    });

    const formatCurrency = (value) => new Intl.NumberFormat('es-CO', {
        style: 'currency',
        currency: quotation?.currency || 'COP',
        minimumFractionDigits: quotation?.currency === 'USD' ? 2 : 0,
        maximumFractionDigits: quotation?.currency === 'USD' ? 2 : 0
    }).format(Number(value) || 0);

    const openWhatsApp = (message) => {
        window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer');
    };

    const handleAccept = async () => {
        if (scenarios.length > 0 && !selectedScenarioId) {
            setAcceptanceError('Selecciona primero uno de los escenarios.');
            return;
        }
        const chosenScenario = scenarios.find(({ id }) => id === selectedScenarioId);
        const accepted = await confirm({
            title: 'Aceptar cotización',
            description: `Confirmas la aprobación de la propuesta ${quotation.consecutive_formatted}${chosenScenario ? ` con la opción “${chosenScenario.name}”` : ''}. Brainstudio recibirá una notificación para continuar contigo.`,
            confirmLabel: 'Confirmar aceptación',
            cancelLabel: 'Volver',
            tone: 'primary'
        });
        if (!accepted) return;
        setAcceptanceError('');
        acceptMutation.mutate(selectedScenarioId);
    };

    if (isLoading) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-zinc-50 p-6 dark:bg-zinc-950">
                <div className="text-center">
                    <div className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-violet-600 border-t-transparent" />
                    <p className="mt-4 text-sm font-medium text-zinc-500">Cargando propuesta comercial...</p>
                </div>
            </div>
        );
    }

    if (error || !quotation) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-zinc-50 p-6 dark:bg-zinc-950">
                <div className="w-full max-w-md rounded-lg border border-zinc-200 bg-white p-8 text-center shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
                    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-rose-50 text-[#E11D48] dark:bg-rose-500/10">
                        <AlertCircle className="h-6 w-6" />
                    </div>
                    <h1 className="mt-5 text-xl font-bold text-zinc-950 dark:text-white">Propuesta no disponible</h1>
                    <p className="mt-2 text-sm leading-6 text-zinc-500">El enlace no existe o la propuesta todavía no ha sido emitida.</p>
                    <Button variant="outline" className="mt-6 w-full rounded-md" onClick={() => { window.location.href = 'https://brainstudioagencia.com'; }}>
                        Ir a Brainstudio
                    </Button>
                </div>
            </div>
        );
    }

    if (quotation.isExpired) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-zinc-50 p-6 dark:bg-zinc-950">
                <div className="w-full max-w-xl rounded-lg border border-amber-200 bg-white p-8 text-center shadow-sm dark:border-amber-900/60 dark:bg-zinc-900 sm:p-10">
                    <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400">
                        <Clock className="h-7 w-7" />
                    </div>
                    <p className="mt-5 text-xs font-bold uppercase text-amber-600 dark:text-amber-400">Vigencia finalizada</p>
                    <h1 className="mt-2 text-2xl font-bold text-zinc-950 dark:text-white">Esta propuesta debe actualizarse</h1>
                    <p className="mx-auto mt-3 max-w-md text-base leading-7 text-zinc-600 dark:text-zinc-300">
                        La propuesta superó sus 15 días de vigencia. Escríbenos para confirmar valores y disponibilidad.
                    </p>
                    <Button
                        className="mt-7 h-12 rounded-md px-6"
                        onClick={() => openWhatsApp('Hola, mi propuesta comercial expiró y me gustaría actualizarla.')}
                    >
                        <MessageCircle className="mr-2 h-5 w-5" />
                        Contactar por WhatsApp
                    </Button>
                </div>
            </div>
        );
    }

    const isBrain = quotation.emisor_type === 'BRAIN_STUDIO';
    const isApproved = quotation.status === 'APROBADA';
    const scenarios = groupQuotationScenarios(quotation.items || []);
    const approvedScenario = scenarios.find(({ selected }) => selected);
    const visibleScenarios = isApproved && approvedScenario ? [approvedScenario] : scenarios;
    const chosenScenario = approvedScenario || scenarios.find(({ id }) => id === selectedScenarioId);
    const chosenAmounts = chosenScenario
        ? calculateQuotationTotals(chosenScenario.items, quotation.is_tax_exempt || quotation.currency === 'USD')
        : null;
    const terms = parseContractTermsText(quotation.terms_and_conditions);

    return (
        <div className="min-h-screen bg-[#f7f7fa] text-zinc-950 dark:bg-zinc-950 dark:text-white">
            <div className="h-1 bg-violet-600" />

            <header className="border-b border-zinc-200 bg-white px-5 py-5 dark:border-zinc-800 dark:bg-zinc-900 sm:px-8">
                <div className="mx-auto flex max-w-6xl items-center justify-between gap-5">
                    <div className="flex min-w-0 items-center gap-3">
                        {isBrain ? (
                            <img src="/brainstudio-logo.png" alt="Brainstudio" className="h-10 w-10 shrink-0 object-contain" />
                        ) : (
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-zinc-950 text-sm font-bold text-white dark:bg-white dark:text-zinc-950">FV</div>
                        )}
                        <div className="min-w-0">
                            <p className="truncate text-base font-bold">{isBrain ? 'Brainstudio' : quotation.emisor_data?.nombre}</p>
                            <p className="truncate text-xs text-zinc-500">
                                {isBrain ? `${quotation.emisor_data?.razonSocial} · NIT ${quotation.emisor_data?.nit}` : quotation.emisor_data?.identificacion}
                            </p>
                        </div>
                    </div>
                    <div className="text-right">
                        <p className="text-xs font-semibold uppercase text-zinc-400">Propuesta</p>
                        <p className="mt-0.5 text-sm font-bold text-violet-700 dark:text-violet-300">{quotation.consecutive_formatted}</p>
                    </div>
                </div>
            </header>

            <main>
                <section className="px-5 py-12 sm:px-8 sm:py-16">
                    <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[minmax(0,1fr)_300px] lg:items-end">
                        <div className="max-w-3xl">
                            <div className="flex flex-wrap items-center gap-2">
                                <span className="rounded-md bg-violet-100 px-2.5 py-1 text-xs font-bold text-violet-700 dark:bg-violet-500/10 dark:text-violet-300">Propuesta comercial</span>
                                {isApproved && (
                                    <span className="rounded-md bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">Aprobada</span>
                                )}
                            </div>
                            <h1 className="mt-6 text-3xl font-bold leading-tight sm:text-4xl">
                                {quotation.client_company || quotation.client_name}
                            </h1>
                            <p className="mt-5 max-w-2xl text-base leading-7 text-zinc-600 dark:text-zinc-300 sm:text-lg sm:leading-8">
                                Reunimos los servicios, alcances e inversión necesarios para avanzar con claridad hacia los objetivos acordados.
                            </p>
                        </div>

                        <dl className="grid grid-cols-2 gap-x-6 gap-y-5 border-l-0 border-zinc-200 lg:grid-cols-1 lg:border-l lg:pl-8 dark:border-zinc-800">
                            <div>
                                <dt className="flex items-center gap-2 text-xs font-semibold uppercase text-zinc-400"><Calendar className="h-4 w-4" /> Emisión</dt>
                                <dd className="mt-1.5 text-sm font-semibold">{formatDate(quotation.issued_at || quotation.created_at)}</dd>
                            </div>
                            <div>
                                <dt className="flex items-center gap-2 text-xs font-semibold uppercase text-zinc-400"><Clock className="h-4 w-4" /> Vigencia</dt>
                                <dd className="mt-1.5 text-sm font-semibold">{formatDate(quotation.expires_at)}</dd>
                            </div>
                        </dl>
                    </div>
                </section>

                <section className="border-y border-zinc-200 bg-white px-5 py-12 dark:border-zinc-800 dark:bg-zinc-900 sm:px-8 sm:py-16">
                    <div className="mx-auto max-w-6xl">
                        <div className="space-y-8">
                            <div>
                                <p className="text-xs font-bold uppercase text-violet-700 dark:text-violet-300">Alcance</p>
                                <h2 className="mt-2 text-2xl font-bold">{scenarios.length > 0 ? (isApproved ? 'Escenario seleccionado' : 'Escenarios disponibles') : 'Servicios incluidos'}</h2>
                            </div>
                            {scenarios.length > 0 ? (
                                <div className="grid gap-5 lg:grid-cols-3">
                                    {visibleScenarios.map((scenario) => {
                                        const amounts = calculateQuotationTotals(scenario.items, quotation.is_tax_exempt || quotation.currency === 'USD');
                                        const isSelected = selectedScenarioId === scenario.id || scenario.selected;
                                        return (
                                            <article key={scenario.id} className={`flex flex-col rounded-2xl border-2 p-6 transition-all ${isSelected ? 'border-[#00859C] bg-cyan-50/40 shadow-lg dark:bg-cyan-950/10' : 'border-zinc-200 dark:border-zinc-800'}`}>
                                                <p className="text-xs font-bold uppercase text-[#00859C]">Opción {scenario.order + 1}</p>
                                                <h3 className="mt-2 text-xl font-bold">{scenario.name}</h3>
                                                {scenario.description && <p className="mt-3 text-sm leading-6 text-zinc-500">{scenario.description}</p>}
                                                <div className="mt-5 space-y-4 border-t border-zinc-200 pt-5 dark:border-zinc-800">
                                                    {scenario.items.map((item, index) => <div key={`${item.name}-${index}`}><p className="text-sm font-bold">{item.name}</p>{item.description && <p className="mt-1 text-xs leading-5 text-zinc-500">{item.description}</p>}</div>)}
                                                </div>
                                                <div className="mt-auto pt-6">
                                                    <p className="text-xs font-bold uppercase text-zinc-400">Valor de esta opción</p>
                                                    <p className="mt-1 text-2xl font-black">{formatCurrency(amounts.totalAmount)}</p>
                                                    {!quotation.is_tax_exempt && quotation.currency !== 'USD' && <p className="mt-1 text-xs text-zinc-500">Incluye IVA del 19%</p>}
                                                    {scenario.externalBudget !== null && <div className="mt-4 rounded-lg bg-amber-50 p-3 text-xs text-amber-800 dark:bg-amber-950/20 dark:text-amber-300"><strong>Presupuesto externo: {formatCurrency(scenario.externalBudget)}</strong>{scenario.externalBudgetNote && <p className="mt-1 leading-5">{scenario.externalBudgetNote}</p>}</div>}
                                                    {!isApproved && <Button type="button" onClick={() => { setSelectedScenarioId(scenario.id); setAcceptanceError(''); }} variant={isSelected ? 'default' : 'outline'} className="mt-5 w-full rounded-lg">{isSelected ? 'Opción seleccionada' : 'Elegir esta opción'}</Button>}
                                                </div>
                                            </article>
                                        );
                                    })}
                                </div>
                            ) : <div className="space-y-3">
                                {(quotation.items || []).map((item, index) => (
                                    <div key={`${item.name}-${index}`} className="space-y-3">
                                        <article className="rounded-lg border border-zinc-200 p-5 dark:border-zinc-800 sm:p-6">
                                            <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_180px] sm:items-start">
                                                <div>
                                                    <div className="flex items-start gap-3">
                                                        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-zinc-100 text-xs font-bold text-zinc-500 dark:bg-zinc-800 dark:text-zinc-300">{index + 1}</span>
                                                        <div>
                                                            <h3 className="text-base font-bold">{item.name}</h3>
                                                            {item.description && <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-300">{item.description}</p>}
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="border-t border-zinc-100 pt-4 text-left sm:border-l sm:border-t-0 sm:pl-6 sm:pt-0 sm:text-right dark:border-zinc-800">
                                                    <p className="text-xs font-semibold uppercase text-zinc-400">{Number(item.quantity)} {Number(item.quantity) === 1 ? 'unidad' : 'unidades'}</p>
                                                    <p className="mt-1 text-xl font-bold">{formatCurrency(Number(item.price) * Number(item.quantity))}</p>
                                                </div>
                                            </div>
                                        </article>
                                        {item.note && (
                                            <div className="ml-3 border-l-2 border-violet-300 pl-4 dark:border-violet-700">
                                                <p className="text-xs font-bold uppercase text-violet-700 dark:text-violet-300">Nota adicional</p>
                                                <p className="mt-1 text-sm font-normal leading-6 text-zinc-600 dark:text-zinc-300">{item.note}</p>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>}
                        </div>
                    </div>
                </section>

                <section className="px-5 py-12 sm:px-8 sm:py-16">
                    <div className="mx-auto max-w-4xl space-y-8">
                        <div className="space-y-6">
                            <div className="border-t border-zinc-300 pt-4 dark:border-zinc-700">
                                <p className="text-xs font-semibold uppercase text-zinc-400">Cliente</p>
                                <p className="mt-2 text-lg font-bold">{quotation.client_company || quotation.client_name}</p>
                                {quotation.client_company && <p className="mt-1 text-sm text-zinc-500">Atención: {quotation.client_name}</p>}
                            </div>
                            <div className="border-t border-zinc-300 pt-4 dark:border-zinc-700">
                                <p className="text-xs font-semibold uppercase text-zinc-400">Contacto</p>
                                <p className="mt-2 flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-300"><Mail className="h-4 w-4" /> {quotation.client_email || 'No proporcionado'}</p>
                                <p className="mt-2 flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-300"><Smartphone className="h-4 w-4" /> {quotation.client_phone}</p>
                            </div>
                        </div>

                        <div className="rounded-lg bg-violet-700 p-6 text-white shadow-xl shadow-violet-950/10 dark:bg-violet-800 sm:p-8">
                            <p className="text-xs font-semibold uppercase text-violet-200">{scenarios.length > 0 ? (chosenScenario ? chosenScenario.name : 'Selecciona un escenario') : 'Inversión total'}</p>
                            {scenarios.length === 0 || chosenAmounts ? <>
                                <p className="mt-3 text-4xl font-bold leading-none">{formatCurrency(chosenAmounts?.totalAmount ?? quotation.total_amount)}</p>
                                <div className="mt-6 space-y-2 border-t border-white/20 pt-5 text-sm">
                                    <div className="flex justify-between gap-4"><span className="text-violet-100">Subtotal</span><span>{formatCurrency(chosenAmounts?.subtotal ?? quotation.subtotal)}</span></div>
                                    {quotation.currency !== 'USD' && !quotation.is_tax_exempt && <div className="flex justify-between gap-4"><span className="text-violet-100">IVA (19%)</span><span>{formatCurrency(chosenAmounts?.taxAmount ?? quotation.tax_amount)}</span></div>}
                                </div>
                            </> : <p className="mt-3 text-sm leading-6 text-violet-100">Compara las opciones anteriores y elige la que deseas aprobar.</p>}

                            {isApproved ? (
                                <div className="mt-7 rounded-md bg-white/15 p-4 text-white">
                                    <p className="flex items-center gap-2 font-bold"><CheckCircle2 className="h-5 w-5" /> Propuesta aprobada</p>
                                    <p className="mt-1 text-sm leading-6 opacity-90">Confirmada el {formatDate(quotation.accepted_at)}. Nuestro equipo se pondrá en contacto contigo.</p>
                                </div>
                            ) : (
                                <Button
                                    className="mt-7 h-12 w-full rounded-md bg-white text-violet-700 hover:bg-violet-50 dark:bg-white dark:text-violet-800 dark:hover:bg-violet-50"
                                    onClick={handleAccept}
                                    disabled={acceptMutation.isPending}
                                >
                                    <ShieldCheck className="mr-2 h-5 w-5" />
                                    {acceptMutation.isPending ? 'Confirmando...' : 'Aceptar cotización'}
                                </Button>
                            )}

                            <Button
                                variant="outline"
                                className="mt-3 h-12 w-full rounded-md border-white/30 bg-transparent text-white hover:bg-white/10 dark:border-white/30 dark:text-white dark:hover:bg-white/10"
                                onClick={() => openWhatsApp(`Hola, quiero conversar sobre la propuesta ${quotation.consecutive_formatted} para ${quotation.client_name}.`)}
                            >
                                <MessageCircle className="mr-2 h-5 w-5" />
                                Contactar por WhatsApp
                            </Button>

                            {acceptanceError && <p className="mt-3 text-sm leading-6 text-rose-100">{acceptanceError}</p>}
                        </div>
                    </div>
                </section>

                <section className="border-t border-zinc-200 bg-white px-5 py-12 dark:border-zinc-800 dark:bg-zinc-900 sm:px-8 sm:py-16">
                    <div className="mx-auto max-w-4xl">
                        <div className="flex items-start gap-3">
                            <FileText className="mt-1 h-5 w-5 shrink-0 text-violet-600" />
                            <div>
                                <p className="text-xs font-bold uppercase text-violet-700 dark:text-violet-300">Información contractual</p>
                                <h2 className="mt-2 text-2xl font-bold">Términos y condiciones</h2>
                            </div>
                        </div>
                        <ol className="mt-8 space-y-5 text-sm leading-7 text-zinc-600 dark:text-zinc-300 sm:text-base">
                            {terms.map((term, index) => (
                                <li key={`${index}-${term.slice(0, 20)}`} className="grid grid-cols-[28px_minmax(0,1fr)] gap-3">
                                    <span className="flex h-7 w-7 items-center justify-center rounded-md bg-violet-50 text-xs font-bold text-violet-700 dark:bg-violet-500/10 dark:text-violet-300">{index + 1}</span>
                                    <p>{term}</p>
                                </li>
                            ))}
                        </ol>
                    </div>
                </section>
            </main>

            <footer className="border-t border-zinc-200 bg-[#f7f7fa] px-5 py-8 text-center dark:border-zinc-800 dark:bg-zinc-950 sm:px-8">
                <p className="text-sm font-semibold">Brainstudio</p>
                <p className="mt-1 text-xs text-zinc-500">{quotation.emisor_data?.email} · {quotation.emisor_data?.whatsapp}</p>
            </footer>
        </div>
    );
};

export default PublicQuotation;
