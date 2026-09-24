import React from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import GovernanceCenter from '../../src/components/modules/Governance/GovernanceCenter';
import '../../src/index.css';
const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
function Preview() {
  return <QueryClientProvider client={cache}><div className="min-h-screen bg-background text-foreground"><div className="flex flex-wrap items-center justify-between gap-2 border-b p-3 text-sm"><span>Muestra local · Base de datos sintética · Sin correos ni proveedores externos</span><button className="min-h-11 rounded-lg border px-3" onClick={() => document.documentElement.classList.toggle('dark')}>Cambiar tema</button></div><GovernanceCenter /></div></QueryClientProvider>;
}
createRoot(document.getElementById('root')).render(<Preview />);
