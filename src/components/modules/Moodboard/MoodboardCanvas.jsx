import React, { useState, useEffect, useRef } from 'react';
import {
  Plus,
  Image as ImageIcon,
  Link as LinkIcon,
  Type,
  Maximize2,
  Trash2,
  MoreHorizontal,
  X,
  Loader2,
  Save,
  MessageSquare,
  ArrowLeft,
  Settings
} from 'lucide-react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'react-hot-toast';
import ReferenceCard from './ReferenceCard';

const MoodboardCanvas = () => {
  const { boardId } = useParams();
  const navigate = useNavigate();
  const [board, setBoard] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const canvasRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (boardId) {
      fetchBoardAndItems();
    }
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [boardId]);

  const fetchBoardAndItems = async () => {
    setLoading(true);
    try {
      const [boardRes, itemsRes] = await Promise.all([
        axios.get(`/api/boards/${boardId}`),
        axios.get(`/api/boards/${boardId}/items`)
      ]);
      setBoard(boardRes.data);
      setItems(itemsRes.data);
    } catch (error) {
      console.error("Error fetching board data:", error);
      toast.error("Error al cargar el tablero");
      navigate('/moodboard');
    } finally {
      setLoading(false);
    }
  };

  const handleAddItem = async (type, extraData = {}) => {
    if (!board) return;

    let itemData = {
      type,
      positionX: 100,
      positionY: 100,
      ...extraData
    };

    if (type === 'link') {
      const url = prompt("Pega el enlace aquí:");
      if (!url) return;
      toast.loading("Analizando enlace...");
      try {
        const unfurl = await axios.post('/api/boards/unfurl', { url });
        itemData = {
          ...itemData,
          contentUrl: url,
          metadata: unfurl.data
        };
        toast.dismiss();
      } catch (error) {
        toast.dismiss();
        itemData = { ...itemData, contentUrl: url };
      }
    } else if (type === 'text') {
      itemData.comment = "Nueva nota...";
      itemData.metadata = { color: 'yellow' };
    }

    try {
      const response = await axios.post(`/api/boards/${boardId}/items`, itemData);
      setItems([...items, response.data]);
      setIsAdding(false);
      toast.success("Elemento añadido");
    } catch (error) {
      toast.error("Error al añadir elemento");
    }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file || !board) return;

    toast.loading("Subiendo imagen...");
    try {
      const { data: { url, gcsPath } } = await axios.get(
        `/api/boards/${boardId}/storage/signed-url`,
        { params: { fileName: file.name, fileType: file.type } }
      );

      await axios.put(url, file, {
        headers: { 'Content-Type': file.type }
      });

      await handleAddItem('image', { assetUrl: gcsPath });
      toast.dismiss();
    } catch (error) {
      console.error("Upload error:", error);
      toast.dismiss();
      toast.error("Error al subir imagen");
    }
  };

  const updateItemPosition = async (itemId, x, y) => {
    const snappedX = Math.round(x / 8) * 8;
    const snappedY = Math.round(y / 8) * 8;

    try {
      await axios.patch(`/api/boards/${boardId}/items/${itemId}`, {
        positionX: snappedX,
        positionY: snappedY
      });
      setItems(items.map(item =>
        item.id === itemId ? { ...item, positionX: snappedX, positionY: snappedY } : item
      ));
    } catch (error) {
      console.error("Error updating position:", error);
    }
  };

  const handleDeleteItem = async (itemId) => {
    try {
      await axios.delete(`/api/boards/${boardId}/items/${itemId}`);
      setItems(items.filter(i => i.id !== itemId));
      toast.success("Eliminado");
    } catch (error) {
      toast.error("Error al eliminar");
    }
  };

  const handleUpdateItem = async (itemId, data) => {
    try {
      const response = await axios.patch(`/api/boards/${boardId}/items/${itemId}`, data);
      setItems(items.map(i => i.id === itemId ? response.data : i));
    } catch (error) {
      toast.error("Error al actualizar");
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-zinc-400 gap-4 animate-pulse">
        <Loader2 className="w-10 h-10 animate-spin text-indigo-500" />
        <p className="font-bold tracking-tighter">Cargando lienzo creativo...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-zinc-50 dark:bg-zinc-950 overflow-hidden relative">
      {/* Dynamic Header */}
      <div className="flex items-center justify-between px-6 py-3 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-xl border-b border-zinc-200 dark:border-zinc-800 z-[40]">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/moodboard')}
            className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl transition-colors text-zinc-500"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>

          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-black text-zinc-900 dark:text-zinc-100 tracking-tighter uppercase">
                {board?.name}
              </h1>
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-500 uppercase tracking-widest border border-zinc-200 dark:border-zinc-700">
                {board?.client?.name || 'Agencia'}
              </span>
            </div>
            {!isMobile && (
              <p className="text-[10px] text-zinc-400 font-mono">
                {items.length} elementos • Snap-to-Grid: 8px
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative">
            <button
              onClick={() => setIsAdding(!isAdding)}
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2 rounded-xl text-sm font-bold transition-all shadow-lg shadow-indigo-500/20 active:scale-95"
            >
              <Plus className="w-4 h-4" />
              <span>Añadir</span>
            </button>

            {isAdding && (
              <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl border border-zinc-200 dark:border-zinc-800 py-2 z-50 animate-in fade-in zoom-in-95 duration-200">
                <button
                  onClick={() => { fileInputRef.current?.click(); setIsAdding(false); }}
                  className="flex items-center gap-3 w-full px-4 py-2.5 text-sm font-bold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800"
                >
                  <ImageIcon className="w-4 h-4 text-blue-500" />
                  Imagen
                </button>
                <button
                  onClick={() => handleAddItem('link')}
                  className="flex items-center gap-3 w-full px-4 py-2.5 text-sm font-bold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800"
                >
                  <LinkIcon className="w-4 h-4 text-green-500" />
                  Enlace
                </button>
                <button
                  onClick={() => handleAddItem('text')}
                  className="flex items-center gap-3 w-full px-4 py-2.5 text-sm font-bold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800"
                >
                  <Type className="w-4 h-4 text-amber-500" />
                  Nota
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <input
        type="file"
        className="hidden"
        ref={fileInputRef}
        accept="image/*"
        onChange={handleFileUpload}
      />

      {/* Canvas Area */}
      <div
        className={`flex-1 overflow-auto bg-zinc-100 dark:bg-zinc-900/50 ${isMobile ? 'p-4' : 'relative'}`}
        ref={canvasRef}
      >
        {isMobile ? (
          <div className="grid grid-cols-1 gap-4 pb-20">
            {items.map(item => (
              <ReferenceCard
                key={item.id}
                item={item}
                isMobile={true}
                onDelete={() => handleDeleteItem(item.id)}
                onUpdate={(data) => handleUpdateItem(item.id, data)}
              />
            ))}
            {items.length === 0 && (
               <div className="text-center py-20 text-zinc-400 font-medium">
                  Este lienzo está vacío.
               </div>
            )}
          </div>
        ) : (
          <div
            className="canvas-container"
            style={{
              width: '3000px',
              height: '3000px',
              position: 'relative',
              backgroundImage: 'radial-gradient(#cbd5e1 1px, transparent 0)',
              backgroundSize: '24px 24px',
              backgroundColor: 'transparent'
            }}
          >
            {items.map(item => (
              <ReferenceCard
                key={item.id}
                item={item}
                isMobile={false}
                onDelete={() => handleDeleteItem(item.id)}
                onUpdate={(data) => handleUpdateItem(item.id, data)}
                onDragStop={(x, y) => updateItemPosition(item.id, x, y)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Floating Controls Placeholder */}
      {!isMobile && (
        <div className="absolute bottom-6 right-6 flex items-center gap-3 bg-white/90 dark:bg-zinc-900/90 backdrop-blur-xl px-4 py-2 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-xl z-[40]">
           <div className="flex -space-x-2">
              <div className="w-8 h-8 rounded-full bg-indigo-500 border-2 border-white dark:border-zinc-900 flex items-center justify-center text-[10px] text-white font-bold">BS</div>
           </div>
           <div className="h-4 w-[1px] bg-zinc-200 dark:bg-zinc-800" />
           <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Colaborativo</span>
        </div>
      )}
    </div>
  );
};

export default MoodboardCanvas;
