
import React, { useState, useEffect } from 'react';
import { BarChart3, Users, Facebook, Instagram, Megaphone, Loader2, AlertTriangle, CheckCircle2, Settings2, Save, Unplug, Eye, MousePointer2, TrendingUp, Target, Sparkles, RefreshCw } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/button';
import { toast } from 'react-hot-toast';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';
import { useQuery } from '@tanstack/react-query';
import { Badge } from '@/components/ui/Badge';

// New Components
import MetricCard from './Metrics/MetricCard';
import ReachTrendChart from './Metrics/ReachTrendChart';
import TopContentGrid from './Metrics/TopContentGrid';
import AdsControlPanel from './Metrics/AdsControlPanel';
import InsightGenerator from './Metrics/InsightGenerator';

const Metrics = () => {
  const [clients, setClients] = useState([]);
  const [selectedClientId, setSelectedClientId] = useState('');
  const [loadingClients, setLoadingClients] = useState(true);
  const [integrationStatus, setIntegrationStatus] = useState(null);
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [sdkLoaded, setSdkLoaded] = useState(false);

  // Asset Mapping State
  const [assets, setAssets] = useState({ adAccounts: [], pages: [], businesses: [] });
  const [loadingAssets, setLoadingAssets] = useState(false);
  const [selectedPage, setSelectedPage] = useState('');
  const [selectedAdAccount, setSelectedAdAccount] = useState('');
  const [selectedBusiness, setSelectedBusiness] = useState('');
  const [instagramAccount, setInstagramAccount] = useState(null);
  const [loadingIG, setLoadingIG] = useState(false);
  const [savingMapping, setSavingMapping] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  // New Step-based navigation state
  const [view, setView] = useState('config'); // 'config' or 'report'
  const [timeRange, setTimeRange] = useState('last_30');

  // Check for Meta SDK readiness
  useEffect(() => {
    const checkSDK = setInterval(() => {
      if (window.FB) {
        setSdkLoaded(true);
        clearInterval(checkSDK);
      }
    }, 500);

    return () => clearInterval(checkSDK);
  }, []);

  // Load clients on mount
  useEffect(() => {
    const fetchClients = async () => {
      try {
        const response = await fetch(`${getApiBaseUrl()}/api/db/clients`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('authToken')}` }
        });
        const data = await response.json();
        setClients(Array.isArray(data) ? data : []);
      } catch (error) {
        console.error('Error fetching clients:', error);
        toast.error('Error al cargar la lista de clientes');
      } finally {
        setLoadingClients(false);
      }
    };
    fetchClients();
  }, []);

  // Fetch integration status when client changes
  useEffect(() => {
    if (!selectedClientId) {
      setIntegrationStatus(null);
      resetMappingState();
      return;
    }

    const fetchStatus = async () => {
      setLoadingStatus(true);
      try {
        const statusResponse = await fetch(`${getApiBaseUrl()}/api/integrations/${selectedClientId}/status`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('authToken')}` }
        });
        const statusData = await statusResponse.json();
        const meta = statusData.find(i => i.provider === 'meta');
        setIntegrationStatus(meta || null);
        setSelectedBusiness(meta?.metadata?.businessId || '');

        const clientResponse = await fetch(`${getApiBaseUrl()}/api/db/clients/${selectedClientId}`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('authToken')}` }
        });
        const clientData = await clientResponse.json();

        if (clientData) {
           setSelectedPage(clientData.facebookPageId || '');
           setSelectedAdAccount(clientData.adAccountId || '');
        }

        if (meta) {
           fetchAvailableAssets();
        }

      } catch (error) {
        console.error('Error fetching status:', error);
      } finally {
        setLoadingStatus(false);
      }
    };

    fetchStatus();
  }, [selectedClientId]);

  // Metrics Data Queries (Fase 2)
  const { data: organicMetrics, isLoading: loadingOrganic } = useQuery({
    queryKey: ['metaOrganic', selectedClientId, timeRange],
    queryFn: async () => {
      const res = await fetch(`${getApiBaseUrl()}/api/integrations/meta/metrics/organic/${selectedClientId}?range=${timeRange}`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('authToken')}` }
      });
      return res.json();
    },
    enabled: !!selectedClientId && !!integrationStatus && view === 'report'
  });

  const { data: trendData, isLoading: loadingTrend } = useQuery({
    queryKey: ['metaTrend', selectedClientId, timeRange],
    queryFn: async () => {
      const res = await fetch(`${getApiBaseUrl()}/api/integrations/meta/metrics/trend/${selectedClientId}?range=${timeRange}`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('authToken')}` }
      });
      return res.json();
    },
    enabled: !!selectedClientId && !!integrationStatus && view === 'report'
  });

  const { data: topContent, isLoading: loadingTopContent } = useQuery({
    queryKey: ['metaTopContent', selectedClientId, timeRange],
    queryFn: async () => {
      const res = await fetch(`${getApiBaseUrl()}/api/integrations/meta/metrics/top-content/${selectedClientId}?range=${timeRange}`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('authToken')}` }
      });
      return res.json();
    },
    enabled: !!selectedClientId && !!integrationStatus && view === 'report'
  });

  const { data: adsMetrics, isLoading: loadingAds } = useQuery({
    queryKey: ['metaAds', selectedClientId, timeRange],
    queryFn: async () => {
      const res = await fetch(`${getApiBaseUrl()}/api/integrations/meta/metrics/ads/${selectedClientId}?range=${timeRange}`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('authToken')}` }
      });
      return res.json();
    },
    enabled: !!selectedClientId && !!integrationStatus && view === 'report'
  });

  const resetMappingState = () => {
    setAssets({ adAccounts: [], pages: [], businesses: [] });
    setSelectedPage('');
    setSelectedAdAccount('');
    setSelectedBusiness('');
    setInstagramAccount(null);
  };

  const fetchAvailableAssets = async () => {
    if (!selectedClientId) return;
    setLoadingAssets(true);
    try {
      const res = await fetch(`${getApiBaseUrl()}/api/integrations/meta/assets/${selectedClientId}`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('authToken')}` }
      });
      const data = await res.json();
      if (res.ok) {
        setAssets(data);
      } else {
        toast.error('No se pudieron cargar los activos de Meta');
      }
    } catch (error) {
      console.error('Error fetching assets:', error);
    } finally {
      setLoadingAssets(false);
    }
  };

  useEffect(() => {
    if (!selectedPage || !selectedClientId) {
      setInstagramAccount(null);
      return;
    }

    const fetchIG = async () => {
      setLoadingIG(true);
      try {
        const res = await fetch(`${getApiBaseUrl()}/api/integrations/meta/instagram/${selectedClientId}?pageId=${selectedPage}`, {
          headers: { 'Authorization': `Bearer ${localStorage.getItem('authToken')}` }
        });
        const data = await res.json();
        setInstagramAccount(data);
      } catch (error) {
        console.error('Error fetching IG:', error);
      } finally {
        setLoadingIG(false);
      }
    };

    fetchIG();
  }, [selectedPage, selectedClientId]);

  const handleMetaLogin = () => {
    if (!sdkLoaded || !window.FB) {
      toast.error('El SDK de Meta no se ha cargado correctamente.');
      return;
    }

    window.FB.login((response) => {
      if (response.authResponse) {
        exchangeToken(response.authResponse.accessToken);
      } else {
        toast.error('Inicio de sesión cancelado.');
      }
    }, {
      scope: 'pages_show_list,pages_read_engagement,pages_manage_engagement,instagram_basic,instagram_manage_insights,ads_read,ads_management,business_management',
      return_scopes: true
    });
  };

  const exchangeToken = async (accessToken) => {
    try {
      const response = await fetch(`${getApiBaseUrl()}/api/integrations/meta/exchange`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('authToken')}`
        },
        body: JSON.stringify({ clientId: selectedClientId, accessToken, metadata: { connectedAt: new Date().toISOString() } })
      });

      if (response.ok) {
        toast.success('¡Cuenta de Meta vinculada correctamente!');
        const statusResponse = await fetch(`${getApiBaseUrl()}/api/integrations/${selectedClientId}/status`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('authToken')}` }
        });
        const statusData = await statusResponse.json();
        const meta = statusData.find(i => i.provider === 'meta');
        setIntegrationStatus(meta || null);
        if (meta) fetchAvailableAssets();
      }
    } catch (error) {
      toast.error(`Error al vincular: ${error.message}`);
    }
  };

  const handleDisconnect = async () => {
    if (!window.confirm('¿Estás seguro? Perderás la configuración.')) return;
    setDisconnecting(true);
    try {
        const res = await fetch(`${getApiBaseUrl()}/api/integrations/${selectedClientId}/meta`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${localStorage.getItem('authToken')}` }
        });
        if (res.ok) {
            toast.success('Cuenta desconectada');
            setIntegrationStatus(null);
            resetMappingState();
            setView('config');
        }
    } catch (error) {
        toast.error('Error de red');
    } finally {
        setDisconnecting(false);
    }
  };

  const handleSaveMapping = async () => {
    setSavingMapping(true);
    try {
      const res = await fetch(`${getApiBaseUrl()}/api/integrations/meta/mapping/${selectedClientId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('authToken')}`
        },
        body: JSON.stringify({
          facebookPageId: selectedPage,
          instagramBusinessId: instagramAccount?.id || null,
          adAccountId: selectedAdAccount,
          businessId: selectedBusiness
        })
      });

      if (res.ok) {
        toast.success('Mapeo guardado');
        const statusResponse = await fetch(`${getApiBaseUrl()}/api/integrations/${selectedClientId}/status`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('authToken')}` }
        });
        const statusData = await statusResponse.json();
        const meta = statusData.find(i => i.provider === 'meta');
        setIntegrationStatus(meta || null);
      }
    } catch (error) {
      toast.error('Error de red');
    } finally {
      setSavingMapping(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-zinc-900 dark:text-white mb-2 flex items-center gap-3">
            <BarChart3 className="w-6 h-6 text-primary" />
            BrainStudio Metrics
          </h2>
          <p className="text-zinc-500 dark:text-zinc-400 text-sm">
            {view === 'config' ? 'Configuración de Activos' : 'Reporte Estratégico Real-time'}
          </p>
        </div>

        {selectedClientId && integrationStatus && (
           <div className="flex items-center gap-3">
             {view === 'report' && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled
                  className="text-xs h-9 gap-2 border-zinc-200 dark:border-zinc-800 text-zinc-400 cursor-not-allowed hidden md:flex"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Descargar Reporte (PDF)
                </Button>
             )}
             <div className="flex items-center gap-2 bg-zinc-100 dark:bg-zinc-900 p-1 rounded-lg border border-zinc-200 dark:border-zinc-800 shadow-none">
              <Button
                variant={view === 'config' ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setView('config')}
                className="text-xs h-8"
              >
                Configuración
              </Button>
              <Button
                variant={view === 'report' ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setView('report')}
                className="text-xs h-8"
              >
                Reporte
              </Button>
           </div>
           </div>
        )}
      </div>

      {/* Main Content Area */}
      {!selectedClientId ? (
        <Card className="p-20 text-center space-y-6 border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 shadow-none">
          <div className="w-20 h-20 bg-zinc-50 dark:bg-zinc-900 rounded-full flex items-center justify-center mx-auto border border-zinc-100 dark:border-zinc-800">
            <Users className="w-8 h-8 text-zinc-400" />
          </div>
          <div className="space-y-2">
            <h3 className="text-xl font-bold">Selecciona una Marca</h3>
            <p className="text-zinc-500 text-sm max-w-xs mx-auto">Elige un cliente para configurar sus activos de Meta y generar reportes.</p>
          </div>
          <div className="max-w-xs mx-auto pt-4">
              <select
                value={selectedClientId}
                onChange={(e) => setSelectedClientId(e.target.value)}
                className="w-full h-11 px-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-sm outline-none focus:ring-2 focus:ring-primary/20 transition-all appearance-none cursor-pointer"
                style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='currentColor'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 1rem center', backgroundSize: '1rem' }}
              >
                <option value="">-- Elige un cliente --</option>
                {clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}
              </select>
          </div>
        </Card>
      ) : loadingStatus ? (
        <div className="flex justify-center py-20"><Loader2 className="w-10 h-10 animate-spin text-primary" /></div>
      ) : !integrationStatus ? (
        <Card className="p-12 flex flex-col items-center justify-center text-center space-y-6 bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 shadow-none">
          <div className="w-20 h-20 bg-zinc-50 dark:bg-zinc-900 rounded-full flex items-center justify-center border border-zinc-100 dark:border-zinc-800">
            <AlertTriangle className="w-8 h-8 text-zinc-400" />
          </div>
          <div className="space-y-2">
            <h3 className="text-2xl font-bold">Sin Conexión</h3>
            <p className="text-sm text-zinc-500 max-w-lg mx-auto">
              Este cliente aún no tiene vinculada su cuenta de Meta Business.
            </p>
          </div>
          <Button
            size="lg"
            onClick={handleMetaLogin}
            className="bg-primary hover:bg-primary/90 text-white px-8 rounded-full flex items-center gap-3 transition-all"
          >
            <Facebook className="w-6 h-6 fill-current" />
            Conectar cuenta de Meta
          </Button>
        </Card>
      ) : view === 'config' ? (
        <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-2 duration-300 max-w-5xl mx-auto">
           {/* Connection Summary */}
            <Card className="p-6 border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 shadow-none">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-emerald-50 dark:bg-emerald-500/10 rounded-full flex items-center justify-center border border-emerald-100 dark:border-emerald-500/20">
                            <CheckCircle2 className="w-6 h-6 text-emerald-500" />
                        </div>
                        <div>
                            <h4 className="font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                                Meta Business Connected
                                <Badge variant="success" className="text-[9px] h-5 bg-emerald-500/10 text-emerald-500 border-emerald-500/20 uppercase">Activo</Badge>
                            </h4>
                            <div className="flex items-center gap-3 mt-1">
                                <span className="text-xs text-zinc-500 flex items-center gap-1">
                                    <span className="font-bold text-zinc-400">CUENTA:</span> {integrationStatus.metadata.businessName || "Cuenta Personal"}
                                </span>
                                <span className="text-xs text-zinc-500 flex items-center gap-1">
                                    <span className="font-bold text-zinc-400">ÚLTIMA SYNC:</span> {new Date(integrationStatus.updatedAt).toLocaleDateString()}
                                </span>
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        <Button
                            variant="ghost"
                            size="sm"
                            className="text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/10 text-[10px] uppercase font-bold h-9 px-4"
                            onClick={handleDisconnect}
                            disabled={disconnecting}
                        >
                            {disconnecting ? <Loader2 className="w-3 h-3 animate-spin mr-2" /> : <Unplug className="w-3 h-3 mr-2" />}
                            Desconectar
                        </Button>
                        <Button
                            size="sm"
                            onClick={() => setView('report')}
                            className="bg-primary hover:bg-primary/90 text-white gap-2 h-9 text-xs shadow-sm px-6 rounded-lg font-bold"
                        >
                            <BarChart3 className="w-4 h-4" />
                            Ver Dashboard
                        </Button>
                    </div>
                </div>
            </Card>

            {/* Asset Mapping (Fase 1) */}
            <Card className="p-8 border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 shadow-none">
                <div className="flex items-center gap-3 mb-8 pb-4 border-b border-zinc-100 dark:border-zinc-800">
                    <div className="p-2 bg-zinc-50 dark:bg-zinc-900 rounded-lg border border-zinc-100 dark:border-zinc-800">
                        <Settings2 className="w-5 h-5 text-zinc-500" />
                    </div>
                    <div>
                        <h3 className="text-lg font-bold">Mapeo de Activos</h3>
                        <p className="text-xs text-zinc-500">Víncula la página, instagram y cuenta de anuncios específica.</p>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-8">
                    <div className="space-y-6">
                        <div className="space-y-2">
                            <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">Meta Business Manager</label>
                            <select value={selectedBusiness} onChange={(e) => setSelectedBusiness(e.target.value)} disabled={loadingAssets} className="w-full h-11 px-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-sm focus:ring-2 focus:ring-primary/20 outline-none transition-all">
                                <option value="">-- Seleccionar Business --</option>
                                {assets.businesses.map(biz => <option key={biz.id} value={biz.id}>{biz.name}</option>)}
                            </select>
                        </div>
                        <div className="space-y-2">
                            <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">Página de Facebook</label>
                            <select value={selectedPage} onChange={(e) => setSelectedPage(e.target.value)} disabled={loadingAssets} className="w-full h-11 px-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-sm focus:ring-2 focus:ring-primary/20 outline-none transition-all">
                                <option value="">-- Seleccionar Página --</option>
                                {assets.pages.map(page => <option key={page.id} value={page.id}>{page.name}</option>)}
                            </select>
                        </div>
                    </div>
                    <div className="space-y-6">
                        <div className="space-y-2">
                            <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">Cuenta de Anuncios (Ads)</label>
                            <select value={selectedAdAccount} onChange={(e) => setSelectedAdAccount(e.target.value)} disabled={loadingAssets} className="w-full h-11 px-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-sm focus:ring-2 focus:ring-primary/20 outline-none transition-all">
                                <option value="">-- Seleccionar Cuenta de Ads --</option>
                                {assets.adAccounts.map(acc => <option key={acc.id} value={acc.id}>{acc.name} ({acc.account_id})</option>)}
                            </select>
                        </div>
                        <div className="space-y-2">
                            <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">Cuenta de Instagram vinculada</label>
                            <div className="h-11 px-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/30 flex items-center justify-between text-sm italic text-zinc-500">
                                <div className="flex items-center gap-2">
                                    <Instagram className="w-4 h-4 text-zinc-400" />
                                    {loadingIG ? <Loader2 className="w-4 h-4 animate-spin" /> : instagramAccount ? <span className="not-italic font-bold text-zinc-900 dark:text-zinc-100">@{instagramAccount.username}</span> : "Auto-detectado por Página"}
                                </div>
                                {instagramAccount && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
                            </div>
                        </div>
                    </div>
                </div>
                <div className="mt-12 pt-8 border-t border-zinc-100 dark:border-zinc-800 flex justify-end">
                    <Button onClick={handleSaveMapping} disabled={savingMapping || !selectedPage || !selectedAdAccount} className="bg-primary hover:bg-primary/90 text-white gap-2 px-10 h-11 rounded-xl font-bold shadow-sm transition-all active:scale-95">
                        {savingMapping ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        Guardar Configuración
                    </Button>
                </div>
            </Card>
        </div>
      ) : (
        <div className="space-y-12 animate-in fade-in slide-in-from-right-4 duration-500">
          {/* Report Toolbar */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 py-4 border-b border-zinc-100 dark:border-zinc-800">
             <div className="flex items-center gap-4">
                <span className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
                  Cliente: <span className="text-zinc-900 dark:text-zinc-100 font-bold">{clients.find(c => c.id === selectedClientId)?.name}</span>
                </span>
             </div>

             <div className="flex items-center gap-2">
                <label className="text-xs font-bold text-zinc-400 uppercase">Periodo:</label>
                <select value={timeRange} onChange={(e) => setTimeRange(e.target.value)} className="bg-white dark:bg-zinc-950 border rounded-md text-xs px-2 py-1.5 outline-none focus:ring-2 focus:ring-primary">
                   <option value="last_30">Últimos 30 días</option>
                   <option value="this_month">Mes actual</option>
                   <option value="last_month">Mes anterior</option>
                   <option value="q1">Q1 (Ene - Mar)</option>
                   <option value="q2">Q2 (Abr - Jun)</option>
                   <option value="q3">Q3 (Jul - Sep)</option>
                   <option value="q4">Q4 (Oct - Dic)</option>
                </select>
             </div>
          </div>

          {/* Metrics Organic Overview */}
          <div className="space-y-6">
             <div className="flex items-center justify-between">
               <div className="space-y-1">
                 <h3 className="text-lg font-bold flex items-center gap-2">
                   <Users className="w-5 h-5 text-zinc-400" />
                   Overview Orgánico
                 </h3>
                 <p className="text-xs text-zinc-500">Rendimiento general de las comunidades de Facebook e Instagram.</p>
               </div>
               <Badge variant="outline" className="h-6">Métricas de Comunidad</Badge>
             </div>

             {loadingOrganic ? (
                <div className="h-32 flex items-center justify-center bg-zinc-50 dark:bg-zinc-900/50 rounded-xl border border-dashed"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
             ) : organicMetrics ? (
               <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                 <MetricCard title="Impresiones" current={organicMetrics.combined.current.impressions} previous={organicMetrics.combined.previous.impressions} icon={Eye} color="#1877F2" />
                 <MetricCard title="Interacciones" current={organicMetrics.combined.current.interactions} previous={organicMetrics.combined.previous.interactions} icon={MousePointer2} color="#E1306C" />
                 <MetricCard title="Seguidores" current={organicMetrics.combined.current.followers} previous={organicMetrics.combined.previous.followers} icon={Users} color="#8B5CF6" />
                 <MetricCard title="Alcance Total" current={organicMetrics.combined.current.reach} previous={organicMetrics.combined.previous.reach} icon={TrendingUp} color="#10B981" />
               </div>
             ) : null}

             <div className="grid grid-cols-1 gap-8">
                 <ReachTrendChart data={trendData} />
             </div>
          </div>

          {/* Top Content Visual Grid */}
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <h3 className="text-lg font-bold flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-zinc-400" />
                  Top Content
                </h3>
                <p className="text-xs text-zinc-500">Publicaciones con mayor alcance y engagement orgánico.</p>
              </div>
              <Badge variant="outline" className="h-6">Mejor rendimiento</Badge>
            </div>
            {loadingTopContent ? (
               <div className="h-48 flex items-center justify-center bg-zinc-50 dark:bg-zinc-900/50 rounded-xl border border-dashed"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
            ) : (
               <TopContentGrid content={topContent} />
            )}
          </div>

          {/* Ads Control */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
               <div className="space-y-1">
                 <h3 className="text-lg font-bold flex items-center gap-2">
                   <Target className="w-5 h-5 text-zinc-400" />
                   Ads Control
                 </h3>
                 <p className="text-xs text-zinc-500">Resumen de inversión y conversiones en Meta Ads.</p>
               </div>
               <Badge variant="outline" className="h-6">Meta Ads Insight</Badge>
            </div>
            <AdsControlPanel data={adsMetrics} />
          </div>

          {/* AI Insights Strategic Closure */}
          <div className="pt-12 border-t border-zinc-100 dark:border-zinc-800">
             <InsightGenerator clientId={selectedClientId} metrics={{ organic: organicMetrics, ads: adsMetrics, topContent }} />
          </div>
        </div>
      )}
    </div>
  );
};

export default Metrics;
