
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
import TopContentTable from './Metrics/TopContentTable';
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

  // Metrics Data Queries
  const { data: organicMetrics, isLoading: loadingOrganic, refetch: refetchOrganic } = useQuery({
    queryKey: ['metaOrganic', selectedClientId],
    queryFn: async () => {
      const res = await fetch(`${getApiBaseUrl()}/api/integrations/meta/metrics/organic/${selectedClientId}`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('authToken')}` }
      });
      return res.json();
    },
    enabled: !!selectedClientId && !!integrationStatus
  });

  const { data: trendData, isLoading: loadingTrend } = useQuery({
    queryKey: ['metaTrend', selectedClientId],
    queryFn: async () => {
      const res = await fetch(`${getApiBaseUrl()}/api/integrations/meta/metrics/trend/${selectedClientId}`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('authToken')}` }
      });
      return res.json();
    },
    enabled: !!selectedClientId && !!integrationStatus
  });

  const { data: topContent, isLoading: loadingTopContent } = useQuery({
    queryKey: ['metaTopContent', selectedClientId],
    queryFn: async () => {
      const res = await fetch(`${getApiBaseUrl()}/api/integrations/meta/metrics/top-content/${selectedClientId}`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('authToken')}` }
      });
      return res.json();
    },
    enabled: !!selectedClientId && !!integrationStatus
  });

  const { data: adsMetrics, isLoading: loadingAds } = useQuery({
    queryKey: ['metaAds', selectedClientId],
    queryFn: async () => {
      const res = await fetch(`${getApiBaseUrl()}/api/integrations/meta/metrics/ads/${selectedClientId}`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('authToken')}` }
      });
      return res.json();
    },
    enabled: !!selectedClientId && !!integrationStatus
  });

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
        // 1. Fetch integration status
        const statusResponse = await fetch(`${getApiBaseUrl()}/api/integrations/${selectedClientId}/status`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('authToken')}` }
        });
        const statusData = await statusResponse.json();
        const meta = statusData.find(i => i.provider === 'meta');
        setIntegrationStatus(meta || null);

        setSelectedBusiness(meta?.metadata?.businessId || '');

        // 2. Fetch current client mapping from Client DB
        const clientResponse = await fetch(`${getApiBaseUrl()}/api/db/clients/${selectedClientId}`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('authToken')}` }
        });
        const clientData = await clientResponse.json();

        if (clientData) {
           setSelectedPage(clientData.facebookPageId || '');
           setSelectedAdAccount(clientData.adAccountId || '');
        }

        // 3. If connected, fetch available assets
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

  const resetMappingState = () => {
    setAssets({ adAccounts: [], pages: [], businesses: [] });
    setSelectedPage('');
    setSelectedAdAccount('');
    setSelectedBusiness('');
    setInstagramAccount(null);
  };

  const fetchAvailableAssets = async () => {
    if (!selectedClientId) return;
    console.log(`[Metrics UI] Fetching assets for Client ID: ${selectedClientId}`);
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

  // Fetch Instagram when Page changes
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
      toast.error('El SDK de Meta no se ha cargado correctamente. Verifica el App ID.');
      return;
    }

    window.FB.login((response) => {
      if (response.authResponse) {
        console.log('Login exitoso de Meta:', response.authResponse);
        exchangeToken(response.authResponse.accessToken);
      } else {
        console.log('Usuario canceló login o no dio permisos.');
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
        body: JSON.stringify({
          clientId: selectedClientId,
          accessToken,
          metadata: {
            connectedAt: new Date().toISOString()
          }
        })
      });

      const data = await response.json();

      if (response.ok) {
        toast.success('¡Cuenta de Meta vinculada correctamente!');
        // Refresh everything
        const statusResponse = await fetch(`${getApiBaseUrl()}/api/integrations/${selectedClientId}/status`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('authToken')}` }
        });
        const statusData = await statusResponse.json();
        const meta = statusData.find(i => i.provider === 'meta');
        setIntegrationStatus(meta || null);
        if (meta) fetchAvailableAssets();
      } else {
        throw new Error(data.details || data.error);
      }
    } catch (error) {
      console.error('Error exchanging token:', error);
      toast.error(`Error al vincular: ${error.message}`);
    }
  };

  const handleDisconnect = async () => {
    if (!window.confirm('¿Estás seguro de que deseas desconectar la cuenta de Meta? Perderás la configuración de activos.')) return;

    setDisconnecting(true);
    try {
        const res = await fetch(`${getApiBaseUrl()}/api/integrations/${selectedClientId}/meta`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${localStorage.getItem('authToken')}` }
        });

        if (res.ok) {
            toast.success('Cuenta desconectada correctamente');
            setIntegrationStatus(null);
            resetMappingState();
        } else {
            toast.error('Error al desconectar');
        }
    } catch (error) {
        console.error('Error disconnecting:', error);
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
        toast.success('Mapeo de activos guardado correctamente');
        // Refresh integration status to show updated business name in the card
        const statusResponse = await fetch(`${getApiBaseUrl()}/api/integrations/${selectedClientId}/status`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('authToken')}` }
        });
        const statusData = await statusResponse.json();
        const meta = statusData.find(i => i.provider === 'meta');
        setIntegrationStatus(meta || null);
      } else {
        toast.error('Error al guardar el mapeo');
      }
    } catch (error) {
      console.error('Error saving mapping:', error);
      toast.error('Error de red al guardar');
    } finally {
      setSavingMapping(false);
    }
  };

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100 flex items-center gap-3">
          <BarChart3 className="w-8 h-8 text-primary" />
          BrainStudio Metrics
        </h1>
        <p className="text-zinc-500 dark:text-zinc-400">
          Visualiza y analiza el rendimiento de tus campañas en tiempo real.
        </p>
      </div>

      {/* Client Selector */}
      <Card className="p-6">
        <div className="flex flex-col md:flex-row md:items-end gap-4">
          <div className="flex-1 space-y-2">
            <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Selecciona un Cliente</label>
            <select
              value={selectedClientId}
              onChange={(e) => setSelectedClientId(e.target.value)}
              disabled={loadingClients}
              className="w-full h-10 px-3 rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-sm focus:ring-2 focus:ring-primary outline-none transition-all"
            >
              <option value="">-- Elige un cliente --</option>
              {clients.map((client) => (
                <option key={client.id} value={client.id}>{client.name}</option>
              ))}
            </select>
          </div>
          <div className="flex-none">
            {loadingClients && <Loader2 className="w-5 h-5 animate-spin text-zinc-400" />}
          </div>
        </div>
      </Card>

      {/* Content Area */}
      {!selectedClientId ? (
        <div className="flex flex-col items-center justify-center py-10 md:py-20 text-center space-y-4 opacity-50">
          <Users className="w-16 h-16 text-zinc-300" />
          <div>
            <h3 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">Esperando Cliente</h3>
            <p className="text-zinc-500 max-w-sm">Selecciona una marca del menú superior para ver sus integraciones y métricas.</p>
          </div>
        </div>
      ) : loadingStatus ? (
        <div className="flex justify-center py-20">
          <Loader2 className="w-10 h-10 animate-spin text-primary" />
        </div>
      ) : !integrationStatus ? (
        <Card className="p-6 md:p-12 flex flex-col items-center justify-center text-center space-y-6 border-dashed">
          <div className="w-16 h-16 md:w-20 md:h-20 bg-zinc-100 dark:bg-zinc-800 rounded-full flex items-center justify-center">
            <AlertTriangle className="w-8 h-8 md:w-10 md:h-10 text-amber-500" />
          </div>
          <div className="space-y-2">
            <h3 className="text-xl md:text-2xl font-bold text-zinc-900 dark:text-zinc-100">Esperando Datos</h3>
            <p className="text-xs md:text-sm text-zinc-500 max-w-lg mx-auto">
              Este cliente aún no tiene vinculada su cuenta de Meta Business. Conéctala para empezar a recibir datos de Facebook, Instagram y Meta Ads.
            </p>
          </div>
          <Button
            size="lg"
            onClick={handleMetaLogin}
            className="w-full md:w-auto bg-[#1877F2] hover:bg-[#166fe5] text-white px-8 h-12 rounded-full flex items-center justify-center gap-3 shadow-lg hover:shadow-xl transition-all hover:scale-105 active:scale-95"
          >
            <Facebook className="w-6 h-6 fill-current" />
            Conectar cuenta de Meta Business
          </Button>
          <p className="text-[10px] md:text-xs text-zinc-400">
            Solicitaremos permisos de lectura para Páginas, Instagram e Insights de Anuncios.
          </p>
        </Card>
      ) : (
        <div className="space-y-12">
          {/* Status and Connection Info */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <Card className="p-6 border-t-4 border-green-500 md:col-span-1">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="font-bold flex items-center gap-2 text-zinc-900 dark:text-zinc-100">
                    <CheckCircle2 className="w-5 h-5 text-green-500" />
                    Status
                  </h4>
                  <div className="px-2 py-0.5 rounded-full bg-green-100 dark:bg-green-900/30 text-green-600 text-[10px] font-bold uppercase">Activo</div>
                </div>

                {integrationStatus.metadata && (
                  <div className="mb-6 space-y-2 bg-zinc-50 dark:bg-zinc-900/50 p-3 rounded-lg border border-zinc-100 dark:border-zinc-800">
                    <div className="flex justify-between items-center text-[10px]">
                        <span className="text-zinc-400">Business:</span>
                        <span className="font-semibold text-zinc-800 dark:text-zinc-200 truncate ml-2">
                          {integrationStatus.metadata.businessName || "Cuenta Personal"}
                        </span>
                    </div>
                  </div>
                )}

                <div className="text-[10px] text-zinc-400 uppercase tracking-wider mb-1">Sincronizado</div>
                <div className="text-[10px] font-mono text-zinc-600 dark:text-zinc-400 mb-6">{new Date(integrationStatus.updatedAt).toLocaleString()}</div>

                <Button
                    variant="ghost"
                    size="sm"
                    className="w-full text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/10 flex items-center justify-center gap-2 text-[10px] uppercase font-bold"
                    onClick={handleDisconnect}
                    disabled={disconnecting}
                >
                    {disconnecting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Unplug className="w-3 h-3" />}
                    Desconectar
                </Button>
            </Card>

            <div className="md:col-span-3">
              {loadingOrganic ? (
                 <div className="h-full flex items-center justify-center bg-zinc-50 dark:bg-zinc-900/50 rounded-xl border border-dashed border-zinc-200 dark:border-zinc-800">
                    <Loader2 className="w-8 h-8 animate-spin text-primary" />
                 </div>
              ) : organicMetrics ? (
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <MetricCard
                    title="Impresiones"
                    current={organicMetrics.combined.current.impressions}
                    previous={organicMetrics.combined.previous.impressions}
                    icon={Eye}
                    color="#1877F2"
                  />
                  <MetricCard
                    title="Interacciones"
                    current={organicMetrics.combined.current.interactions}
                    previous={organicMetrics.combined.previous.interactions}
                    icon={MousePointer2}
                    color="#E1306C"
                  />
                  <MetricCard
                    title="Seguidores"
                    current={organicMetrics.combined.current.followers}
                    previous={organicMetrics.combined.previous.followers}
                    icon={Users}
                    color="#8B5CF6"
                  />
                  <MetricCard
                    title="Alcance Total"
                    current={organicMetrics.combined.current.reach}
                    previous={organicMetrics.combined.previous.reach}
                    icon={TrendingUp}
                    color="#10B981"
                  />
                </div>
              ) : (
                <Card className="h-full flex flex-col items-center justify-center text-center p-6 border-dashed">
                  <AlertTriangle className="w-8 h-8 text-amber-500 mb-2" />
                  <p className="text-sm text-zinc-500">Mapea tus activos abajo para ver las métricas.</p>
                </Card>
              )}
            </div>
          </div>

          {/* Charts and AI Insights */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2">
              <ReachTrendChart data={trendData} />
            </div>
            <div className="lg:col-span-1">
              <InsightGenerator
                clientId={selectedClientId}
                metrics={{ organic: organicMetrics, ads: adsMetrics, topContent }}
              />
            </div>
          </div>

          {/* Top Content */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                <TrendingUp className="w-6 h-6 text-indigo-500" />
                Top Content
              </h3>
              <Badge variant="indigo">Mejor rendimiento</Badge>
            </div>
            <TopContentTable content={topContent} />
          </div>

          {/* Ads Control */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                <Target className="w-6 h-6 text-emerald-500" />
                Ads Control
              </h3>
              <Badge variant="success">Meta Ads Insight</Badge>
            </div>
            <AdsControlPanel data={adsMetrics} />
          </div>

          {/* Asset Mapping Section */}
          <Card className="p-4 md:p-8 border-l-4 border-amber-500">
             <div className="flex items-center gap-3 mb-6">
                <div className="p-2 bg-amber-100 dark:bg-amber-900/30 rounded-lg shrink-0">
                   <Settings2 className="w-5 h-5 text-amber-600" />
                </div>
                <div>
                   <h3 className="text-base md:text-lg font-bold text-zinc-900 dark:text-zinc-100">Configuración de Activos</h3>
                   <p className="text-[10px] md:text-xs text-zinc-500">Mapea los activos específicos de este cliente para la extracción de datos.</p>
                </div>
             </div>

             <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Facebook Page & Instagram */}
                <div className="space-y-4">
                   <div className="space-y-2">
                      <label className="text-xs font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-2">
                         <Users className="w-3 h-3" /> Meta Business Account
                      </label>
                      <select
                        value={selectedBusiness}
                        onChange={(e) => setSelectedBusiness(e.target.value)}
                        disabled={loadingAssets}
                        className="w-full h-10 px-3 rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-sm focus:ring-2 focus:ring-primary outline-none transition-all"
                      >
                        <option value="">-- Seleccionar Business --</option>
                        {assets.businesses.map(biz => (
                           <option key={biz.id} value={biz.id}>{biz.name} ({biz.id})</option>
                        ))}
                      </select>
                   </div>

                   <div className="space-y-2">
                      <label className="text-xs font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-2">
                         <Facebook className="w-3 h-3" /> Página de Facebook
                      </label>
                      <select
                        value={selectedPage}
                        onChange={(e) => setSelectedPage(e.target.value)}
                        disabled={loadingAssets}
                        className="w-full h-10 px-3 rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-sm focus:ring-2 focus:ring-primary outline-none transition-all"
                      >
                        <option value="">-- Seleccionar Página --</option>
                        {assets.pages.map(page => (
                           <option key={page.id} value={page.id}>{page.name}</option>
                        ))}
                      </select>
                   </div>

                   <div className="space-y-2">
                      <label className="text-xs font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-2">
                         <Instagram className="w-3 h-3" /> Cuenta de Instagram
                      </label>
                      <div className="h-10 px-3 rounded-md border border-zinc-100 dark:border-zinc-900 bg-zinc-50 dark:bg-zinc-900/30 flex items-center text-sm italic text-zinc-500">
                         {loadingIG ? (
                            <Loader2 className="w-4 h-4 animate-spin mr-2" />
                         ) : instagramAccount ? (
                            <span className="text-zinc-900 dark:text-zinc-100 font-medium not-italic">@{instagramAccount.username} ({instagramAccount.name})</span>
                         ) : selectedPage ? (
                            <span className="text-zinc-400">No se detectó cuenta de Instagram vinculada</span>
                         ) : (
                            "Se detectará automáticamente al elegir la página"
                         )}
                      </div>
                   </div>
                </div>

                {/* Ad Account */}
                <div className="space-y-4">
                   <div className="space-y-2">
                      <label className="text-xs font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-2">
                         <Megaphone className="w-3 h-3" /> Cuenta Publicitaria (Ads)
                      </label>
                      <select
                        value={selectedAdAccount}
                        onChange={(e) => setSelectedAdAccount(e.target.value)}
                        disabled={loadingAssets}
                        className="w-full h-10 px-3 rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-sm focus:ring-2 focus:ring-primary outline-none transition-all"
                      >
                        <option value="">-- Seleccionar Cuenta de Ads --</option>
                        {assets.adAccounts.map(acc => (
                           <option key={acc.id} value={acc.id}>{acc.name} ({acc.account_id})</option>
                        ))}
                      </select>
                   </div>

                   <div className="pt-6 flex justify-end">
                      <Button
                        onClick={handleSaveMapping}
                        disabled={savingMapping || !selectedPage || !selectedAdAccount}
                        className="w-full md:w-auto flex items-center justify-center gap-2"
                      >
                        {savingMapping ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        Guardar Configuración
                      </Button>
                   </div>
                </div>
             </div>
          </div>
        </Card>
      </div>
    )}
  </div>
  );
};

export default Metrics;
