
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import ClientDetail from './ClientDetail';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';
import { Loader2 } from 'lucide-react';

const ClientDetailWrapper = () => {
    const { clientId } = useParams();
    const navigate = useNavigate();
    const [client, setClient] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        const fetchClient = async () => {
            if (!clientId) return;
            try {
                setLoading(true);
                const baseUrl = getApiBaseUrl();

                const response = await fetch(`${baseUrl}/api/db/clients/${clientId}`);

                if (response.status === 404) {
                    setError("Cliente no encontrado");
                    return;
                }

                if (!response.ok) {
                    throw new Error(`Failed to fetch client: ${response.status}`);
                }

                const clientData = await response.json();

                // Redirection check: If the URL param was a UUID but we found the client,
                // redirect to the clean slug URL
                const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(clientId);
                if (isUUID && clientData.slug) {
                    navigate(`/cliente/${clientData.slug}`, { replace: true });
                    return; // Stop execution, the new route will re-trigger the effect
                }

                setClient(clientData);
            } catch (err) {
                console.error("Error fetching client:", err);
                setError("Error al cargar cliente");
            } finally {
                setLoading(false);
            }
        };

        fetchClient();
    }, [clientId, navigate]);

    if (loading) {
        return (
            <div className="flex items-center justify-center h-full min-h-[50vh]">
                <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
            </div>
        );
    }

    if (error || !client) {
        return (
            <div className="flex flex-col items-center justify-center h-full min-h-[50vh] gap-4">
                <p className="text-zinc-500 dark:text-zinc-400">{error || "Cliente no encontrado"}</p>
                <button
                    onClick={() => navigate('/clientes')}
                    className="px-4 py-2 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 rounded-xl text-sm font-medium transition-colors"
                >
                    Volver a Clientes
                </button>
            </div>
        );
    }

    return (
        <ClientDetail
            client={client}
            onBack={() => navigate('/clientes')}
        />
    );
};

export default ClientDetailWrapper;
