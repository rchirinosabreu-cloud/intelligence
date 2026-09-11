import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import LinkDropdown from '@/components/ui/LinkDropdown';
import Select from '@/components/ui/Select';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuCheckboxItem, DropdownMenuRadioGroup, DropdownMenuRadioItem } from '@/components/ui/dropdown-menu';
import '@/index.css';
function Example() {
  const [open, setOpen] = useState(false), [value, setValue] = useState(''), [saved, setSaved] = useState('');
  const [checked, setChecked] = useState(false), [mode, setMode] = useState('one');
  const [refresh, setRefresh] = useState(false), [nativeList, setNativeList] = useState(false);
  return <main className="min-h-screen bg-zinc-50 p-10 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
    <h1 className="text-xl font-semibold">Selectores · Muestra local</h1>
    <p className="my-4 text-sm">No se guardan cambios en producción.</p>
    <div className="mb-4 max-w-sm"><LinkDropdown label="Referencia" links={['/gestion', '/actividad']} /></div>
    <label className="mb-4 grid max-w-sm gap-2">Lista extensa<Select defaultValue="0">{Array.from({ length: 100 }, (_, i) => <option key={i} value={i}>Cliente {String(i).padStart(3, '0')} · Nombre de prueba</option>)}</Select></label>
    <button onClick={() => setOpen(true)} className="min-h-11 rounded-xl border px-4">Abrir formulario</button>
    <DropdownMenu><DropdownMenuTrigger className="ml-4 min-h-11 rounded-xl border px-4">Opciones</DropdownMenuTrigger><DropdownMenuContent>
      <DropdownMenuCheckboxItem checked={checked} onCheckedChange={setChecked}>Notificaciones</DropdownMenuCheckboxItem>
      <DropdownMenuRadioGroup value={mode} onValueChange={setMode}><DropdownMenuRadioItem value="one">Una</DropdownMenuRadioItem><DropdownMenuRadioItem value="two">Dos</DropdownMenuRadioItem></DropdownMenuRadioGroup>
    </DropdownMenuContent></DropdownMenu>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent><DialogTitle>Formulario de prueba</DialogTitle><DialogDescription>Campos reales, sin servicios externos.</DialogDescription>
      <form className="grid gap-4" onSubmit={event => { event.preventDefault(); setSaved(JSON.stringify(Object.fromEntries(new FormData(event.currentTarget)))); }}>
        <label className="grid gap-2">Cuenta de Google<Select name="account" value={value} onChange={event => setValue(event.target.value)} required><option value="" disabled>Selecciona una cuenta</option><optgroup label="Conectadas"><option value="social">Social Brain</option>{!refresh && <option value="coordinador">Coordinador</option>}<option value="old" disabled>Sin conexión</option></optgroup></Select></label>
        <label className="grid gap-2">Plantilla<Select name="template" defaultValue="" size={nativeList ? 2 : undefined}><option value="">Ninguna</option><option value="monthly">Mensual</option></Select></label>
        <button type="button" onClick={() => setTimeout(() => setRefresh(true), 1000)}>Simular actualización</button>
        <button type="button" onClick={() => setNativeList(current => !current)}>Cambiar representación</button>
        <button type="submit" className="min-h-11 rounded-xl bg-primary px-4 text-primary-foreground">Comprobar formulario</button>
        <button type="reset" className="min-h-11 rounded-xl border px-4" onClick={() => setValue('')}>Restablecer</button>
        <output>{saved}</output>
      </form>
    </DialogContent></Dialog>
  </main>;
}
createRoot(document.getElementById('root')).render(<MemoryRouter><Example /></MemoryRouter>);
