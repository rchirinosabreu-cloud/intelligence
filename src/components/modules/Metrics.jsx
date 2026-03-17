
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
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100 flex items-center gap-3">
            <BarChart3 className="w-8 h-8 text-primary" />
            BrainStudio Metrics
          </h1>
          <p className="text-zinc-500 dark:text-zinc-400 text-sm">
            {view === 'config' ? 'Fase 1: Configuración de Activos' : 'Fase 2: Reporte Estratégico Real-time'}
          </p>
        </div>

        {selectedClientId && integrationStatus && (
           <div className="flex items-center gap-2 bg-zinc-100 dark:bg-zinc-900 p-1 rounded-lg border border-zinc-200 dark:border-zinc-800">
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
        )}
      </div>

      {/* Main Content Area */}
      {!selectedClientId ? (
        <Card className="p-20 text-center space-y-4 opacity-50 border-dashed">
          <Users className="w-16 h-16 mx-auto text-zinc-300" />
          <h3 className="text-xl font-semibold">Esperando Cliente</h3>
          <p className="text-zinc-500 max-w-sm mx-auto">Selecciona una marca para ver sus integraciones y métricas.</p>
          <div className="max-w-xs mx-auto pt-4">
              <select
                value={selectedClientId}
                onChange={(e) => setSelectedClientId(e.target.value)}
                className="w-full h-10 px-3 rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-sm outline-none"
              >
                <option value="">-- Elige un cliente --</option>
                {clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}
              </select>
          </div>
        </Card>
      ) : loadingStatus ? (
        <div className="flex justify-center py-20"><Loader2 className="w-10 h-10 animate-spin text-primary" /></div>
      ) : !integrationStatus ? (
        <Card className="p-12 flex flex-col items-center justify-center text-center space-y-6 border-dashed">
          <div className="w-20 h-20 bg-zinc-100 dark:bg-zinc-800 rounded-full flex items-center justify-center">
            <AlertTriangle className="w-10 h-10 text-amber-500" />
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
            className="bg-[#1877F2] hover:bg-[#166fe5] text-white px-8 rounded-full flex items-center gap-3 shadow-lg transition-all"
          >
            <Facebook className="w-6 h-6 fill-current" />
            Conectar cuenta de Meta
          </Button>
        </Card>
      ) : view === 'config' ? (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
           {/* Connection Summary */}
           <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card className="p-6 border-t-4 border-green-500">
                    <div className="flex items-center justify-between mb-4">
                      <h4 className="font-bold flex items-center gap-2">
                        <CheckCircle2 className="w-5 h-5 text-green-500" />
                        Meta Connected
                      </h4>
                      <Badge variant="success">Activo</Badge>
                    </div>
                    <div className="mb-6 space-y-2 bg-zinc-50 dark:bg-zinc-900/50 p-3 rounded-lg border">
                        <div className="flex justify-between items-center text-[10px]">
                            <span className="text-zinc-400">Business:</span>
                            <span className="font-semibold truncate ml-2">
                              {integrationStatus.metadata.businessName || "Cuenta Personal"}
                            </span>
                        </div>
                    </div>
                    <div className="text-[10px] text-zinc-400 uppercase tracking-wider mb-1">Sincronizado</div>
                    <div className="text-[10px] font-mono text-zinc-600 dark:text-zinc-400 mb-6">{new Date(integrationStatus.updatedAt).toLocaleString()}</div>
                    <Button
                        variant="ghost"
                        size="sm"
                        className="w-full text-red-500 hover:bg-red-50 text-[10px] uppercase font-bold"
                        onClick={handleDisconnect}
                        disabled={disconnecting}
                    >
                        {disconnecting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Unplug className="w-3 h-3" />}
                        Desconectar Cuenta
                    </Button>
                </Card>

                <Card className="md:col-span-2 p-10 flex flex-col items-center justify-center text-center space-y-4 bg-indigo-50/30 dark:bg-indigo-900/10 border-indigo-100 dark:border-indigo-900/30">
                    <div className="p-4 bg-white dark:bg-zinc-900 rounded-2xl shadow-xl shadow-indigo-500/10">
                        <BarChart3 className="w-12 h-12 text-indigo-600" />
                    </div>
                    <div>
                        <h3 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">¿Listo para el reporte?</h3>
                        <p className="text-zinc-500 max-w-sm">Si los activos ya están mapeados correctamente, puedes acceder al análisis real-time.</p>
                    </div>
                    <Button
                      size="lg"
                      onClick={() => setView('report')}
                      className="bg-indigo-600 hover:bg-indigo-700 text-white gap-2 shadow-xl hover:scale-105 transition-all h-12 px-8 rounded-full"
                    >
                      <BarChart3 className="w-5 h-5" />
                      Ver Reporte Fase 2
                    </Button>
                </Card>
           </div>

           {/* Asset Mapping (Fase 1) */}
           <Card className="p-8 border-l-4 border-amber-500">
                <div className="flex items-center gap-3 mb-8">
                    <div className="p-2 bg-amber-100 dark:bg-amber-900/30 rounded-lg">
                       <Settings2 className="w-5 h-5 text-amber-600" />
                    </div>
                    <div>
                       <h3 className="text-lg font-bold">Mapeo de Activos</h3>
                       <p className="text-xs text-zinc-500">Víncula la página, instagram y cuenta de anuncios específica.</p>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                    <div className="space-y-6">
                        <div className="space-y-2">
                           <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">Meta Business</label>
                           <select value={selectedBusiness} onChange={(e) => setSelectedBusiness(e.target.value)} disabled={loadingAssets} className="w-full h-10 px-3 rounded-md border bg-white dark:bg-zinc-950 text-sm">
                             <option value="">-- Seleccionar Business --</option>
                             {assets.businesses.map(biz => <option key={biz.id} value={biz.id}>{biz.name}</option>)}
                           </select>
                        </div>
                        <div className="space-y-2">
                           <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">Página de Facebook</label>
                           <select value={selectedPage} onChange={(e) => setSelectedPage(e.target.value)} disabled={loadingAssets} className="w-full h-10 px-3 rounded-md border bg-white dark:bg-zinc-950 text-sm">
                             <option value="">-- Seleccionar Página --</option>
                             {assets.pages.map(page => <option key={page.id} value={page.id}>{page.name}</option>)}
                           </select>
                        </div>
                        <div className="space-y-2">
                           <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">Cuenta de Instagram</label>
                           <div className="h-10 px-3 rounded-md border bg-zinc-50 dark:bg-zinc-900/30 flex items-center text-sm italic text-zinc-500">
                              {loadingIG ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : instagramAccount ? <span className="not-italic font-medium">@{instagramAccount.username}</span> : "Auto-detectado"}
                           </div>
                        </div>
                    </div>
                    <div className="space-y-6">
                        <div className="space-y-2">
                           <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">Cuenta de Ads</label>
                           <select value={selectedAdAccount} onChange={(e) => setSelectedAdAccount(e.target.value)} disabled={loadingAssets} className="w-full h-10 px-3 rounded-md border bg-white dark:bg-zinc-950 text-sm">
                             <option value="">-- Seleccionar Cuenta de Ads --</option>
                             {assets.adAccounts.map(acc => <option key={acc.id} value={acc.id}>{acc.name} ({acc.account_id})</option>)}
                           </select>
                        </div>
                        <div className="pt-8">
                           <Button onClick={handleSaveMapping} disabled={savingMapping || !selectedPage || !selectedAdAccount} className="w-full gap-2">
                             {savingMapping ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                             Guardar Configuración
                           </Button>
                        </div>
                    </div>
                </div>
           </Card>
        </div>
      ) : (
        <div className="space-y-12 animate-in fade-in slide-in-from-right-4 duration-500">
          {/* Report Toolbar */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-zinc-50 dark:bg-zinc-900/50 p-4 rounded-xl border">
             <div className="flex items-center gap-4">
                <Badge variant="success" className="h-6">Fase 2: Live Report</Badge>
                <span className="text-sm font-medium">
                  Cliente: <span className="text-indigo-600 dark:text-indigo-400 font-bold">{clients.find(c => c.id === selectedClientId)?.name}</span>
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
                 <h3 className="text-xl font-bold flex items-center gap-2">
                   <Users className="w-6 h-6 text-primary" />
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
                <h3 className="text-xl font-bold flex items-center gap-2">
                  <TrendingUp className="w-6 h-6 text-indigo-500" />
                  Top Content
                </h3>
                <p className="text-xs text-zinc-500">Publicaciones con mayor alcance y engagement orgánico.</p>
              </div>
              <Badge variant="indigo" className="h-6">Mejor rendimiento</Badge>
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
              <h3 className="text-xl font-bold flex items-center gap-2">
                <Target className="w-6 h-6 text-emerald-500" />
                Ads Control
              </h3>
              <Badge variant="success">Meta Ads Insight</Badge>
            </div>
            <AdsControlPanel data={adsMetrics} />
          </div>

          {/* AI Insights Strategic Closure */}
          <div className="pt-12 border-t dark:border-zinc-800">
             <InsightGenerator clientId={selectedClientId} metrics={{ organic: organicMetrics, ads: adsMetrics, topContent }} />
          </div>
        </div>
      )}
    </div>
  );
};

export default Metrics;
