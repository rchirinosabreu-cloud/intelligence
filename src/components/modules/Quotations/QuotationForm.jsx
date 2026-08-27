import React, { useState, useEffect, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';
import { Search, Plus, Trash2, Copy, Check, DollarSign, FileText, Globe, Building2, User as UserIcon, ArrowLeft, Loader2, RefreshCw } from '@/components/ui/icons';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/Card';
import { toast } from 'react-hot-toast';
import { cn } from '@/lib/utils';
import { useNavigate, useParams } from 'react-router-dom';
import SuccessModal from './SuccessModal';
import { calculateQuotationEconomics } from '@/services/quotationDomainService';
import { matchesServiceSearch } from '@/utils/serviceCatalogSearch';

const QuotationForm = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const isEditing = !!id;

    // State
    const [emisorType, setEmisorType] = useState('BRAIN_STUDIO');
    const [clientCompany, setClientCompany] = useState('');
    const [clientName, setClientName] = useState('');
    const [clientEmail, setClientEmail] = useState('');
    const [clientPhone, setClientPhone] = useState('');
    const [clientType, setClientType] = useState('EMPRESA');
    const [currency, setCurrency] = useState('COP');
    const [isTaxExempt, setIsTaxExempt] = useState(false);
    const [selectedItems, setSelectedItems] = useState([]);
    const [searchTerm, setSearchText] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [generatedLink, setGeneratedLink] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isLoadingData, setIsLoadingData] = useState(false);
    const [wasExpired, setWasExpired] = useState(false);
    const [issuedAt, setIssuedAt] = useState(null);
    const [exchangeRate, setExchangeRate] = useState('');
    const [exchangeRateSource, setExchangeRateSource] = useState(null);
    const [exchangeRateDate, setExchangeRateDate] = useState(null);
    const [isLoadingRate, setIsLoadingRate] = useState(false);
    const [exchangeRateError, setExchangeRateError] = useState('');

    const fetchQuotation = useCallback(async () => {
        setIsLoadingData(true);
        try {
            // Using admin endpoint for authenticated edit
            const res = await fetch(`${getApiBaseUrl()}/api/quotations/${id}`, {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('authToken')}`
                }
            });
            if (!res.ok) throw new Error("Failed to load quotation");
            const data = await res.json();
            setEmisorType(data.emisor_type);
            setClientCompany(data.client_company || '');
            setClientName(data.client_name);
            setClientEmail(data.client_email);
            setClientPhone(data.client_phone);
            setClientType(data.client_company ? 'EMPRESA' : 'PERSONA_NATURAL');
            setCurrency(data.currency);
            setIsTaxExempt(data.is_tax_exempt);
            setWasExpired(Boolean(data.isExpired));
            setIssuedAt(data.issued_at || data.created_at);
            setExchangeRate(data.exchange_rate ? Number(data.exchange_rate) : '');
            setExchangeRateSource(data.exchange_rate_source || null);
            setExchangeRateDate(data.exchange_rate_date || null);

            // Robust parsing for items to prevent crash
            let parsedItems = [];
            if (Array.isArray(data.items)) {
                parsedItems = data.items;
            } else if (typeof data.items === 'string') {
                try {
                    parsedItems = JSON.parse(data.items);
                } catch (e) {
                    console.error("Failed to parse items:", e);
                    parsedItems = [];
                }
            }
            setSelectedItems(Array.isArray(parsedItems) ? parsedItems : []);
        } catch (error) {
            toast.error("No se pudo cargar la cotización");
            navigate('/cotizaciones');
        } finally {
            setIsLoadingData(false);
        }
    }, [id, navigate]);

    // Fetch existing data if editing
    useEffect(() => {
        if (isEditing) fetchQuotation();
    }, [fetchQuotation, isEditing]);

    // Auto-toggle tax exempt based on emisor/client
    useEffect(() => {
        if (currency === 'USD') {
            setIsTaxExempt(true);
            return;
        }
        if (!isEditing) {
            if (emisorType === 'FRANCISCO_VILLA' || clientType === 'PERSONA_NATURAL') {
                setIsTaxExempt(true);
            } else {
                setIsTaxExempt(false);
            }
        }
    }, [currency, emisorType, clientType, isEditing]);

    // Fetch catalog
    const { data: catalog = [] } = useQuery({
        queryKey: ['service-catalog'],
        queryFn: async () => {
            const res = await fetch(`${getApiBaseUrl()}/api/quotations/catalog`, {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('authToken')}`
                }
            });
            if (!res.ok) throw new Error("Failed to fetch catalog");
            return await res.json();
        }
    });

    useEffect(() => {
        if (catalog.length === 0 || isLoadingData) return;
        const catalogById = new Map(catalog.map((service) => [service.id, service]));
        setSelectedItems((currentItems) => {
            let changed = false;
            const enrichedItems = currentItems.map((item) => {
                const service = item.serviceId ? catalogById.get(item.serviceId) : null;
                if (!service) return item;

                const estimatedCost = item.estimatedCost ?? service.costo_real_estimado;
                const catalogFinalPrice = item.catalogFinalPrice ?? service.valor_neto;
                if (estimatedCost === item.estimatedCost && catalogFinalPrice === item.catalogFinalPrice) return item;
                changed = true;
                return { ...item, estimatedCost, catalogFinalPrice };
            });
            return changed ? enrichedItems : currentItems;
        });
    }, [catalog, isLoadingData]);

    const filteredCatalog = catalog.filter((item) => matchesServiceSearch(item, searchTerm));

    const roundQuoteAmount = (value, targetCurrency = currency) => (
        targetCurrency === 'USD'
            ? Math.round((Number(value) + Number.EPSILON) * 100) / 100
            : Math.round(Number(value))
    );

    const loadOfficialExchangeRate = async () => {
        setIsLoadingRate(true);
        setExchangeRateError('');
        try {
            const res = await fetch(`${getApiBaseUrl()}/api/quotations/exchange-rate`, {
                headers: { 'Authorization': `Bearer ${localStorage.getItem('authToken')}` }
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || 'No fue posible consultar la TRM');
            setExchangeRate(Number(data.rate));
            setExchangeRateSource(data.source);
            setExchangeRateDate(data.validFrom);
            return Number(data.rate);
        } catch (error) {
            console.error('[QuotationForm] Exchange rate fetch failed:', error);
            setExchangeRateError(error.message || 'No fue posible consultar la TRM');
            return null;
        } finally {
            setIsLoadingRate(false);
        }
    };

    const handleCurrencyChange = async (nextCurrency) => {
        if (nextCurrency === currency) return;
        let usableRate = Number(exchangeRate);
        if (nextCurrency === 'USD' && (!Number.isFinite(usableRate) || usableRate <= 0)) {
            usableRate = await loadOfficialExchangeRate();
            if (!usableRate) return;
        }
        if (!Number.isFinite(usableRate) || usableRate <= 0) return;

        setSelectedItems((items) => items.map((item) => ({
            ...item,
            price: roundQuoteAmount(
                nextCurrency === 'USD'
                    ? Number(item.price) / usableRate
                    : Number(item.price) * usableRate,
                nextCurrency
            )
        })));
        setCurrency(nextCurrency);
        setIsTaxExempt(
            nextCurrency === 'USD'
            || emisorType === 'FRANCISCO_VILLA'
            || clientType === 'PERSONA_NATURAL'
        );
    };

    const addItem = (service) => {
        const quotePrice = currency === 'USD' && Number(exchangeRate) > 0
            ? Number(service.valor_neto_actual) / Number(exchangeRate)
            : Number(service.valor_neto_actual);
        setSelectedItems([...selectedItems, {
            serviceId: service.id,
            name: service.name,
            description: service.description,
            price: roundQuoteAmount(quotePrice),
            quantity: 1,
            note: '',
            estimatedCost: service.costo_real_estimado,
            catalogFinalPrice: service.valor_neto
        }]);
        setSearchText('');
    };

    const updateItem = (index, field, value) => {
        const newItems = [...selectedItems];
        newItems[index][field] = value;
        setSelectedItems(newItems);
    };

    const removeItem = (index) => {
        setSelectedItems(selectedItems.filter((_, i) => i !== index));
    };

    const calculateTotals = () => {
        const subtotal = selectedItems.reduce((sum, item) => sum + (Number(item.price) * Number(item.quantity)), 0);
        const tax = currency === 'USD' || isTaxExempt ? 0 : subtotal * 0.19;
        return { subtotal, tax, total: subtotal + tax };
    };

    const formatCurrency = (val) => {
        return new Intl.NumberFormat('es-CO', {
            style: 'currency',
            currency: currency,
            minimumFractionDigits: currency === 'USD' ? 2 : 0,
            maximumFractionDigits: currency === 'USD' ? 2 : 0
        }).format(val);
    };

    const formatCop = (val) => new Intl.NumberFormat('es-CO', {
        style: 'currency',
        currency: 'COP',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    }).format(Number(val) || 0);

    const formatCatalogPrice = (copValue) => formatCurrency(
        currency === 'USD' && Number(exchangeRate) > 0
            ? Number(copValue) / Number(exchangeRate)
            : Number(copValue)
    );

    const handleSubmit = async (targetStatus = 'ACTIVA') => {
        if (targetStatus === 'ACTIVA' && (!clientName || !clientPhone || selectedItems.length === 0)) {
            toast.error("Por favor completa los campos obligatorios para emitir");
            return;
        }
        if (currency === 'USD' && (!Number.isFinite(Number(exchangeRate)) || Number(exchangeRate) <= 0)) {
            toast.error('Registra una tasa USD/COP válida antes de guardar');
            return;
        }

        setIsSaving(true);
        try {
            const url = isEditing ? `${getApiBaseUrl()}/api/quotations/${id}` : `${getApiBaseUrl()}/api/quotations`;
            const method = isEditing ? 'PUT' : 'POST';

            const res = await fetch(url, {
                method: method,
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('authToken')}`
                },
                body: JSON.stringify({
                    emisor_type: emisorType,
                    client_name: clientName,
                    client_company: clientCompany,
                    client_email: clientEmail,
                    client_phone: clientPhone,
                    client_type: clientType,
                    items: selectedItems,
                    currency,
                    exchange_rate: currency === 'USD' ? Number(exchangeRate) : null,
                    exchange_rate_source: currency === 'USD' ? exchangeRateSource : null,
                    exchange_rate_date: currency === 'USD' ? exchangeRateDate : null,
                    status: targetStatus,
                    is_tax_exempt: currency === 'USD' ? true : isTaxExempt
                })
            });

            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || "Error al guardar la cotización");

            const shouldShare = targetStatus === 'ACTIVA';
            if (shouldShare) {
                const link = `${window.location.origin}/cotizaciones/ver/${data.uuid_slug}`;
                setGeneratedLink(link);
                setIsModalOpen(true);
            } else {
                setGeneratedLink('');
                setIsModalOpen(false);
            }

            const wasReactivated = wasExpired && shouldShare;
            setWasExpired(false);
            setIssuedAt(data.issued_at || issuedAt);
            setExchangeRate(data.exchange_rate ? Number(data.exchange_rate) : '');
            setExchangeRateSource(data.exchange_rate_source || null);
            setExchangeRateDate(data.exchange_rate_date || null);
            toast.success(
                wasReactivated
                    ? "Cotización reactivada por 15 días"
                    : shouldShare
                        ? (isEditing ? "Cotización actualizada" : "Cotización generada con éxito")
                        : "Borrador guardado"
            );
        } catch (error) {
            console.error("[QuotationForm] Save failed:", error);
            toast.error(error.message || "Fallo al guardar la cotización");
        } finally {
            setIsSaving(false);
        }
    };

    const copyToClipboard = () => {
        navigator.clipboard.writeText(generatedLink);
        toast.success("Enlace copiado al portapapeles");
    };

    const totals = calculateTotals();
    const profitabilityAvailable = currency === 'COP' || Number(exchangeRate) > 0;
    const profitability = profitabilityAvailable
        ? calculateQuotationEconomics(selectedItems, { currency, exchangeRate: Number(exchangeRate) })
        : null;
    const displayIssueDate = wasExpired ? new Date() : new Date(issuedAt || Date.now());

    if (isEditing && isLoadingData) {
        return (
            <div className="w-full h-[400px] flex items-center justify-center">
                <div className="flex flex-col items-center gap-3">
                    <Loader2 className="w-8 h-8 text-primary animate-spin" />
                    <p className="text-zinc-500 text-sm font-medium">Hidratando propuesta...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-8 pb-20">
            <SuccessModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                link={generatedLink}
            />
            <div className="flex justify-between items-center">
                <div className="flex items-center gap-4">
                    <Button variant="ghost" size="icon" onClick={() => navigate('/cotizaciones')} className="rounded-xl">
                        <ArrowLeft className="w-5 h-5" />
                    </Button>
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight">
                            {isEditing ? (wasExpired ? 'Reactivar propuesta' : 'Editar propuesta') : 'Nueva propuesta'}
                        </h1>
                        <p className="text-zinc-500 mt-1 text-sm">
                            {wasExpired
                                ? 'Al emitirla, su vigencia comenzará nuevamente por 15 días calendario.'
                                : 'Crea propuestas comerciales elegantes y dinámicas.'}
                        </p>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Form Column */}
                <div className="lg:col-span-2 space-y-6">
                    <Card className="p-6">
                        <div className="space-y-6">
                            {/* Emisor Selector */}
                            <div>
                                <label className="text-sm font-medium mb-3 block">Emisor de la Propuesta</label>
                                <div className="grid grid-cols-2 gap-4">
                                    <button
                                        onClick={() => setEmisorType('BRAIN_STUDIO')}
                                        className={cn(
                                            "flex items-center gap-3 p-4 rounded-xl border transition-all text-left",
                                            emisorType === 'BRAIN_STUDIO'
                                                ? "border-primary bg-primary/5 ring-1 ring-primary"
                                                : "border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-900"
                                        )}
                                    >
                                        <div className="p-2 bg-primary/10 rounded-lg">
                                            <Building2 className="w-5 h-5 text-primary" />
                                        </div>
                                        <div>
                                            <p className="font-bold text-sm">Brain Studio</p>
                                            <p className="text-[10px] text-zinc-500 uppercase">Agencia Creativa</p>
                                        </div>
                                    </button>
                                    <button
                                        onClick={() => setEmisorType('FRANCISCO_VILLA')}
                                        className={cn(
                                            "flex items-center gap-3 p-4 rounded-xl border transition-all text-left",
                                            emisorType === 'FRANCISCO_VILLA'
                                                ? "border-primary bg-primary/5 ring-1 ring-primary"
                                                : "border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-900"
                                        )}
                                    >
                                        <div className="p-2 bg-zinc-100 dark:bg-zinc-800 rounded-lg">
                                            <UserIcon className="w-5 h-5 text-zinc-600 dark:text-zinc-400" />
                                        </div>
                                        <div>
                                            <p className="font-bold text-sm">Francisco Villa</p>
                                            <p className="text-[10px] text-zinc-500 uppercase">Persona Natural</p>
                                        </div>
                                    </button>
                                </div>
                            </div>

                            {/* Client Data */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="space-y-2">
                                    <label className="text-xs font-bold text-zinc-500 uppercase">Tipo de Propuesta</label>
                                    <select
                                        value={clientType}
                                        onChange={(e) => setClientType(e.target.value)}
                                        className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-2.5 text-sm outline-none"
                                    >
                                        <option value="EMPRESA">Para Empresa (Aplica IVA 19%)</option>
                                        <option value="PERSONA_NATURAL">Para Persona Natural (Exento)</option>
                                    </select>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-xs font-bold text-zinc-500 uppercase">Fecha de Emisión</label>
                                    <input
                                        type="text"
                                        disabled
                                        value={displayIssueDate.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                                        className="w-full bg-zinc-100 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-zinc-500"
                                    />
                                </div>

                                {clientType === 'EMPRESA' && (
                                    <div className="space-y-2 animate-in fade-in slide-in-from-top-2 duration-300">
                                        <label className="text-xs font-bold text-zinc-500 uppercase">Nombre de la Empresa</label>
                                        <input
                                            type="text"
                                            value={clientCompany}
                                            onChange={(e) => setClientCompany(e.target.value)}
                                            className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 ring-primary/20"
                                            placeholder="Ej: Acme Corp SAS"
                                        />
                                    </div>
                                )}

                                <div className="space-y-2">
                                    <label className="text-xs font-bold text-zinc-500 uppercase">Nombre del Cliente (Contacto)</label>
                                    <input
                                        type="text"
                                        value={clientName}
                                        onChange={(e) => setClientName(e.target.value)}
                                        className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 ring-primary/20"
                                        placeholder="Ej: Juan Pérez"
                                    />
                                </div>

                                <div className="space-y-2">
                                    <label className="text-xs font-bold text-zinc-500 uppercase">Correo Electrónico</label>
                                    <input
                                        type="email"
                                        value={clientEmail}
                                        onChange={(e) => setClientEmail(e.target.value)}
                                        className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 ring-primary/20"
                                        placeholder="juan@empresa.com"
                                    />
                                </div>

                                <div className="space-y-2">
                                    <label className="text-xs font-bold text-zinc-500 uppercase">Celular / WhatsApp</label>
                                    <input
                                        type="text"
                                        value={clientPhone}
                                        onChange={(e) => setClientPhone(e.target.value)}
                                        className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 ring-primary/20"
                                        placeholder="+57 300 0000000"
                                    />
                                </div>
                            </div>

                            {/* Service Search */}
                            <div className="space-y-2 relative">
                                <label className="text-xs font-bold text-zinc-500 uppercase">Buscador de Servicios</label>
                                <div className="relative">
                                    <Search className="absolute left-3 top-3 w-4 h-4 text-zinc-400" />
                                    <input
                                        type="text"
                                        value={searchTerm}
                                        onChange={(e) => setSearchText(e.target.value)}
                                        className="w-full bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl pl-10 pr-4 py-2.5 text-sm outline-none focus:ring-2 ring-primary/20"
                                        placeholder="Escribe para buscar un servicio..."
                                    />
                                </div>
                                {searchTerm && (
                                    <div className="absolute z-50 left-0 right-0 top-full mt-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-2xl max-h-60 overflow-y-auto overflow-x-hidden">
                                        {filteredCatalog.map(service => (
                                            <button
                                                key={service.id}
                                                onClick={() => addItem(service)}
                                                className="w-full text-left p-3 hover:bg-zinc-50 dark:hover:bg-zinc-800 border-b border-zinc-100 dark:border-zinc-800 last:border-0"
                                            >
                                                <p className="text-sm font-bold">{service.name}</p>
                                                <div className="flex justify-between items-center mt-1 gap-3">
                                                    <span className="text-[10px] text-zinc-500 bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 rounded-full">{service.category}</span>
                                                    <span className="text-xs font-semibold text-primary">Actual {formatCatalogPrice(service.valor_neto_actual)}</span>
                                                </div>
                                                <div className="mt-2 flex justify-end gap-3 text-[10px] text-zinc-400">
                                                    <span>Final {formatCatalogPrice(service.valor_neto)}</span>
                                                    <span className="text-emerald-600 dark:text-emerald-400">
                                                        Ganancia {service.ganancia_estimada === null ? 'sin costo' : formatCop(service.ganancia_estimada)}
                                                    </span>
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Selected Items */}
                            <div className="space-y-4">
                                <label className="text-xs font-bold text-zinc-500 uppercase">Servicios Incluidos</label>
                                {!Array.isArray(selectedItems) || selectedItems.length === 0 ? (
                                    <div className="p-12 border-2 border-dashed border-zinc-200 dark:border-zinc-800 rounded-2xl text-center">
                                        <FileText className="w-8 h-8 text-zinc-300 mx-auto mb-2" />
                                        <p className="text-xs text-zinc-400">No has seleccionado servicios aún.</p>
                                    </div>
                                ) : (
                                    <div className="space-y-3">
                                        {(selectedItems || []).map((item, idx) => (
                                            <div key={idx} className="p-4 bg-zinc-50 dark:bg-zinc-900/50 rounded-2xl border border-zinc-100 dark:border-zinc-800 space-y-3">
                                                <div className="flex justify-between items-start">
                                                    <input
                                                        className="flex-1 bg-transparent font-bold text-sm outline-none border-b border-transparent focus:border-primary/20"
                                                        value={item.name}
                                                        onChange={(e) => updateItem(idx, 'name', e.target.value)}
                                                    />
                                                    <button onClick={() => removeItem(idx)} className="text-zinc-400 hover:text-red-500 transition-colors">
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                </div>
                                                <textarea
                                                    className="w-full bg-transparent text-xs text-zinc-500 outline-none resize-none border-none p-0 h-16"
                                                    value={item.description}
                                                    onChange={(e) => updateItem(idx, 'description', e.target.value)}
                                                />
                                                <div className="space-y-1">
                                                    <label className="text-[10px] font-bold text-zinc-400 uppercase">Nota o aclaración sobre este servicio</label>
                                                    <textarea
                                                        placeholder="Ej: Incluye 2 rondas de ajustes..."
                                                        className="w-full bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg p-2 text-xs outline-none focus:ring-1 ring-primary/30 min-h-[60px]"
                                                        value={item.note}
                                                        onChange={(e) => updateItem(idx, 'note', e.target.value)}
                                                    />
                                                </div>
                                                <div className="flex items-center gap-4 pt-2 border-t border-zinc-100 dark:border-zinc-800/50">
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-[10px] font-bold text-zinc-400 uppercase">Cant.</span>
                                                        <input
                                                            type="number"
                                                            value={item.quantity}
                                                            onChange={(e) => updateItem(idx, 'quantity', e.target.value)}
                                                            className="w-12 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg px-2 py-1 text-xs text-center"
                                                        />
                                                    </div>
                                                    <div className="flex-1 flex items-center gap-2 justify-end">
                                                        <span className="text-[10px] font-bold text-zinc-400 uppercase">Precio</span>
                                                        <input
                                                            type="number"
                                                            value={item.price}
                                                            onChange={(e) => updateItem(idx, 'price', e.target.value)}
                                                            className="w-24 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg px-2 py-1 text-xs text-right font-medium"
                                                        />
                                                    </div>
                                                </div>
                                                {item.estimatedCost !== null && item.estimatedCost !== undefined && (
                                                    <div className="flex flex-wrap justify-end gap-x-4 gap-y-1 text-[10px] text-zinc-400">
                                                        <span>Costo estimado {formatCop(Number(item.estimatedCost) * Number(item.quantity || 0))}</span>
                                                        <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                                                            Ganancia {formatCop((((Number(item.price) * (currency === 'USD' ? Number(exchangeRate) : 1)) - Number(item.estimatedCost)) * Number(item.quantity || 0)))}
                                                        </span>
                                                        <span>
                                                            Margen {Number(item.price) > 0 && profitabilityAvailable
                                                                ? ((((Number(item.price) * (currency === 'USD' ? Number(exchangeRate) : 1)) - Number(item.estimatedCost)) / (Number(item.price) * (currency === 'USD' ? Number(exchangeRate) : 1))) * 100).toFixed(1)
                                                                : '0.0'}%
                                                        </span>
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    </Card>

                </div>

                {/* Preview / Settings Column */}
                <div className="space-y-6">
                    <Card className="p-6 space-y-6 sticky top-24">
                        <div className="flex justify-between items-center">
                            <h3 className="font-bold text-sm">Resumen y Ajustes</h3>
                            <div className="flex gap-1 bg-zinc-100 dark:bg-zinc-800 p-1 rounded-lg">
                                <button
                                    onClick={() => handleCurrencyChange('COP')}
                                    className={cn("px-2 py-1 text-[10px] font-bold rounded-md transition-all", currency === 'COP' ? "bg-white dark:bg-zinc-700 shadow-sm" : "text-zinc-500")}
                                >COP</button>
                                <button
                                    onClick={() => handleCurrencyChange('USD')}
                                    className={cn("px-2 py-1 text-[10px] font-bold rounded-md transition-all", currency === 'USD' ? "bg-white dark:bg-zinc-700 shadow-sm" : "text-zinc-500")}
                                >USD</button>
                            </div>
                        </div>

                        {currency === 'USD' && (
                            <div className="rounded-lg border border-violet-200 bg-violet-50/70 p-4 dark:border-violet-900/50 dark:bg-violet-950/20">
                                <div className="flex items-start justify-between gap-3">
                                    <div>
                                        <p className="text-[10px] font-bold uppercase text-violet-700 dark:text-violet-300">Tasa USD/COP</p>
                                        <p className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
                                            {exchangeRateSource === 'SUPERFINANCIERA_TRM' ? 'TRM oficial' : 'Tasa manual'}
                                            {exchangeRateDate ? ` · ${new Date(exchangeRateDate).toLocaleDateString('es-CO')}` : ''}
                                        </p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={loadOfficialExchangeRate}
                                        disabled={isLoadingRate}
                                        title="Actualizar TRM oficial"
                                        aria-label="Actualizar TRM oficial"
                                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-violet-200 bg-white text-violet-700 transition-colors hover:bg-violet-100 disabled:opacity-50 dark:border-violet-800 dark:bg-zinc-900 dark:text-violet-300 dark:hover:bg-violet-950"
                                    >
                                        <RefreshCw className={cn('h-4 w-4', isLoadingRate && 'animate-spin')} />
                                    </button>
                                </div>
                                <div className="mt-3 flex items-center gap-2">
                                    <span className="text-xs font-semibold text-zinc-500">1 USD =</span>
                                    <input
                                        type="number"
                                        min="0.01"
                                        step="0.01"
                                        value={exchangeRate}
                                        onChange={(event) => {
                                            setExchangeRate(event.target.value);
                                            setExchangeRateSource('MANUAL');
                                            setExchangeRateDate(new Date().toISOString());
                                            setExchangeRateError('');
                                        }}
                                        className="min-w-0 flex-1 rounded-md border border-violet-200 bg-white px-3 py-2 text-right text-sm font-bold outline-none focus:ring-2 focus:ring-violet-500/20 dark:border-violet-800 dark:bg-zinc-950"
                                    />
                                    <span className="text-xs font-semibold text-zinc-500">COP</span>
                                </div>
                                {exchangeRateError && (
                                    <p className="mt-2 text-[11px] leading-5 text-[#E11D48]">{exchangeRateError}</p>
                                )}
                            </div>
                        )}

                        <div className="space-y-3 pt-4 border-t border-zinc-100 dark:border-zinc-800">
                            <div className="flex justify-between text-xs">
                                <span className="text-zinc-500">Subtotal</span>
                                <span className="font-medium">{formatCurrency(totals.subtotal)}</span>
                            </div>
                            {currency !== 'USD' && (
                                <div className="flex justify-between items-center text-xs">
                                    <div className="flex items-center gap-2">
                                        <span className="text-zinc-500">IVA (19%)</span>
                                        <button
                                            onClick={() => setIsTaxExempt(!isTaxExempt)}
                                            className={cn(
                                                "w-6 h-3 rounded-full relative transition-colors",
                                                isTaxExempt ? "bg-zinc-200 dark:bg-zinc-700" : "bg-primary"
                                            )}
                                        >
                                            <div className={cn("absolute top-0.5 w-2 h-2 rounded-full bg-white transition-all", isTaxExempt ? "left-0.5" : "right-0.5")} />
                                        </button>
                                    </div>
                                    <span className={cn("font-medium", isTaxExempt && "text-zinc-400 line-through")}>
                                        {formatCurrency(totals.tax)}
                                    </span>
                                </div>
                            )}
                            <div className="flex justify-between text-base font-bold pt-3 border-t border-zinc-100 dark:border-zinc-800">
                                <span>Total</span>
                                <span className="text-primary">{formatCurrency(totals.total)}</span>
                            </div>
                        </div>

                        {selectedItems.length > 0 && (
                            <div className="rounded-lg border border-emerald-200 bg-emerald-50/70 p-4 dark:border-emerald-900/50 dark:bg-emerald-950/20">
                                <div className="flex items-center justify-between gap-3">
                                    <div>
                                        <p className="text-[10px] font-bold uppercase text-emerald-700 dark:text-emerald-400">Margen estimado</p>
                                        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">Solo visible dentro de Brainstudio</p>
                                    </div>
                                    {profitabilityAvailable && (
                                        <span className="text-xl font-black text-emerald-700 dark:text-emerald-400">
                                            {profitability.estimatedMargin}%
                                        </span>
                                    )}
                                </div>

                                {profitabilityAvailable ? (
                                    <div className="mt-4 space-y-2 border-t border-emerald-200/70 pt-3 text-xs dark:border-emerald-900/40">
                                        <div className="flex justify-between">
                                            <span className="text-zinc-500">Costo estimado</span>
                                            <span className="font-semibold">{formatCop(profitability.estimatedCost)}</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-zinc-500">Ganancia estimada</span>
                                            <span className="font-bold text-emerald-700 dark:text-emerald-400">{formatCop(profitability.estimatedProfit)}</span>
                                        </div>
                                        {!profitability.hasCompleteCostData && (
                                            <p className="pt-1 text-[10px] leading-relaxed text-amber-700 dark:text-amber-400">
                                                Cálculo parcial: {profitability.pricedItems} de {profitability.totalItems} servicios tienen costo registrado.
                                            </p>
                                        )}
                                    </div>
                                ) : (
                                    <p className="mt-3 border-t border-emerald-200/70 pt-3 text-[10px] leading-relaxed text-amber-700 dark:border-emerald-900/40 dark:text-amber-400">
                                        Registra una tasa USD/COP para calcular el margen estimado.
                                    </p>
                                )}
                            </div>
                        )}

                        <div className="grid grid-cols-1 gap-3">
                            <Button
                                className="w-full h-12 rounded-xl"
                                onClick={() => handleSubmit('ACTIVA')}
                                disabled={isSaving}
                            >
                                {isSaving ? "Generando..." : (wasExpired ? "Reactivar Propuesta" : "Emitir Propuesta")}
                            </Button>
                            <Button
                                variant="outline"
                                className="w-full h-12 rounded-xl border-zinc-200 dark:border-zinc-800"
                                onClick={() => handleSubmit('BORRADOR')}
                                disabled={isSaving}
                            >
                                {isSaving ? "Guardando..." : "Guardar como Borrador"}
                            </Button>
                        </div>

                        {generatedLink && (
                            <div className="p-4 bg-green-500/10 border border-green-500/20 rounded-xl space-y-3">
                                <p className="text-[10px] font-bold text-green-600 dark:text-green-400 uppercase flex items-center gap-2">
                                    <Globe className="w-3 h-3" /> Enlace Público Generado
                                </p>
                                <div className="flex gap-2">
                                    <input
                                        readOnly
                                        value={generatedLink}
                                        className="flex-1 bg-white dark:bg-zinc-950 text-[10px] border border-green-500/20 rounded-lg px-2 py-1.5 outline-none"
                                    />
                                    <button
                                        onClick={copyToClipboard}
                                        className="p-1.5 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors"
                                    >
                                        <Copy className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                            </div>
                        )}
                    </Card>

                </div>
            </div>
        </div>
    );
};

export default QuotationForm;
