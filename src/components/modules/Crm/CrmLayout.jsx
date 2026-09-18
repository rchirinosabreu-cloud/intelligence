import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import PageHeader from '@/components/ui/PageHeader';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { LayoutDashboard, ListTodo, CalendarClock, BarChart3, Plus } from '@/components/ui/icons';
import { useAuth } from '@/context/AuthContext';
import { readCrmFilters, writeCrmFilters } from '@/lib/crmFilterSession';
import { useCrmTeam } from './crmApi';
import CrmDashboard from './CrmDashboard';
import CrmLeadList from './CrmLeadList';
import CrmFollowUps from './CrmFollowUps';
import CrmLeadForm from './CrmLeadForm';

const TABS = ['dashboard', 'oportunidades', 'seguimientos', 'reportes'];

const CrmLayout = () => {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = TABS.includes(searchParams.get('tab')) ? searchParams.get('tab') : 'dashboard';
  const [filters, setFilters] = useState(() => readCrmFilters(window.sessionStorage, currentUser));
  const [creating, setCreating] = useState(false);
  const { data: team = [] } = useCrmTeam();

  useEffect(() => { writeCrmFilters(window.sessionStorage, currentUser, filters); }, [filters, currentUser]);

  const selectTab = value => {
    const next = new URLSearchParams(searchParams);
    if (value === 'dashboard') next.delete('tab'); else next.set('tab', value);
    setSearchParams(next, { replace: true });
  };

  return (
    <div className="space-y-6">
      <PageHeader title="CRM comercial" subtitle="Bitácora SDR de Brain Studio: cada oportunidad con su siguiente paso.">
        <Button onClick={() => setCreating(true)} className="flex items-center gap-2 rounded-xl">
          <Plus className="h-4 w-4" /> Nueva oportunidad
        </Button>
      </PageHeader>

      <Tabs value={tab} onValueChange={selectTab} className="w-full">
        <TabsList className="mb-6 flex h-auto w-full max-w-2xl flex-wrap justify-start gap-1 rounded-2xl border border-zinc-200 bg-zinc-100 p-1 dark:border-zinc-800 dark:bg-zinc-800/50">
          <TabsTrigger value="dashboard" className="flex flex-1 items-center gap-2 rounded-xl py-2"><LayoutDashboard className="h-4 w-4" /> Dashboard</TabsTrigger>
          <TabsTrigger value="oportunidades" className="flex flex-1 items-center gap-2 rounded-xl py-2"><ListTodo className="h-4 w-4" /> Oportunidades</TabsTrigger>
          <TabsTrigger value="seguimientos" className="flex flex-1 items-center gap-2 rounded-xl py-2"><CalendarClock className="h-4 w-4" /> Seguimientos</TabsTrigger>
          <TabsTrigger value="reportes" disabled title="Reportes llegan en la fase 2" className="flex flex-1 items-center gap-2 rounded-xl py-2">
            <BarChart3 className="h-4 w-4" /> Reportes
            <span className="hidden rounded-full bg-zinc-200 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-500 dark:bg-zinc-700 dark:text-zinc-300 sm:inline">Fase 2</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard" className="outline-none animate-in fade-in slide-in-from-bottom-2 duration-300">
          <CrmDashboard filters={filters} onFiltersChange={setFilters} team={team} onOpenLead={id => navigate(`/crm/oportunidades/${id}`)} onShowTab={selectTab} />
        </TabsContent>
        <TabsContent value="oportunidades" className="outline-none animate-in fade-in slide-in-from-bottom-2 duration-300">
          <CrmLeadList filters={filters} onFiltersChange={setFilters} team={team} onOpenLead={id => navigate(`/crm/oportunidades/${id}`)} onCreate={() => setCreating(true)} />
        </TabsContent>
        <TabsContent value="seguimientos" className="outline-none animate-in fade-in slide-in-from-bottom-2 duration-300">
          <CrmFollowUps filters={filters} onFiltersChange={setFilters} team={team} onOpenLead={id => navigate(`/crm/oportunidades/${id}`)} />
        </TabsContent>
      </Tabs>

      <CrmLeadForm open={creating} onOpenChange={setCreating} team={team} onSaved={lead => { setCreating(false); navigate(`/crm/oportunidades/${lead.id}`); }} />
    </div>
  );
};

export default CrmLayout;
