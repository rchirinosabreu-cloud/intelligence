
import React, { useState, useEffect } from 'react';
import { BarChart3, Users, Facebook, Instagram, Megaphone, Loader2, AlertTriangle, CheckCircle2 } from 'lucide-react';
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
      return;
    }

    const fetchStatus = async () => {
      setLoadingStatus(true);
      try {
        const response = await fetch(`${getApiBaseUrl()}/api/integrations/${selectedClientId}/status`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('authToken')}` }
        });
        const data = await response.json();
        // Look for 'meta' provider
        const meta = data.find(i => i.provider === 'meta');
        setIntegrationStatus(meta || null);
      } catch (error) {
        console.error('Error fetching status:', error);
      } finally {
        setLoadingStatus(false);
      }
    };

    fetchStatus();
  }, [selectedClientId]);

  const handleMetaLogin = () => {
    if (!window.FB) {
      toast.error('El SDK de Facebook no está cargado. Por favor, recarga la página.');
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
      scope: 'pages_show_list,pages_read_engagement,pages_manage_engagement,instagram_basic,instagram_manage_insights,ads_read,ads_management',
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
        // Refresh status
        setIntegrationStatus({ provider: 'meta', updatedAt: new Date().toISOString() });
      } else {
        throw new Error(data.details || data.error);
      }
    } catch (error) {
      console.error('Error exchanging token:', error);
      toast.error(`Error al vincular: ${error.message}`);
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
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
           <Card className="p-6 border-t-4 border-primary">
              <div className="flex items-center justify-between mb-4">
                <h4 className="font-bold flex items-center gap-2">
                   <CheckCircle2 className="w-5 h-5 text-green-500" />
                   Meta Connected
                </h4>
                <div className="px-2 py-0.5 rounded-full bg-green-100 dark:bg-green-900/30 text-green-600 text-[10px] font-bold uppercase">Activo</div>
              </div>
              <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-6">
                 La conexión está establecida correctamente. Los datos de pauta y engagement están fluyendo.
              </p>
              <div className="text-[10px] text-zinc-400 uppercase tracking-wider mb-1">Última sincronización</div>
              <div className="text-xs font-mono">{new Date(integrationStatus.updatedAt).toLocaleString()}</div>
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
      )}
    </div>
  );
};

export default Metrics;
