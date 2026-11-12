import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import '@/index.css';
import { ClientsDirectory } from '@/components/modules/Clients';
import ClientsSection from '@/components/modules/Clients/operations/ClientsSection';
import { EXTRA_PERMISSIONS, extraPermissionsFor } from '@/lib/platformModules';

/* Muestra local del permiso «Ver la operación completa de clientes» (Rodny, 12 de noviembre
   de 2026). Datos ficticios; nada toca registros reales. */
const HELEN = { id: 'm-helen', name: 'Helen Hernández' };
const KAMILA = { id: 'm-kamila', name: 'Kamila del Toro' };
const MARICETH = { id: 'm-mariceth', name: 'Mariceth Peña' };
const TEAM = [HELEN, KAMILA, MARICETH].map((member) => ({ ...member, userId: `u-${member.id}` }));

const CLIENTS = [
    { id: 'c1', name: '2X Global', slug: '2x-global', responsible: null, projectManager: KAMILA },
    { id: 'c2', name: 'Aristea', slug: 'aristea', responsible: HELEN, projectManager: KAMILA },
    { id: 'c3', name: 'Casa Bella', slug: 'casa-bella', responsible: HELEN, projectManager: KAMILA },
    { id: 'c4', name: 'Desarrollo Económico', slug: 'desarrollo-economico', responsible: MARICETH, projectManager: KAMILA },
    { id: 'c5', name: "Mima's Kitchen", slug: 'mimas-kitchen', responsible: MARICETH, projectManager: KAMILA },
    { id: 'c6', name: 'Verona', slug: 'verona', responsible: HELEN, projectManager: KAMILA }
].map((client) => ({ ...client, isArchived: false }));

const VIEWS = [
    { key: 'cm', label: 'Community manager (sin permiso)', canManage: false, canEdit: false, myMemberId: MARICETH.id },
    { key: 'permiso', label: 'Con el permiso nuevo', canManage: true, canEdit: false, myMemberId: MARICETH.id },
    { key: 'admin', label: 'Administrador', canManage: true, canEdit: true, myMemberId: null }
];

/* La fila de casillas sueltas de Equipo, con la misma regla que la ventana real. */
const EXTRA_TONES = {
    cyan: 'border-brand-cyan/30 bg-brand-cyan/5',
    yellow: 'border-brand-yellow/40 bg-brand-yellow/10',
    green: 'border-brand-green/30 bg-brand-green/5',
    neutral: 'border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900'
};

function EquipoExtras() {
    const [role, setRole] = useState('EDITOR');
    const [permissions, setPermissions] = useState({ clientes: true, pautas: true });
    const offered = extraPermissionsFor(role, permissions);
    return (
        <section data-equipo-extras className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-white/10 dark:bg-zinc-900">
            <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">Equipo · casillas sueltas</h2>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">Las que se le ofrecen a esta persona, según su rol y sus módulos.</p>
            <div className="mt-3 flex flex-wrap gap-2">
                {['ADMIN', 'PROJECT_MANAGER', 'EDITOR', 'VIEWER'].map((option) => (
                    <button key={option} type="button" data-role-option={option} onClick={() => setRole(option)}
                        className={`min-h-11 rounded-xl border px-3 text-sm ${role === option ? 'border-brand-cyan bg-brand-cyan/10 text-brand-cyan-deep' : 'border-zinc-200 text-zinc-600 dark:border-white/10 dark:text-zinc-300'}`}>
                        {option}
                    </button>
                ))}
            </div>
            {offered.map((extra) => (
                <label key={extra.key} className={`mt-3 flex min-h-11 items-start gap-3 rounded-xl border p-3 text-sm text-zinc-700 dark:text-zinc-200 ${EXTRA_TONES[extra.tone]}`}>
                    <input type="checkbox" {...(extra.testId ? { [extra.testId]: true } : {})} checked={permissions[extra.key] === true}
                        onChange={(event) => setPermissions((prev) => ({ ...prev, [extra.key]: event.target.checked }))}
                        className="mt-0.5 h-4 w-4 text-primary focus:ring-primary" />
                    <span className="min-w-0">
                        {extra.label}
                        {extra.hint && <span className="mt-0.5 block text-xs text-zinc-500 dark:text-zinc-400">{extra.hint}</span>}
                    </span>
                </label>
            ))}
            {offered.length === 0 && <p className="mt-3 text-sm italic text-zinc-400">A este rol no se le ofrece ninguna.</p>}
            <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">
                De {EXTRA_PERMISSIONS.length} casillas, a este rol se le ofrecen {offered.length}.
            </p>
        </section>
    );
}

function App() {
    const [view, setView] = useState('cm');
    const current = VIEWS.find((item) => item.key === view);
    return (
        <BrowserRouter>
            <main className="min-h-screen bg-zinc-50/50 p-6 text-zinc-900 dark:bg-zinc-950/20 dark:text-white sm:p-10">
                <div className="mx-auto max-w-6xl space-y-6">
                    <div>
                        <p className="text-sm text-brand-cyan-deep dark:text-brand-cyan">CLIENTES · MUESTRA LOCAL</p>
                        <h1 className="mt-2 text-3xl font-bold">Quién ve qué en Clientes</h1>
                        <p className="mt-2 text-zinc-500 dark:text-zinc-400">Datos ficticios. Esta pantalla no cambia registros reales.</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {VIEWS.map((item) => (
                            <button key={item.key} type="button" data-view-option={item.key} onClick={() => setView(item.key)}
                                className={`min-h-11 rounded-xl border px-4 text-sm font-medium ${view === item.key ? 'border-brand-cyan bg-brand-cyan/10 text-brand-cyan-deep' : 'border-zinc-200 text-zinc-600 dark:border-white/10 dark:text-zinc-300'}`}>
                                {item.label}
                            </button>
                        ))}
                        <button type="button" data-toggle-theme className="min-h-11 px-3 underline"
                            onClick={() => document.documentElement.classList.toggle('dark')}>Cambiar tema</button>
                    </div>

                    <EquipoExtras />

                    <ClientsSection canManage={current.canManage} canEdit={current.canEdit} evaluated={[]} team={TEAM}
                        onNewClient={() => {}} onOpenClient={() => {}} onSaveHighlight={async () => {}}
                        directory={<ClientsDirectory clients={CLIENTS} loading={false} team={TEAM}
                            canEdit={current.canEdit} myMemberId={current.myMemberId}
                            onEdit={() => {}} onArchiveToggle={() => {}} archivePending={false} />} />
                </div>
            </main>
        </BrowserRouter>
    );
}

createRoot(document.getElementById('root')).render(<App />);
