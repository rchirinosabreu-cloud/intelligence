import React, { useEffect, useState } from 'react';
import { toast } from 'react-hot-toast';
import { Loader2 } from '@/components/ui/icons';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { useImportBrands } from './brandsApi';

// Cargar las fichas sacadas de los manuales del Drive (solo administradores). Al abrir muestra qué haría —qué
// ficha cae en qué cliente y cuántos logos sube— y solo escribe con «Cargar». Lo que el equipo ya escribió en
// una ficha no se pisa: a esas solo se les añaden los logos que falten.

const ACTION_LABEL = { CREAR: 'Ficha nueva', COMPLETAR: 'Ya tiene ficha', OMITIR: 'No se carga' };

function ReportRow({ line, applied }) {
    const logos = applied ? line.logosAdded : line.logosNew;
    return (
        <li className="flex flex-wrap items-start justify-between gap-2 border-b border-zinc-100 py-2 last:border-0 dark:border-white/5">
            <div className="min-w-0">
                <p className="brain-type-body text-zinc-900 dark:text-white">{line.name}</p>
                <p className="brain-type-label">
                    {line.action === 'OMITIR'
                        ? line.reason
                        : [
                            line.action === 'CREAR' && `${line.colors} colores, ${line.fonts} tipografías${line.manual ? ', manual' : ''}`,
                            `${logos || 0} logos ${applied ? 'subidos' : 'por subir'}`,
                            line.logosAlready ? `${line.logosAlready} ya estaban` : null
                        ].filter(Boolean).join(' · ')}
                </p>
                {(line.logoProblems || []).map((problem) => <p key={problem} className="brain-type-label text-destructive">{problem}</p>)}
            </div>
            <span className="brain-type-label shrink-0">{ACTION_LABEL[line.action]}</span>
        </li>
    );
}

export default function BrandImportDialog({ open, onClose }) {
    const importer = useImportBrands();
    const [result, setResult] = useState(null);

    useEffect(() => {
        if (!open) { setResult(null); return; }
        importer.mutateAsync({ apply: false }).then(setResult).catch(() => {});
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    const apply = async () => {
        try {
            const done = await importer.mutateAsync({ apply: true });
            setResult(done);
            toast.success(`Fichas cargadas: ${done.totals.created} nuevas, ${done.totals.logos} logos`);
        } catch (error) {
            toast.error(error.message);
        }
    };

    const applied = Boolean(result?.applied);
    const nothingToDo = result && result.totals.created === 0 && result.totals.logos === 0;

    return (
        <Dialog open={open} onOpenChange={(value) => !value && onClose()}>
            <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto bg-white dark:bg-zinc-950">
                <DialogTitle>Cargar fichas de los manuales</DialogTitle>
                <DialogDescription>
                    Colores, tipografías, enlace al manual y logos en PNG sacados de los manuales del Drive. Las fichas que el equipo ya escribió no se tocan.
                </DialogDescription>

                {importer.isPending && (
                    <p className="flex items-center gap-2 py-6 text-sm text-zinc-500">
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> {result ? 'Cargando: bajando logos de Drive…' : 'Revisando qué se cargaría…'}
                    </p>
                )}
                {importer.isError && !importer.isPending && <p className="text-sm text-destructive">{importer.error.message}</p>}

                {result && !importer.isPending && (
                    <>
                        <p className="brain-type-body text-zinc-800 dark:text-zinc-100">
                            {applied
                                ? `Listo: ${result.totals.created} fichas nuevas y ${result.totals.logos} logos subidos.`
                                : nothingToDo
                                    ? 'Todo lo de los manuales ya está en la plataforma.'
                                    : `Se cargarían ${result.totals.created} fichas nuevas y ${result.totals.logos} logos.`}
                        </p>
                        <ul>{result.report.map((line) => <ReportRow key={line.name} line={line} applied={applied} />)}</ul>
                    </>
                )}

                <div className="flex justify-end gap-2 pt-2">
                    <Button type="button" variant="ghost" className="brain-button-quiet min-h-11" onClick={onClose}>{applied ? 'Cerrar' : 'Cancelar'}</Button>
                    {!applied && (
                        <Button type="button" className="min-h-11" disabled={!result || nothingToDo || importer.isPending} onClick={apply}>
                            Cargar
                        </Button>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
