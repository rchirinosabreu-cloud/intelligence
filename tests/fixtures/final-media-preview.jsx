import React, {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {FinalAssetGrid} from '@/components/modules/ContentPlan/PieceMedia';
import {Dialog, DialogContent, DialogTitle, DialogDescription} from '@/components/ui/dialog';

localStorage.setItem('authToken','local-preview');
const initial=[{id:'vertical',name:'Vídeo vertical.webm',mimeType:'video/webm'}, {id:'horizontal',name:'Vídeo horizontal.webm',mimeType:'video/webm'}];
function Preview(){
  const [visible,setVisible]=useState(true);const[revision,setRevision]=useState(0);const[dark,setDark]=useState(false);const[tick,setTick]=useState(0);
  return <main className="min-h-screen bg-zinc-50 p-8 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
    <Dialog open><DialogContent data-preview-task className="z-[100] max-w-4xl rounded-2xl" overlayClassName="z-[99]" showCloseButton={false}>
      <DialogTitle>Entregables de la tarea · prueba local</DialogTitle><DialogDescription>Archivos ficticios. Abre el ojo para ver el vídeo completo.</DialogDescription>
      <div className="flex flex-wrap gap-2">{[['Mostrar u ocultar',()=>setVisible(v=>!v)],['Actualizar pantalla',()=>setTick(v=>v+1)],['Cambiar entrega',()=>setRevision(v=>v+1)],['Cambiar tema',()=>{setDark(!dark);document.documentElement.classList.toggle('dark',!dark);}]].map(([name,run])=><button key={name} onClick={run} className="min-h-11 rounded-xl border px-3 text-sm">{name}</button>)}</div>
      <p className="text-xs text-muted-foreground">Actualizaciones de pantalla: {tick}</p>
      {visible&&<FinalAssetGrid item={{id:'demo'}} finalAssets={initial.map(file=>({...file}))} isEditing={false} assetUrls={file=>({previewUrl:`/api/media/${file.id}?revision=${revision}`,downloadUrl:`/api/media/${file.id}?download=1`})}/>}
    </DialogContent></Dialog>
  </main>;
}
createRoot(document.getElementById('root')).render(<Preview/>);
