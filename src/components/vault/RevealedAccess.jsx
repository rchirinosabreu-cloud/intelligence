import React from 'react';
import toast from 'react-hot-toast';
import { Copy } from '@/components/ui/icons';
import { cn } from '@/lib/utils';

// Lo que muestra un acceso abierto: usuario, contraseña y notas, cada uno con su botón de copiar. Lo usan la
// tarjeta de Bria y la página Bóveda, así que se ve igual en los dos sitios. Un bloque importado del Drive
// (varias cuentas en un texto) se muestra tal cual, respetando sus saltos de línea.
const Field = ({ label, value, mono = false, block = false }) => {
  if (!value) return null;
  const copy = () => navigator.clipboard.writeText(value)
    .then(() => toast.success(`${label} copiado`))
    .catch(() => toast.error(`No se pudo copiar: ${label.toLowerCase()}`));
  return (
    <div className="flex min-w-0 items-start gap-2">
      <div className="min-w-0 flex-1">
        <p className="text-xs text-zinc-500 dark:text-zinc-400">{label}</p>
        <p className={cn('text-sm text-zinc-900 dark:text-zinc-100', block ? 'max-h-80 overflow-y-auto whitespace-pre-wrap break-words' : 'break-all', mono && 'font-mono')}>{value}</p>
      </div>
      <button type="button" onClick={copy} aria-label={`Copiar ${label.toLowerCase()}`} title={`Copiar ${label.toLowerCase()}`} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800">
        <Copy className="h-4 w-4" />
      </button>
    </div>
  );
};

export default function RevealedAccess({ access }) {
  const block = access.kind === 'BLOQUE';
  return (
    <div className="space-y-2" data-vault-revealed="true">
      <Field label="Usuario" value={access.username} />
      <Field label={block ? 'Accesos' : 'Contraseña'} value={access.secret} mono={!block} block={block} />
      <Field label="Notas" value={access.notes} block />
    </div>
  );
}
