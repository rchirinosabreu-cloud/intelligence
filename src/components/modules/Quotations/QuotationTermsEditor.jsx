import React, { useEffect, useMemo, useState } from 'react';
import { Plus, RotateCcw, Sparkles, Trash2 } from '@/components/ui/icons';
import { Button } from '@/components/ui/button';
import {
    CONTRACT_TERM_LIBRARY,
    buildContractTermsText,
    parseContractTermsText,
    resolveSuggestedContractTermIds
} from '@/services/quotationContractTerms';

const QuotationTermsEditor = ({ services, currency, isTaxExempt, existingText, isEditing, onChange }) => {
    const [preserveExisting, setPreserveExisting] = useState(isEditing);
    const [existingTerms, setExistingTerms] = useState([]);
    const [manualIds, setManualIds] = useState([]);
    const [excludedIds, setExcludedIds] = useState([]);
    const [customTerms, setCustomTerms] = useState([]);
    const [customDraft, setCustomDraft] = useState('');
    const [existingInitialized, setExistingInitialized] = useState(false);

    useEffect(() => {
        if (!isEditing || !existingText || existingInitialized) return;
        setExistingTerms(parseContractTermsText(existingText));
        setPreserveExisting(true);
        setExistingInitialized(true);
    }, [existingInitialized, existingText, isEditing]);

    const suggestedIds = useMemo(
        () => resolveSuggestedContractTermIds(services, { currency, isTaxExempt }),
        [services, currency, isTaxExempt]
    );

    const effectiveIds = useMemo(() => {
        if (preserveExisting) return manualIds;
        return [...new Set([
            ...suggestedIds.filter((id) => !excludedIds.includes(id)),
            ...manualIds
        ])];
    }, [excludedIds, manualIds, preserveExisting, suggestedIds]);

    const effectiveCustomTerms = useMemo(
        () => preserveExisting ? [...existingTerms, ...customTerms] : customTerms,
        [customTerms, existingTerms, preserveExisting]
    );
    const finalText = useMemo(
        () => buildContractTermsText(effectiveIds, effectiveCustomTerms),
        [effectiveCustomTerms, effectiveIds]
    );

    useEffect(() => {
        onChange(finalText);
    }, [finalText, onChange]);

    const libraryById = useMemo(
        () => new Map(CONTRACT_TERM_LIBRARY.map((entry) => [entry.id, entry])),
        []
    );
    const appliedLibrary = effectiveIds.map((id) => libraryById.get(id)).filter(Boolean);
    const availableLibrary = CONTRACT_TERM_LIBRARY.filter(({ id }) => !effectiveIds.includes(id));

    const removeLibraryTerm = (id) => {
        setManualIds((current) => current.filter((termId) => termId !== id));
        if (suggestedIds.includes(id)) setExcludedIds((current) => [...new Set([...current, id])]);
    };

    const addLibraryTerm = (id) => {
        if (!id) return;
        setManualIds((current) => [...new Set([...current, id])]);
        setExcludedIds((current) => current.filter((termId) => termId !== id));
    };

    const addCustomTerm = () => {
        const value = customDraft.replace(/\s+/g, ' ').trim();
        if (!value) return;
        setCustomTerms((current) => [...current, value]);
        setCustomDraft('');
    };

    const useAutomaticSuggestions = () => {
        setPreserveExisting(false);
        setExistingTerms([]);
        setManualIds([]);
        setExcludedIds([]);
        setCustomTerms([]);
    };

    return (
        <div className="space-y-4 rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <div className="flex items-center gap-2">
                        <Sparkles className="h-4 w-4 text-[#00859C]" />
                        <h3 className="text-sm font-bold">Términos aplicados</h3>
                    </div>
                    <p className="mt-1 text-xs leading-5 text-zinc-500">
                        Revisa las cláusulas que aparecerán en la cotización. Puedes quitar, añadir o crear condiciones propias.
                    </p>
                </div>
                {preserveExisting && (
                    <Button type="button" variant="outline" size="sm" onClick={useAutomaticSuggestions}>
                        <RotateCcw className="mr-2 h-3.5 w-3.5" />
                        Recalcular automáticamente
                    </Button>
                )}
            </div>

            {preserveExisting && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-amber-300">
                    Se conservan exactamente los términos guardados anteriormente. Usa “Recalcular automáticamente” solo si deseas reemplazarlos por las reglas actuales.
                </div>
            )}

            <div className="space-y-2">
                {appliedLibrary.map((entry) => (
                    <div key={entry.id} className="flex items-start gap-3 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
                        <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                                <p className="text-xs font-bold">{entry.title}</p>
                                <span className="rounded bg-cyan-50 px-1.5 py-0.5 text-[9px] font-bold uppercase text-[#00859C] dark:bg-cyan-950/30">{entry.group}</span>
                                {!manualIds.includes(entry.id) && <span className="text-[9px] font-semibold uppercase text-zinc-400">Automático</span>}
                            </div>
                            <p className="mt-1 text-[11px] leading-5 text-zinc-500">{entry.text}</p>
                        </div>
                        <button type="button" onClick={() => removeLibraryTerm(entry.id)} className="rounded-md p-1.5 text-zinc-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/30" aria-label={`Quitar ${entry.title}`}>
                            <Trash2 className="h-3.5 w-3.5" />
                        </button>
                    </div>
                ))}

                {effectiveCustomTerms.map((text, index) => (
                    <div key={`${index}-${text.slice(0, 20)}`} className="flex items-start gap-3 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
                        <div className="min-w-0 flex-1">
                            <p className="text-[9px] font-bold uppercase text-zinc-400">Cláusula personalizada</p>
                            <textarea
                                value={text}
                                onChange={(event) => {
                                    const update = preserveExisting && index < existingTerms.length ? setExistingTerms : setCustomTerms;
                                    const targetIndex = preserveExisting ? index - (index < existingTerms.length ? 0 : existingTerms.length) : index;
                                    update((current) => current.map((termText, termIndex) => termIndex === targetIndex ? event.target.value : termText));
                                }}
                                className="mt-1 min-h-[64px] w-full resize-y bg-transparent text-[11px] leading-5 text-zinc-600 outline-none dark:text-zinc-300"
                            />
                        </div>
                        <button
                            type="button"
                            onClick={() => {
                                if (preserveExisting && index < existingTerms.length) setExistingTerms((current) => current.filter((_, termIndex) => termIndex !== index));
                                else {
                                    const customIndex = preserveExisting ? index - existingTerms.length : index;
                                    setCustomTerms((current) => current.filter((_, termIndex) => termIndex !== customIndex));
                                }
                            }}
                            className="rounded-md p-1.5 text-zinc-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/30"
                            aria-label="Quitar cláusula personalizada"
                        >
                            <Trash2 className="h-3.5 w-3.5" />
                        </button>
                    </div>
                ))}

                {appliedLibrary.length === 0 && effectiveCustomTerms.length === 0 && (
                    <p className="rounded-lg border border-dashed border-zinc-300 p-4 text-center text-xs text-zinc-400 dark:border-zinc-700">Esta cotización no tiene términos seleccionados.</p>
                )}
            </div>

            <div className="grid gap-3 border-t border-zinc-100 pt-4 dark:border-zinc-800 sm:grid-cols-2">
                <label className="space-y-1.5">
                    <span className="text-[10px] font-bold uppercase text-zinc-400">Añadir desde la biblioteca</span>
                    <select
                        defaultValue=""
                        onChange={(event) => {
                            addLibraryTerm(event.target.value);
                            event.target.value = '';
                        }}
                        className="w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs outline-none dark:border-zinc-800 dark:bg-zinc-950"
                    >
                        <option value="">Selecciona una cláusula...</option>
                        {availableLibrary.map((entry) => <option key={entry.id} value={entry.id}>{entry.group} · {entry.title}</option>)}
                    </select>
                </label>
                <div className="space-y-1.5">
                    <span className="text-[10px] font-bold uppercase text-zinc-400">Cláusula personalizada</span>
                    <div className="flex gap-2">
                        <input
                            value={customDraft}
                            onChange={(event) => setCustomDraft(event.target.value)}
                            onKeyDown={(event) => {
                                if (event.key === 'Enter') {
                                    event.preventDefault();
                                    addCustomTerm();
                                }
                            }}
                            placeholder="Escribe una condición específica..."
                            className="min-w-0 flex-1 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs outline-none dark:border-zinc-800 dark:bg-zinc-950"
                        />
                        <Button type="button" variant="outline" size="sm" onClick={addCustomTerm} aria-label="Añadir cláusula personalizada">
                            <Plus className="h-3.5 w-3.5" />
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default QuotationTermsEditor;
