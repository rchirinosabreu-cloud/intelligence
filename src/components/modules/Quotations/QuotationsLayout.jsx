import React, { useState } from 'react';
import PageHeader from '@/components/ui/PageHeader';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FileText, Database, Settings } from '@/components/ui/icons';
import QuotationList from './QuotationList';
import CatalogManagement from './CatalogManagement';

const QuotationsLayout = () => {
    return (
        <div className="space-y-6">
            <PageHeader
                title="Módulo Comercial"
                subtitle="Gestión de propuestas, tarifas y acuerdos comerciales."
            />

            <Tabs defaultValue="history" className="w-full">
                <TabsList className="bg-zinc-100 dark:bg-zinc-800/50 p-1 rounded-2xl mb-8 border border-zinc-200 dark:border-zinc-800 w-full max-w-md">
                    <TabsTrigger value="history" className="rounded-xl flex items-center gap-2 flex-1">
                        <FileText className="w-4 h-4" /> Historial
                    </TabsTrigger>
                    <TabsTrigger value="catalog" className="rounded-xl flex items-center gap-2 flex-1">
                        <Database className="w-4 h-4" /> Catálogo
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="history" className="outline-none animate-in fade-in slide-in-from-bottom-2 duration-300">
                    <QuotationList />
                </TabsContent>

                <TabsContent value="catalog" className="outline-none animate-in fade-in slide-in-from-bottom-2 duration-300">
                    <CatalogManagement />
                </TabsContent>
            </Tabs>
        </div>
    );
};

export default QuotationsLayout;
