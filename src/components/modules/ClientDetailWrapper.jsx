
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

                // Fetch ALL clients and filter locally for now to be safe
                // This avoids potential missing endpoints in backend while refactoring
                const response = await fetch(`${baseUrl}/api/db/clients`);
                if (!response.ok) {
                    throw new Error(`Failed to fetch clients: ${response.status}`);
                }
                const clients = await response.json();

                // Find client by ID
                const found = clients.find(c => c.id === clientId);
                if (found) {
                    setClient(found);
                } else {
                    setError("Cliente no encontrado");
                }
            } catch (err) {
                console.error("Error fetching client:", err);
                setError("Error al cargar cliente");
            } finally {
                setLoading(false);
            }
        };

        fetchClient();
    }, [clientId]);

    if (loading) {
        return (
            <div className="flex items-center justify-center h-full min-h-[50vh]">
                <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
            </div>
        );
    }

    if (error || !client) {
        return (
            <div className="flex flex-col items-center justify-center h-full min-h-[50vh] gap-4">
                <p className="text-zinc-500 dark:text-zinc-400">{error || "Cliente no encontrado"}</p>
                <button
                    onClick={() => navigate('/clientes')}
                    className="px-4 py-2 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 rounded-lg text-sm font-medium transition-colors"
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
