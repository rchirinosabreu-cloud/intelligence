import React from 'react';
import PageHeader from '@/components/ui/PageHeader';
import ActivityMap from './ActivityMap';
import OperationalCalendar from './OperationalCalendar';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Map, Calendar } from 'lucide-react';

const Activity = () => {
  return (
    <div className="space-y-8 pb-12">
      <PageHeader
        title="Mapa de Actividad"
        subtitle="Monitoreo en tiempo real y planificación operativa de Brainstudio 2026."
      />

      <Tabs defaultValue="map" className="space-y-6">
        <TabsList className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-1 rounded-2xl shadow-sm inline-flex">
          <TabsTrigger value="map" className="flex items-center gap-2 px-6 py-2 rounded-xl text-sm font-semibold data-[state=active]:bg-indigo-600 data-[state=active]:text-white transition-all">
            <Map className="w-4 h-4" />
            Mapa Virtual
          </TabsTrigger>
          <TabsTrigger value="calendar" className="flex items-center gap-2 px-6 py-2 rounded-xl text-sm font-semibold data-[state=active]:bg-indigo-600 data-[state=active]:text-white transition-all">
            <Calendar className="w-4 h-4" />
            Calendario Operativo
          </TabsTrigger>
        </TabsList>

        <TabsContent value="map" className="animate-in fade-in slide-in-from-bottom-4 duration-500">
          <ActivityMap />
        </TabsContent>

        <TabsContent value="calendar" className="animate-in fade-in slide-in-from-bottom-4 duration-500">
          <OperationalCalendar />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Activity;
