import React from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import RecordDocumentsInline from '@/components/modules/financial/RecordDocumentsInline';

const formatDate = (value) => (value ? new Date(value).toLocaleDateString('es-CO', { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric' }) : '');

/**
 * El ingreso de un abono de cartera visto desde Movimientos (Elisa, 5 de octubre de 2026:
 * «registré un ingreso de SunPartners desde cartera pero no se puede adjuntar el comprobante»).
 * Su valor sigue sin editarse aquí —se corrige revirtiendo el abono en Cartera—, pero sus
 * comprobantes sí se ven y se suben, porque son evidencia y no cambian el dinero.
 */
export default function ReceivablePaymentPanel({ record, formatCurrency, canWrite, onClose, onChanged, onError }) {
    const documents = (record.documents || []).filter((document) => !document.voidedAt);
    return (
        <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg dark:bg-zinc-900">
                <DialogHeader>
                    <DialogTitle>Ingreso de un abono de cartera</DialogTitle>
                    <DialogDescription>Lo generó un abono en Cartera, así que su valor no se edita aquí. Puedes subirle el comprobante. Para corregir el abono, ve a Cartera y usa «Revertir».</DialogDescription>
                </DialogHeader>
                <div className="space-y-2 rounded-lg border border-zinc-200 px-3 py-2.5 text-xs dark:border-white/10" data-receivable-payment-panel>
                    <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1">
                        <span className="font-medium text-zinc-900 dark:text-white">{formatCurrency(Number(record.amount))}</span>
                        <span className="text-zinc-500">{formatDate(record.date)}</span>
                        <span className="min-w-0 truncate text-zinc-500">{record.account?.name || 'Sin cuenta'}</span>
                        <span className="min-w-0 flex-1 truncate text-zinc-600 dark:text-zinc-300">{record.reference || record.description || ''}</span>
                    </div>
                    <RecordDocumentsInline recordId={record.id} documents={documents} canWrite={canWrite}
                        onChanged={async (message) => { onClose(); await onChanged(message); }} onError={onError} />
                </div>
            </DialogContent>
        </Dialog>
    );
}
