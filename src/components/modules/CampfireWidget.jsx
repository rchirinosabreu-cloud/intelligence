import React from 'react';
import { Flame, Maximize } from 'lucide-react';

const CampfireWidget = () => {
    return (
        <div className="w-full bg-white border border-gray-100 rounded-2xl p-5 cursor-pointer transition-all hover:shadow-md hover:border-gray-200 flex flex-col gap-4">
            {/* Cabecera (Header) */}
            <div className="flex justify-between items-center w-full">
                <div className="flex items-center gap-2">
                    <Flame className="w-5 h-5 text-orange-500 fill-orange-500" />
                    <span className="text-sm font-semibold text-gray-800">Campfire</span>
                </div>
                <Maximize className="w-4 h-4 text-gray-400" />
            </div>

            {/* Cuerpo del Mensaje (Snippet) */}
            <div>
                <p className="text-sm text-gray-600 line-clamp-2">
                    <span className="font-semibold text-gray-800">Jarlan:</span> Ojo con el logo en el slide...
                </p>
                <span className="text-xs text-gray-400 mt-1 block">Hace un momento</span>
            </div>

            {/* Sección de Avatares */}
            <div className="flex -space-x-2 overflow-hidden mt-2">
                <div className="inline-flex items-center justify-center w-8 h-8 rounded-full border-2 border-white text-[10px] font-medium text-white bg-blue-500">
                    RQ
                </div>
                <div className="inline-flex items-center justify-center w-8 h-8 rounded-full border-2 border-white text-[10px] font-medium text-white bg-pink-500">
                    CL
                </div>
                <div className="inline-flex items-center justify-center w-8 h-8 rounded-full border-2 border-white text-[10px] font-medium text-white bg-green-500">
                    JA
                </div>
            </div>
        </div>
    );
};

export default CampfireWidget;
