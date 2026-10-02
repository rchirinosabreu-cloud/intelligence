import React from 'react';
import { useSearchParams } from 'react-router-dom';
import PageHeader from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Activity, Plus, Users, Building2, Loader2 } from '@/components/ui/icons';
import ClientOperationsBoard from './ClientOperationsBoard';
import TeamLoadView from './TeamLoadView';

// Clientes con pestañas (Rodny, 2 de octubre de 2026: «puede crearse más bien un tab»). «Operación» y
// «Equipo» solo los ven administradores y project managers; el resto ve el directorio, sin pestañas.

const MANAGER_TABS = ['operacion', 'equipo', 'directorio'];
const TRIGGER = 'flex flex-1 items-center gap-2 rounded-xl py-2';
const Loading = () => <div className="flex min-h-[30vh] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-brand-cyan" /></div>;
const LoadError = ({ text }) => <p role="alert" className="brain-alert-surface rounded-xl p-4 text-sm">{text}</p>;

export default function ClientsSection({ canManage, evaluated, team, directory, loading = false, error = '', onOpenClient, onNewClient, onSaveHighlight }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = MANAGER_TABS.includes(searchParams.get('tab')) ? searchParams.get('tab') : 'operacion';
  const selectTab = (value) => {
    const next = new URLSearchParams(searchParams);
    if (value === 'operacion') next.delete('tab'); else next.set('tab', value);
    setSearchParams(next, { replace: true });
  };
  // Un error de lectura nunca se presenta como «todo al día»: se dice y no se pinta el tablero.
  const body = (view) => (error ? <LoadError text={error} /> : loading ? <Loading /> : view);

  return (
    <div className="space-y-6 pb-20 animate-in fade-in duration-200">
      <PageHeader title="Clientes" subtitle={canManage ? 'Cómo va cada cliente este mes, calculado con sus parrillas y sus tareas.' : 'Los clientes de la agencia y sus espacios de trabajo.'}>
        <Button onClick={onNewClient} size="lg"><Plus className="mr-2 h-4 w-4" />Nuevo cliente</Button>
      </PageHeader>

      {canManage ? (
        <Tabs value={tab} onValueChange={selectTab} className="w-full">
          <TabsList className="mb-6 flex h-auto w-full max-w-xl flex-wrap justify-start gap-1 rounded-2xl border border-zinc-200 bg-zinc-100 p-1 dark:border-zinc-800 dark:bg-zinc-800/50">
            <TabsTrigger value="operacion" className={TRIGGER}><Activity className="h-4 w-4" />Operación</TabsTrigger>
            <TabsTrigger value="equipo" className={TRIGGER}><Users className="h-4 w-4" />Equipo</TabsTrigger>
            <TabsTrigger value="directorio" className={TRIGGER}><Building2 className="h-4 w-4" />Directorio</TabsTrigger>
          </TabsList>
          <TabsContent value="operacion" className="outline-none">{body(<ClientOperationsBoard evaluated={evaluated} team={team} onOpenClient={onOpenClient} />)}</TabsContent>
          <TabsContent value="equipo" className="outline-none">{body(<TeamLoadView evaluated={evaluated} onOpenClient={onOpenClient} onSaveHighlight={onSaveHighlight} />)}</TabsContent>
          <TabsContent value="directorio" className="outline-none">{directory}</TabsContent>
        </Tabs>
      ) : directory}
    </div>
  );
}
