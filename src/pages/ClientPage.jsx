import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, MoreHorizontal, Layout, FileText, Image, Link as LinkIcon, Download, Loader2, ExternalLink, Settings } from 'lucide-react';
import { motion } from 'framer-motion';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';
import StudioBroadcastWidget from '@/components/modules/StudioBroadcastWidget';
import { cn } from '@/lib/utils';

// Placeholder Card for Bento Grid
const BentoCard = ({ children, className, title, icon: Icon, action }) => (
  <div className={cn(
    "bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 flex flex-col relative overflow-hidden group hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors",
    className
  )}>
    <div className="flex items-center justify-between mb-4">
      <div className="flex items-center gap-2 text-zinc-500 dark:text-zinc-400">
        {Icon && <Icon className="w-4 h-4" />}
        <span className="text-xs font-semibold uppercase tracking-wider">{title}</span>
      </div>
      {action && (
        <button className="text-zinc-400 hover:text-indigo-500 transition-colors">
          {action}
        </button>
      )}
    </div>
    <div className="flex-1 relative z-10">
      {children}
    </div>
  </div>
);

const ClientPage = () => {
  const { slug } = useParams();
  const [client, setClient] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchClient = async () => {
      try {
        setLoading(true);
        const baseUrl = getApiBaseUrl();
        const res = await fetch(`${baseUrl}/api/db/clients/${slug}`);

        if (res.status === 404) throw new Error("Cliente no encontrado");
        if (!res.ok) throw new Error("Error cargando cliente");

        const data = await res.json();
        setClient(data);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    if (slug) fetchClient();
  }, [slug]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
      </div>
    );
  }

  if (error || !client) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] text-center">
        <h2 className="text-2xl font-bold text-zinc-900 dark:text-white mb-2">Cliente no encontrado</h2>
        <p className="text-zinc-500 mb-6">No pudimos encontrar el espacio de trabajo que buscas.</p>
        <Link to="/clients" className="px-4 py-2 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 rounded-lg font-medium hover:opacity-90 transition-opacity">
          Volver a Clientes
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-20">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link to="/clients" className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full text-zinc-500 hover:text-zinc-900 transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </Link>

          <div className="relative">
             <div className="w-16 h-16 rounded-2xl overflow-hidden bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-white/10 shadow-sm">
               <img src={client.logoUrl} alt={client.name} className="w-full h-full object-cover" />
             </div>
             <div className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-zinc-50 dark:border-zinc-950 ${client.status === 'active' ? 'bg-emerald-500' : 'bg-zinc-400'}`} />
          </div>

          <div>
            <h1 className="text-3xl font-bold text-zinc-900 dark:text-white tracking-tight">{client.name}</h1>
            <div className="flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
               <span className="font-mono bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded text-xs">/{client.slug}</span>
               <span>•</span>
               <span className="capitalize">{client.status === 'active' ? 'Espacio Activo' : 'Archivado'}</span>
            </div>
          </div>
        </div>

        <div className="flex gap-2">
            <button className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-zinc-600 dark:text-zinc-300 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors">
                <Settings className="w-4 h-4" />
                Configurar
            </button>
            <button className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-100 dark:border-indigo-500/20 rounded-lg hover:bg-indigo-100 dark:hover:bg-indigo-500/20 transition-colors">
                <ExternalLink className="w-4 h-4" />
                Abrir Sitio
            </button>
        </div>
      </div>

      {/* Bento Grid Layout */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4 auto-rows-[minmax(180px,auto)]">

        {/* Main Module: Bitácora (Broadcast Widget) - Spans 2 cols, 2 rows */}
        <div className="md:col-span-2 md:row-span-2 relative z-10">
           {/* We wrap it in a div to ensure height fills the grid cell */}
           <div className="h-full min-h-[400px]">
              <StudioBroadcastWidget clientId={client.id} />
           </div>
        </div>

        {/* Brand Assets Module */}
        <BentoCard
            title="Brand Assets"
            icon={Image}
            className="md:col-span-1 md:row-span-1 bg-gradient-to-br from-purple-500/5 to-indigo-500/5 dark:from-purple-500/10 dark:to-indigo-500/10"
            action={<ExternalLink className="w-3 h-3" />}
        >
            <div className="flex flex-col items-center justify-center h-full text-center space-y-2 opacity-60">
                <div className="p-3 bg-white/50 dark:bg-zinc-800/50 rounded-full">
                    <Layout className="w-6 h-6 text-purple-500" />
                </div>
                <p className="text-xs text-zinc-500">Logos, Colores, Tipografías</p>
            </div>
        </BentoCard>

        {/* Quick Links Module */}
        <BentoCard title="Enlaces Clave" icon={LinkIcon} className="md:col-span-1 md:row-span-1">
             <div className="space-y-2">
                {['Sitio Web', 'Drive Folder', 'Figma Design'].map((link, i) => (
                    <div key={i} className="flex items-center gap-2 p-2 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors cursor-pointer group/link">
                        <div className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                        <span className="text-sm text-zinc-600 dark:text-zinc-300 flex-1">{link}</span>
                        <ExternalLink className="w-3 h-3 text-zinc-300 group-hover/link:text-zinc-500" />
                    </div>
                ))}
             </div>
        </BentoCard>

        {/* Recent Files Module - Spans 2 cols (bottom right) */}
        <BentoCard title="Archivos Recientes" icon={FileText} className="md:col-span-2 md:row-span-1">
             <div className="flex items-center justify-center h-full opacity-50">
                 <p className="text-sm text-zinc-400">No hay archivos recientes.</p>
             </div>
        </BentoCard>

         {/* Deliverables Module */}
         <BentoCard
            title="Entregables"
            icon={Download}
            className="md:col-span-2 md:row-span-1 bg-zinc-50 dark:bg-zinc-900/50 border-dashed"
        >
            <div className="flex flex-col items-center justify-center h-full text-center space-y-1">
                 <p className="text-sm font-medium text-zinc-500">Próxima entrega: Q3 Review</p>
                 <span className="text-xs text-zinc-400">Vence en 4 días</span>
            </div>
        </BentoCard>

      </div>
    </div>
  );
};

export default ClientPage;
