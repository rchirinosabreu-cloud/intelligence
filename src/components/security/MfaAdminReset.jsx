import React, { useState } from 'react';
import { Loader2, ShieldCheck } from '@/components/ui/icons';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';
import { useConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useToast } from '@/components/ui/use-toast';

// Teléfono perdido (27 de septiembre de 2026): un administrador quita la verificación en dos
// pasos de otra persona; el servidor le cierra además todas sus sesiones abiertas.
const MfaAdminReset = ({ userId, name }) => {
    const confirm = useConfirmDialog();
    const { toast } = useToast();
    const [loading, setLoading] = useState(false);

    const handleReset = async () => {
        const ok = await confirm({
            title: 'Restablecer verificación en dos pasos',
            description: `${name || 'Esta persona'} tendrá que volver a vincular su app autenticadora y se cerrarán todas sus sesiones abiertas. Hazlo solo si confirmaste su identidad por otro medio.`,
            confirmLabel: 'Restablecer',
            tone: 'danger'
        });
        if (!ok) return;
        setLoading(true);
        try {
            const response = await fetch(`${getApiBaseUrl()}/api/user/mfa/reset/${encodeURIComponent(userId)}`, { method: 'POST' });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(data.error || 'No se pudo restablecer.');
            toast({ title: 'Verificación restablecida', description: 'La persona deberá activarla de nuevo al entrar.' });
        } catch (error) {
            toast({ title: 'Error', description: error.message, variant: 'destructive' });
        } finally {
            setLoading(false);
        }
    };

    return (
        <button
            type="button"
            onClick={handleReset}
            disabled={loading || !userId}
            className="mt-4 inline-flex items-center justify-center gap-2 rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
        >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
            Restablecer verificación en dos pasos
        </button>
    );
};

export default MfaAdminReset;
