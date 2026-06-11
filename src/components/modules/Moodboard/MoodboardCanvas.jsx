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
  Settings,
  MousePointer2,
  Hand
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

  // Navigation State
  const [zoom, setZoom] = useState(1.0);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const [activeTool, setActiveTool] = useState('select'); // 'select' | 'hand'
  const [isPanning, setIsPanning] = useState(false);

  const canvasRef = useRef(null);
  const viewportRef = useRef(null);
  const fileInputRef = useRef(null);

  // Fetch Board Data
  useEffect(() => {
    if (boardId) {
      fetchBoardAndItems();
    }
  }, [boardId]);

  // Handle Global Listeners (Resize, Keyboard)
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);

    const handleKeyDown = (e) => {
      if (e.code === 'Space' && !e.repeat) {
        if (['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;
        e.preventDefault(); // Prevent scroll/default
        setActiveTool('hand');
      }
    };

    const handleKeyUp = (e) => {
      if (e.code === 'Space') {
        setActiveTool('select');
      }
    };

    window.addEventListener('resize', handleResize);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

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

    // Calculate position based on current pan and zoom
    // We want to place it roughly in the middle of the viewport or with a slight offset
    const viewportWidth = viewportRef.current?.clientWidth || window.innerWidth;
    const viewportHeight = viewportRef.current?.clientHeight || window.innerHeight;

    const posX = Math.round(((viewportWidth / 2 - panX) / zoom) / 8) * 8;
    const posY = Math.round(((viewportHeight / 2 - panY) / zoom) / 8) * 8;

    let itemData = {
      type,
      positionX: posX,
      positionY: posY,
      ...extraData
    };

    if (type === 'link' && !extraData.contentUrl) {
      // Create a temporary link item for inline input
      const tempItem = {
        id: `temp-${Date.now()}`,
        boardId,
        type: 'link',
        contentUrl: '',
        positionX: posX,
        positionY: posY,
        isTemp: true
      };
      setItems([...items, tempItem]);
      setIsAdding(false);
      return;
    }

    if (type === 'text') {
      itemData.comment = ""; // Start empty
      itemData.metadata = { color: 'yellow' };
    }

    try {
      const response = await axios.post(`/api/boards/${boardId}/items`, itemData);
      setItems([...items, response.data]);
      setIsAdding(false);
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

      // CRITICAL: Send the exact binary file and match Content-Type header
      const uploadRes = await fetch(url, {
        method: 'PUT',
        body: file,
        headers: {
          'Content-Type': file.type
        }
      });

      if (!uploadRes.ok) {
        throw new Error(`Upload failed with status ${uploadRes.status}`);
      }

      await handleAddItem('image', { assetUrl: gcsPath });
      toast.dismiss();
    } catch (error) {
      console.error("[Upload] Error details:", error);
      toast.dismiss();
      toast.error(`Error al subir imagen: ${error.message}`);
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
    // Handle temp item transformation
    const item = items.find(i => i.id === itemId);
    if (item?.isTemp && data.contentUrl) {
      setItems(items.filter(i => i.id !== itemId)); // Remove temp
      toast.loading("Analizando enlace...");
      try {
        const unfurl = await axios.post('/api/boards/unfurl', { url: data.contentUrl });
        const itemData = {
          type: 'link',
          contentUrl: data.contentUrl,
          metadata: unfurl.data,
          positionX: item.positionX,
          positionY: item.positionY
        };
        const response = await axios.post(`/api/boards/${boardId}/items`, itemData);
        setItems(prev => [...prev, response.data]);
        toast.dismiss();
        toast.success("Enlace añadido");
      } catch (error) {
        toast.dismiss();
        // Fallback save
        const itemData = {
          type: 'link',
          contentUrl: data.contentUrl,
          positionX: item.positionX,
          positionY: item.positionY
        };
        const response = await axios.post(`/api/boards/${boardId}/items`, itemData);
        setItems(prev => [...prev, response.data]);
      }
      return;
    }

    try {
      const response = await axios.patch(`/api/boards/${boardId}/items/${itemId}`, data);
      setItems(items.map(i => i.id === itemId ? { ...i, ...response.data } : i));
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

  const handleWheel = (e) => {
    if (isMobile) return;

    // Zoom with wheel
    const zoomSpeed = 0.05;
    const direction = e.deltaY > 0 ? -1 : 1;
    const newZoom = Math.min(Math.max(zoom + direction * zoomSpeed, 0.25), 2.0);
    setZoom(parseFloat(newZoom.toFixed(2)));
  };

  const handleCanvasMouseDown = (e) => {
    if (activeTool === 'hand') {
      setIsPanning(true);
      const startX = e.clientX - panX;
      const startY = e.clientY - panY;

      const handleCanvasMouseMove = (moveEvent) => {
        setPanX(moveEvent.clientX - startX);
        setPanY(moveEvent.clientY - startY);
      };

      const handleCanvasMouseUp = () => {
        setIsPanning(false);
        document.removeEventListener('mousemove', handleCanvasMouseMove);
        document.removeEventListener('mouseup', handleCanvasMouseUp);
      };

      document.addEventListener('mousemove', handleCanvasMouseMove);
      document.addEventListener('mouseup', handleCanvasMouseUp);
    }
  };

  return (
    <div
        className="flex flex-col w-full h-[calc(100vh-64px)] lg:h-screen lg:fixed lg:top-0 lg:right-0 lg:left-64 bg-zinc-50 dark:bg-zinc-950 overflow-hidden relative z-[40]"
        onWheel={handleWheel}
    >

      {/* GLOBAL FLOATING CONTROLS (Fixed to Viewport) */}
      {/* Top Left: Board Info & Back */}
      <div className="fixed top-[100px] left-6 lg:left-[calc(256px+40px)] flex items-center gap-4 z-[99999] pointer-events-none animate-in fade-in slide-in-from-left-4 duration-700">
        <button
          onClick={() => navigate('/moodboard')}
          className="p-3 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-xl border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xl transition-all hover:scale-105 active:scale-95 text-zinc-500 pointer-events-auto"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>

        <div className="bg-white/95 dark:bg-zinc-900/95 backdrop-blur-xl border border-zinc-200 dark:border-zinc-800 px-5 py-2.5 rounded-2xl shadow-2xl pointer-events-auto">
          <div className="flex items-center gap-3">
            <h1 className="text-sm font-black text-zinc-900 dark:text-zinc-100 tracking-tighter uppercase">
              {board?.name}
            </h1>
            <div className="h-3 w-[1px] bg-zinc-200 dark:bg-zinc-800" />
            <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">
              {board?.client?.name || 'Agencia'}
            </span>
          </div>
        </div>
      </div>

      {/* Top Right: Actions & Canvas Info */}
      <div className="fixed top-[100px] right-10 flex flex-col items-end gap-3 z-[99999] pointer-events-none animate-in fade-in slide-in-from-right-4 duration-700">

        {/* Tool Switcher */}
        {!isMobile && (
          <div className="flex bg-white/95 dark:bg-zinc-900/95 backdrop-blur-xl border border-zinc-200 dark:border-zinc-800 p-1.5 rounded-2xl shadow-2xl pointer-events-auto mb-1">
             <button
                onClick={() => setActiveTool('select')}
                className={`p-2 rounded-xl transition-all ${activeTool === 'select' ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/20' : 'text-zinc-500 hover:bg-zinc-100'}`}
                title="Herramienta de Selección (V)"
             >
                <MousePointer2 className="w-4 h-4" />
             </button>
             <button
                onClick={() => setActiveTool('hand')}
                className={`p-2 rounded-xl transition-all ${activeTool === 'hand' ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/20' : 'text-zinc-500 hover:bg-zinc-100'}`}
                title="Herramienta de Mano (Espacio)"
             >
                <Hand className="w-4 h-4" />
             </button>
          </div>
        )}

        {!isMobile && (
          <div className="bg-white/95 dark:bg-zinc-900/95 backdrop-blur-xl border border-zinc-200 dark:border-zinc-800 px-4 py-2 rounded-2xl shadow-2xl text-[10px] text-zinc-400 font-mono hidden md:block pointer-events-auto">
            {Math.round(zoom * 100)}% | {items.length} items
          </div>
        )}

        <div className="relative pointer-events-auto">
          <button
            onClick={() => setIsAdding(!isAdding)}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-2xl text-sm font-black transition-all shadow-2xl shadow-indigo-500/30 active:scale-95"
          >
            <Plus className="w-5 h-5" />
            <span>AÑADIR</span>
          </button>

          {isAdding && (
            <div className="absolute right-0 mt-3 w-56 bg-white dark:bg-zinc-900 rounded-3xl shadow-2xl border border-zinc-200 dark:border-zinc-800 py-3 z-50 animate-in fade-in zoom-in-95 duration-200 overflow-hidden">
              <button
                onClick={() => { fileInputRef.current?.click(); setIsAdding(false); }}
                className="flex items-center gap-4 w-full px-5 py-3 text-sm font-bold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
              >
                <div className="p-2 bg-blue-500/10 rounded-xl">
                  <ImageIcon className="w-4 h-4 text-blue-500" />
                </div>
                Imagen
              </button>
              <button
                onClick={() => handleAddItem('link')}
                className="flex items-center gap-4 w-full px-5 py-3 text-sm font-bold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
              >
                <div className="p-2 bg-green-500/10 rounded-xl">
                  <LinkIcon className="w-4 h-4 text-green-500" />
                </div>
                Enlace
              </button>
              <button
                onClick={() => handleAddItem('text')}
                className="flex items-center gap-4 w-full px-5 py-3 text-sm font-bold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
              >
                <div className="p-2 bg-amber-500/10 rounded-xl">
                  <Type className="w-4 h-4 text-amber-500" />
                </div>
                Nota
              </button>
            </div>
          )}
        </div>
      </div>

      <input
        type="file"
        className="hidden"
        ref={fileInputRef}
        accept="image/*"
        onChange={handleFileUpload}
      />

      {/* Canvas Area - Exclusive Internal Scroll */}
      <div
        className={`w-full h-full overflow-auto bg-zinc-100 dark:bg-zinc-900/50 relative ${activeTool === 'hand' ? (isPanning ? 'cursor-grabbing' : 'cursor-grab') : 'cursor-auto'}`}
        ref={viewportRef}
        onMouseDown={handleCanvasMouseDown}
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
            ref={canvasRef}
            className="canvas-container"
            style={{
              width: '3000px',
              height: '3000px',
              position: 'relative',
              backgroundImage: 'radial-gradient(#cbd5e1 1px, transparent 0)',
              backgroundSize: '24px 24px',
              backgroundColor: 'transparent',
              transform: `translate(${panX}px, ${panY}px) scale(${zoom})`,
              transformOrigin: 'top left'
            }}
          >
            {items.map(item => (
              <ReferenceCard
                key={item.id}
                item={item}
                isMobile={false}
                zoom={zoom}
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
