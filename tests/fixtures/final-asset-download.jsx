import React from 'react';
import {createRoot} from 'react-dom/client';
import {FinalAssetGrid} from '../../src/components/modules/ContentPlan/PieceMedia';
import '../../src/index.css';

localStorage.setItem('authToken', 'local-download-test');
const assets = [
  {id:'video',name:'Vacante – edición final.webm',mimeType:'video/webm',storageKey:'internal/random-key'},
  {id:'legacy',name:null,mimeType:'video/webm',storageKey:'internal/other-key'},
];
createRoot(document.getElementById('root')).render(<main className="mx-auto max-w-3xl space-y-6 p-8 text-zinc-900 dark:text-zinc-100">
  <h1 className="text-xl font-semibold">Pieza final · Vacante creativa</h1><p>Prueba local con archivos ficticios</p>
  <section aria-label="Pieza de parrilla"><FinalAssetGrid item={{id:'piece',title:'Vacante creativa'}} finalAssets={assets} isEditing={false}/></section>
  <section aria-label="Entrega interna"><h2>Entrega interna de la tarea</h2><FinalAssetGrid item={{id:'task'}} finalAssets={[{id:'pdf',name:'Propuesta revisada.pdf',mimeType:'application/pdf'}]} isEditing={false} assetUrls={()=>({previewUrl:null,downloadUrl:'/api/test/task/download'})}/></section>
</main>);
