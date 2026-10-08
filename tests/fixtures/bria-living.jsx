import React, { useCallback, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Link, useLocation } from 'react-router-dom';
import BriaAssistant from '../../src/components/bria/BriaAssistant.jsx';
import { Map, Users, CheckSquare } from '../../src/components/ui/icons';
import BrainToaster from '../../src/components/ui/BrainToaster.jsx';
import '../../src/index.css';
const owner = { id: 'local-research-owner', name: 'Rodny', role: 'ADMIN', isActive: true, modulePermissions: { bria: true, parrillas: true } };
function Preview() {
  const { pathname } = useLocation(), [dark, setDark] = useState(false), [width, setWidth] = useState(0);
  const [collapsed, setCollapsed] = useState(false);
  const onBriaOpenChange = useCallback(open => { if (open) setCollapsed(true); }, []);
  const [rows, setRows] = useState([]), [pieces, setPieces] = useState(null), [error, setError] = useState('');
  const selected = pathname.match(/^\/parrillas\/([^/]+)$/)?.[1];
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
  }, [dark]);
  useEffect(() => {
    setError(''); setPieces(null);
    const url = selected ? `/api/bria/platform/plans/${selected}` : pathname === '/clientes' ? '/api/bria/platform/clients' : '/api/bria/platform/plans';
    fetch(url).then(async response => { const result = await response.json(); if (!response.ok) throw new Error(result.message); selected ? setPieces(result.data) : setRows(result); }).catch(failure => setError(failure.message));
  }, [pathname, selected]);
  const title = pathname === '/clientes' ? 'Clientes' : pathname === '/gestion' ? 'Gestión' : 'Parrillas';
  return <div className="min-h-screen bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100"><div className="brain-ambient" aria-hidden="true" />
    <aside data-sidebar-collapsed={collapsed ? 'true' : undefined} className={`brain-glass fixed bottom-0 left-0 top-0 hidden p-5 md:block ${collapsed ? 'w-20' : 'w-52'}`}><img src="/brainstudio-mascot-tip.png" alt="" className="mb-3 h-12 w-12" /><div className={collapsed ? 'sr-only' : ''}><p className="font-semibold">Brainstudio</p><p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">Intelligence</p></div><nav className="mt-9 space-y-2">{['Parrillas','Clientes','Gestión'].map(label => <Link key={label} to={label === 'Parrillas' ? '/parrillas' : label === 'Clientes' ? '/clientes' : '/gestion'} title={collapsed ? label : undefined} className="flex min-h-11 items-center justify-center gap-2 rounded-xl px-2 py-3 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800">{React.createElement(label === 'Parrillas' ? Map : label === 'Clientes' ? Users : CheckSquare, { className: 'h-4 w-4 shrink-0' })}<span className={collapsed ? 'sr-only' : ''}>{label}</span></Link>)}</nav></aside>
    <header className={`brain-glass fixed left-0 right-0 top-0 z-20 flex h-16 items-center justify-between gap-3 px-5 ${collapsed ? 'md:left-20' : 'md:left-52'}`}><p className="text-xs text-zinc-500 dark:text-zinc-400">Vista local · lectura de la plataforma</p><div className="flex items-center gap-2"><button type="button" onClick={() => setDark(!dark)} className="min-h-11 rounded-xl px-3 text-sm">{dark ? 'Modo claro' : 'Modo oscuro'}</button><BriaAssistant currentUser={owner} initialOpen onDockWidthChange={setWidth} onOpenChange={onBriaOpenChange} /></div></header>
    <main className={`relative min-w-0 px-5 pb-8 pt-24 md:px-8 ${collapsed ? 'md:ml-20' : 'md:ml-52'}`} style={{ marginRight: width }}><h1 className="text-2xl font-semibold">{title}</h1><p className="mt-2 text-sm leading-6 text-zinc-500 dark:text-zinc-400">{pathname === '/gestion' ? 'Las tareas se consultan en el módulo de Gestión de la plataforma.' : selected ? 'Contenido leído de la parrilla actual.' : title === 'Parrillas' ? 'Octubre de 2026 · registros actuales de Brainstudio' : 'Cuentas leídas del directorio de Brainstudio'}</p>{error && <p role="alert" className="mt-5 text-sm text-destructive">{error}</p>}
      {selected && pieces && <div className="mt-7 space-y-4"><h2 className="text-lg font-semibold">{pieces.cliente}</h2>{pieces.objetivos && <p className="brain-glass rounded-2xl p-5 text-sm leading-6">{pieces.objetivos}</p>}{pieces.piezas.map(piece => <article key={piece.id} className="brain-glass rounded-2xl p-5"><p className="text-xs text-zinc-500 dark:text-zinc-400">{piece.fecha} · {piece.formato}</p><h3 className="mt-2 font-medium">{piece.titulo}</h3><p className="mt-3 whitespace-pre-wrap text-sm leading-6">{piece.textoPublicacion}</p></article>)}</div>}
      {!selected && pathname !== '/gestion' && <ul className="mt-7 grid gap-4 lg:grid-cols-2">{rows.map(row => <li key={row.id} className="brain-glass rounded-2xl p-5"><h2 className="font-medium">{row.client || row.name}</h2><p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">{row.pieces != null ? `${row.pieces} piezas · ${row.status}` : row.status}</p>{row.pieces != null && <Link to={`/parrillas/${row.id}`} className="mt-4 inline-flex min-h-11 items-center text-sm text-brand-cyan-deep dark:text-brand-cyan">Abrir parrilla</Link>}</li>)}</ul>}
      <nav className="mt-5 flex gap-4 md:hidden"><Link to="/parrillas" className="min-h-11 text-sm">Parrillas</Link><Link to="/clientes" className="min-h-11 text-sm">Clientes</Link></nav>
    </main>
  </div>;
}
createRoot(document.getElementById('root')).render(<BrowserRouter><BrainToaster /><Preview /></BrowserRouter>);
