import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { toast } from 'react-hot-toast';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';
import { DEFAULT_COLLECTION_SETTINGS, normalizeCollectionSettings } from '@/lib/receivableCollections';

// Los plazos de los avisos de cartera (punto 7 de la solicitud de Elisa; Rodny, 28 de octubre de 2026: «dejar las
// fechas flexibles para que una vez revisemos con Francisco diga que ponemos menos tiempo»). Solo los cambia un
// administrador; el servidor lo vuelve a comprobar y la misma regla dice el motivo si un valor no sirve.
const KEY = ['financial-collection-alerts'];
const auth = () => ({ headers: { Authorization: `Bearer ${localStorage.getItem('authToken')}` } });
const inputClass = 'w-full min-h-11 rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-primary/50 dark:border-white/10 dark:bg-zinc-950 dark:text-zinc-100';

const FIELDS = [
    { key: 'paymentTermDays', label: 'Días para pagar después de emitida la cuenta', help: 'Sin emitir, se cuentan desde que empieza el mes que cobra.' },
    { key: 'monthlyAlertCount', label: 'Mensualidades vencidas para avisar', help: 'Fee mensual. Llega a Administración, a Dirección y al project manager de la cuenta, a este sin cifras.' },
    { key: 'oneOffFirstAlertDays', label: 'Primer aviso de un servicio puntual, días después del vencimiento', help: 'Solo a Administración.' },
    { key: 'repeatDays', label: 'Repetir el aviso cada', help: 'Días, mientras el cliente siga sin ponerse al día.' }
];

function SettingsForm({ current, onClose }) {
    const queryClient = useQueryClient();
    const [values, setValues] = useState(() => ({ enabled: current.enabled === true, ...Object.fromEntries(FIELDS.map(({ key }) => [key, String(current[key])])) }));
    const [problem, setProblem] = useState('');
    const save = useMutation({
        mutationFn: async (payload) => (await axios.put(`${getApiBaseUrl()}/api/financials/collection-alerts`, payload, auth())).data,
        onSuccess: (data) => {
            queryClient.setQueryData(KEY, data);
            toast.success('Plazos de los avisos de cartera guardados');
            onClose();
        },
        onError: (error) => {
            console.error('[Cartera] Plazos no guardados:', error.response?.data || error.message);
            setProblem(error.response?.data?.error || 'No pudimos guardar los plazos.');
        }
    });
    const submit = (event) => {
        event.preventDefault();
        const check = normalizeCollectionSettings(values);
        if (check.problem) { setProblem(check.problem); return; }
        setProblem('');
        save.mutate(check.value);
    };
    return (
        <form onSubmit={submit} className="space-y-4">
            {/* Nacen apagados: se encienden cuando Administración haya revisado la cartera. */}
            <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-zinc-200 px-3 py-2 text-sm dark:border-white/10">
                <input type="checkbox" checked={values.enabled} data-collection-setting="enabled"
                    onChange={(event) => { setValues((prev) => ({ ...prev, enabled: event.target.checked })); setProblem(''); }}
                    className="h-4 w-4 cursor-pointer rounded text-primary focus:ring-primary" />
                <span className="font-medium text-zinc-800 dark:text-zinc-100">Avisos encendidos</span>
            </label>
            {FIELDS.map(({ key, label, help }) => (
                <label key={key} className="block space-y-1.5 text-sm">
                    <span className="block font-medium text-zinc-800 dark:text-zinc-100">{label}</span>
                    <input value={values[key]} inputMode="numeric" data-collection-setting={key}
                        onChange={(event) => { setValues((prev) => ({ ...prev, [key]: event.target.value })); setProblem(''); }} className={inputClass} />
                    <span className="block text-xs text-zinc-500 dark:text-zinc-400">{help}</span>
                </label>
            ))}
            {problem && <p role="alert" className="text-sm text-destructive brain-destructive-text">{problem}</p>}
            <DialogFooter>
                <button type="button" onClick={onClose} className="min-h-11 rounded-lg px-4 text-sm">Cancelar</button>
                <button type="submit" disabled={save.isPending} className="min-h-11 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50">
                    {save.isPending ? 'Guardando…' : 'Guardar'}
                </button>
            </DialogFooter>
        </form>
    );
}

export default function CollectionAlertSettings() {
    const [open, setOpen] = useState(false);
    const { data } = useQuery({
        queryKey: KEY,
        enabled: open,
        staleTime: 60_000,
        queryFn: async () => (await axios.get(`${getApiBaseUrl()}/api/financials/collection-alerts`, auth())).data
    });
    return (
        <>
            <button type="button" data-collection-settings-open onClick={() => setOpen(true)}
                className="min-h-11 rounded-lg border border-zinc-200 px-4 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-100 dark:border-white/10 dark:text-zinc-200 dark:hover:bg-white/5">
                Avisos de cartera
            </button>
            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent className="sm:max-w-md dark:bg-zinc-900" data-collection-settings>
                    <DialogHeader>
                        <DialogTitle>Avisos de cartera</DialogTitle>
                        <DialogDescription>
                            Cuándo vence una cuenta y cuándo avisar. La banda con las decisiones le llega a Administración; nadie recibe cifras en el celular.
                        </DialogDescription>
                    </DialogHeader>
                    {open && <SettingsForm key={data ? 'saved' : 'default'} current={data || DEFAULT_COLLECTION_SETTINGS} onClose={() => setOpen(false)} />}
                </DialogContent>
            </Dialog>
        </>
    );
}
