import React, { useState } from 'react';
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogHeader } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

export default function InitialAccessDialog({ access, onClose }) {
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState('');
  const copy = async () => {
    setCopied(false);
    try {
      await navigator.clipboard.writeText(`Acceso a Brainstudio\n${window.location.origin}/login\nCorreo: ${access.email}\nContraseña temporal: ${access.temporaryPassword}\nAl ingresar deberás elegir tu nueva contraseña.`);
      setCopied(true);
      setCopyError('');
    } catch (error) {
      console.error('[Initial access] Clipboard failed:', error?.name);
      setCopyError('No se pudo copiar. Puedes seleccionar el correo y la clave para copiarlos manualmente.');
    }
  };
  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
    <DialogContent className="rounded-2xl border-zinc-200 bg-white text-zinc-900 motion-reduce:!animate-none dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100" overlayClassName="motion-reduce:!animate-none" onInteractOutside={event => event.preventDefault()}>
      <DialogHeader className="pr-8 text-left">
        <DialogTitle>Acceso inicial listo</DialogTitle>
        <DialogDescription className="pt-2 leading-6">Comparte estos datos de forma privada con {access.name}. Al ingresar tendrá que elegir una nueva contraseña.</DialogDescription>
      </DialogHeader>
      <div className="space-y-4">
        <label className="block text-sm font-medium">Correo electrónico<input readOnly value={access.email} className="mt-2 block min-h-11 w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950" /></label>
        <label className="block text-sm font-medium">Contraseña temporal<input readOnly autoComplete="off" spellCheck={false} value={access.temporaryPassword} className="mt-2 block min-h-11 w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 font-mono text-sm dark:border-zinc-700 dark:bg-zinc-950" /></label>
        <p className="text-sm leading-6 text-zinc-500 dark:text-zinc-400">Esta clave solo se muestra ahora. No se guarda en el navegador ni podrás consultar la contraseña personal que elija el usuario.</p>
        {copyError && <p role="alert" className="text-sm leading-6 text-destructive">{copyError}</p>}
        <p role="status" className="text-sm text-teal-700 dark:text-teal-300">{copied ? 'Acceso copiado' : ''}</p>
      </div>
      <div className="flex flex-wrap justify-end gap-2"><Button variant="ghost" size="lg" onClick={onClose}>Listo</Button><Button size="lg" onClick={copy}>Copiar acceso</Button></div>
    </DialogContent>
  </Dialog>;
}
