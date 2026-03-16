
import React, { useState, useEffect } from 'react';
import { BarChart3, Users, Facebook, Instagram, Megaphone, Loader2, AlertTriangle, CheckCircle2, Settings2, Save, Unplug } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/button';
import { toast } from 'react-hot-toast';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';

const Metrics = () => {
  const [clients, setClients] = useState([]);
  const [selectedClientId, setSelectedClientId] = useState('');
  const [loadingClients, setLoadingClients] = useState(true);
  const [integrationStatus, setIntegrationStatus] = useState(null);
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [sdkLoaded, setSdkLoaded] = useState(false);

  // Asset Mapping State
  const [assets, setAssets] = useState({ adAccounts: [], pages: [], businesses: [], requiresBusinessSelection: false });
  const [loadingAssets, setLoadingAssets] = useState(false);
  const [selectedBusiness, setSelectedBusiness] = useState('');
  const [selectedPage, setSelectedPage] = useState('');
  const [selectedAdAccount, setSelectedAdAccount] = useState('');
  const [instagramAccount, setInstagramAccount] = useState(null);
  const [loadingIG, setLoadingIG] = useState(false);
  const [savingMapping, setSavingMapping] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

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
           setSelectedBusiness(meta.metadata?.businessId || '');
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
    setAssets({ adAccounts: [], pages: [], businesses: [], requiresBusinessSelection: false });
    setSelectedBusiness('');
    setSelectedPage('');
    setSelectedAdAccount('');
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
        if (!data.requiresBusinessSelection && data.businessId) {
            setSelectedBusiness(data.businessId);
        }
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
        // Refresh mapping state
        fetchAvailableAssets();
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
    <div className="p-8 max-w-7xl mx-auto space-y-8">
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
        <div className="flex flex-col items-center justify-center py-20 text-center space-y-4 opacity-50">
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
        <Card className="p-12 flex flex-col items-center justify-center text-center space-y-6 border-dashed">
          <div className="w-20 h-20 bg-zinc-100 dark:bg-zinc-800 rounded-full flex items-center justify-center">
            <AlertTriangle className="w-10 h-10 text-amber-500" />
          </div>
          <div className="space-y-2">
            <h3 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Esperando Datos</h3>
            <p className="text-zinc-500 max-w-lg mx-auto">
              Este cliente aún no tiene vinculada su cuenta de Meta Business. Conéctala para empezar a recibir datos de Facebook, Instagram y Meta Ads.
            </p>
          </div>
          <Button
            size="lg"
            onClick={handleMetaLogin}
            className="bg-[#1877F2] hover:bg-[#166fe5] text-white px-8 h-12 rounded-full flex items-center gap-3 shadow-lg hover:shadow-xl transition-all hover:scale-105 active:scale-95"
          >
            <Facebook className="w-6 h-6 fill-current" />
            Conectar cuenta de Meta Business
          </Button>
          <p className="text-xs text-zinc-400">
            Solicitaremos permisos de lectura para Páginas, Instagram e Insights de Anuncios.
          </p>
        </Card>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card className="p-6 border-t-4 border-primary">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="font-bold flex items-center gap-2 text-zinc-900 dark:text-zinc-100">
                    <CheckCircle2 className="w-5 h-5 text-green-500" />
                    Meta Connected
                  </h4>
                  <div className="px-2 py-0.5 rounded-full bg-green-100 dark:bg-green-900/30 text-green-600 text-[10px] font-bold uppercase">Activo</div>
                </div>
                <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-2">
                  La conexión está establecida correctamente. Los datos de pauta y engagement están fluyendo.
                </p>

                {integrationStatus.metadata && (
                  <div className="mb-6 space-y-2 bg-zinc-50 dark:bg-zinc-900/50 p-3 rounded-lg border border-zinc-100 dark:border-zinc-800">
                    {integrationStatus.metadata.facebookUserName && (
                      <div className="flex justify-between items-center text-xs">
                          <span className="text-zinc-400">Usuario:</span>
                          <span className="font-semibold text-zinc-800 dark:text-zinc-200">{integrationStatus.metadata.facebookUserName}</span>
                      </div>
                    )}
                    {integrationStatus.metadata.businessName && (
                      <div className="flex justify-between items-center text-xs">
                          <span className="text-zinc-400">Business:</span>
                          <span className="font-semibold text-zinc-800 dark:text-zinc-200">{integrationStatus.metadata.businessName}</span>
                      </div>
                    )}
                    {integrationStatus.metadata.businessId && (
                      <div className="flex justify-between items-center text-[10px]">
                          <span className="text-zinc-400">ID:</span>
                          <span className="font-mono text-zinc-800 dark:text-zinc-200">{integrationStatus.metadata.businessId}</span>
                      </div>
                    )}
                  </div>
                )}

                <div className="text-[10px] text-zinc-400 uppercase tracking-wider mb-1">Última sincronización</div>
                <div className="text-xs font-mono text-zinc-600 dark:text-zinc-400 mb-6">{new Date(integrationStatus.updatedAt).toLocaleString()}</div>

                <div className="pt-4 border-t border-zinc-100 dark:border-zinc-800">
                    <Button
                        variant="ghost"
                        size="sm"
                        className="w-full text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/10 flex items-center justify-center gap-2 text-[10px] uppercase font-bold"
                        onClick={handleDisconnect}
                        disabled={disconnecting}
                    >
                        {disconnecting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Unplug className="w-3 h-3" />}
                        Desconectar Cuenta
                    </Button>
                </div>
            </Card>

            <Card className="p-6 opacity-40 grayscale flex flex-col justify-center items-center border-dashed">
                <BarChart3 className="w-8 h-8 mb-2" />
                <div className="font-semibold text-sm">Próximamente</div>
                <p className="text-[10px] text-center">Dashboard de visualización de datos de Meta.</p>
            </Card>

            <Card className="p-6 opacity-40 grayscale flex flex-col justify-center items-center border-dashed">
                <Megaphone className="w-8 h-8 mb-2" />
                <div className="font-semibold text-sm">Google Analytics</div>
                <p className="text-[10px] text-center">Disponible en la Fase 2.</p>
            </Card>
          </div>

          {/* Asset Mapping Section */}
          <Card className="p-8 border-l-4 border-amber-500">
             <div className="flex items-center gap-3 mb-6">
                <div className="p-2 bg-amber-100 dark:bg-amber-900/30 rounded-lg">
                   <Settings2 className="w-5 h-5 text-amber-600" />
                </div>
                <div>
                   <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">Configuración de Activos</h3>
                   <p className="text-xs text-zinc-500">Mapea los activos específicos de este cliente para la extracción de datos.</p>
                </div>
             </div>

             <div className="space-y-6">
                {/* Business Selector */}
                <div className="p-4 bg-zinc-50 dark:bg-zinc-900/50 rounded-lg border border-zinc-100 dark:border-zinc-800 space-y-3">
                    <label className="text-xs font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-2">
                       Meta Business Account
                    </label>
                    <select
                        value={selectedBusiness}
                        onChange={(e) => {
                            setSelectedBusiness(e.target.value);
                            // Clear assets when business changes to avoid mismatch
                            setAssets(prev => ({ ...prev, adAccounts: [], pages: [] }));
                        }}
                        className="w-full h-10 px-3 rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-sm focus:ring-2 focus:ring-primary outline-none transition-all"
                    >
                        <option value="">-- Seleccionar Business --</option>
                        {assets.businesses?.map(biz => (
                           <option key={biz.id} value={biz.id}>{biz.name}</option>
                        ))}
                        {/* If we already have a business name but it's not in the 'businesses' list yet */}
                        {integrationStatus?.metadata?.businessId && !assets.businesses?.find(b => b.id === integrationStatus.metadata.businessId) && (
                            <option value={integrationStatus.metadata.businessId}>
                                {integrationStatus.metadata.businessName || 'Business Actual'}
                            </option>
                        )}
                    </select>
                    {assets.requiresBusinessSelection && (
                        <p className="text-[10px] text-amber-600 font-medium animate-pulse">
                           ⚠️ Debes seleccionar un Business Account para listar sus activos.
                        </p>
                    )}
                    {selectedBusiness && selectedBusiness !== integrationStatus?.metadata?.businessId && (
                        <Button
                            variant="outline"
                            size="sm"
                            className="text-[10px] h-7"
                            onClick={handleSaveMapping}
                            disabled={savingMapping}
                        >
                            Cargar Activos de este Business
                        </Button>
                    )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Facebook Page & Instagram */}
                <div className="space-y-4">
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
                        disabled={savingMapping || !selectedPage || !selectedAdAccount || !selectedBusiness}
                        className="flex items-center gap-2"
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
