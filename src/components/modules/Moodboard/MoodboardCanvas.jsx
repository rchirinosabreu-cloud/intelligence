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
  MessageSquare
} from 'lucide-react';
import axios from 'axios';
import { toast } from 'react-hot-toast';
import ReferenceCard from './ReferenceCard';

const MoodboardCanvas = ({ clientId }) => {
  const [boards, setBoards] = useState([]);
  const [currentBoard, setCurrentBoard] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const canvasRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    fetchBoards();
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [clientId]);

  useEffect(() => {
    if (currentBoard) {
      fetchItems(currentBoard.id);
    }
  }, [currentBoard]);

  const fetchBoards = async () => {
    try {
      const response = await axios.get(`/api/workspaces/${clientId}/boards`);
      setBoards(response.data);
      if (response.data.length > 0 && !currentBoard) {
        setCurrentBoard(response.data[0]);
      } else if (response.data.length === 0) {
        setLoading(false);
      }
    } catch (error) {
      console.error("Error fetching boards:", error);
      toast.error("Error al cargar los tableros");
      setLoading(false);
    }
  };

  const fetchItems = async (boardId) => {
    setLoading(true);
    try {
      const response = await axios.get(`/api/workspaces/${clientId}/boards/${boardId}/items`);
      setItems(response.data);
    } catch (error) {
      console.error("Error fetching items:", error);
      toast.error("Error al cargar los elementos");
    } finally {
      setLoading(false);
    }
  };

  const handleCreateBoard = async () => {
    const name = prompt("Nombre del nuevo tablero:");
    if (!name) return;
    try {
      const response = await axios.post(`/api/workspaces/${clientId}/boards`, { name });
      setBoards([response.data, ...boards]);
      setCurrentBoard(response.data);
      toast.success("Tablero creado");
    } catch (error) {
      toast.error("Error al crear tablero");
    }
  };

  const handleDeleteBoard = async (boardId) => {
    if (!confirm("¿Estás seguro de eliminar este tablero y todo su contenido?")) return;
    try {
      await axios.delete(`/api/workspaces/${clientId}/boards/${boardId}`);
      const updatedBoards = boards.filter(b => b.id !== boardId);
      setBoards(updatedBoards);
      if (currentBoard?.id === boardId) {
        setCurrentBoard(updatedBoards[0] || null);
        if (updatedBoards.length === 0) setItems([]);
      }
      toast.success("Tablero eliminado");
    } catch (error) {
      toast.error("Error al eliminar tablero");
    }
  };

  const handleAddItem = async (type, extraData = {}) => {
    if (!currentBoard) return;

    let itemData = {
      type,
      positionX: 100, // Default position
      positionY: 100,
      ...extraData
    };

    if (type === 'link') {
      const url = prompt("Pega el enlace aquí:");
      if (!url) return;
      toast.loading("Analizando enlace...");
      try {
        const unfurl = await axios.post('/api/reference-boards/unfurl', { url });
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
      const response = await axios.post(`/api/workspaces/${clientId}/boards/${currentBoard.id}/items`, itemData);
      setItems([...items, response.data]);
      setIsAdding(false);
      toast.success("Elemento añadido");
    } catch (error) {
      toast.error("Error al añadir elemento");
    }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file || !currentBoard) return;

    toast.loading("Subiendo imagen...");
    try {
      // 1. Get signed URL
      const { data: { url, gcsPath } } = await axios.get(
        `/api/workspaces/${clientId}/boards/${currentBoard.id}/storage/signed-url`,
        { params: { fileName: file.name, fileType: file.type } }
      );

      // 2. Upload to GCS
      await axios.put(url, file, {
        headers: { 'Content-Type': file.type }
      });

      // 3. Create item record
      await handleAddItem('image', { assetUrl: gcsPath });
      toast.dismiss();
    } catch (error) {
      console.error("Upload error:", error);
      toast.dismiss();
      toast.error("Error al subir imagen");
    }
  };

  const updateItemPosition = async (itemId, x, y) => {
    // Snap to 8px
    const snappedX = Math.round(x / 8) * 8;
    const snappedY = Math.round(y / 8) * 8;

    try {
      await axios.patch(`/api/workspaces/${clientId}/boards/${currentBoard.id}/items/${itemId}`, {
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
      await axios.delete(`/api/workspaces/${clientId}/boards/${currentBoard.id}/items/${itemId}`);
      setItems(items.filter(i => i.id !== itemId));
      toast.success("Eliminado");
    } catch (error) {
      toast.error("Error al eliminar");
    }
  };

  const handleUpdateItem = async (itemId, data) => {
    try {
      const response = await axios.patch(`/api/workspaces/${clientId}/boards/${currentBoard.id}/items/${itemId}`, data);
      setItems(items.map(i => i.id === itemId ? response.data : i));
    } catch (error) {
      toast.error("Error al actualizar");
    }
  };

  if (loading && boards.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-slate-50 rounded-xl overflow-hidden border border-slate-200">
      {/* Header / Board Selector */}
      <div className="flex items-center justify-between px-6 py-3 bg-white border-b border-slate-200">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <select
              className="bg-slate-100 border-none rounded-lg px-3 py-1.5 text-sm font-medium focus:ring-2 focus:ring-indigo-500"
              value={currentBoard?.id || ''}
              onChange={(e) => setCurrentBoard(boards.find(b => b.id === e.target.value))}
            >
              {boards.map(board => (
                <option key={board.id} value={board.id}>{board.name}</option>
              ))}
              {boards.length === 0 && <option value="">Sin tableros</option>}
            </select>
            <button
              onClick={handleCreateBoard}
              className="p-1.5 hover:bg-slate-100 rounded-md transition-colors text-slate-600"
              title="Nuevo Tablero"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>

          {currentBoard && (
            <button
              onClick={() => handleDeleteBoard(currentBoard.id)}
              className="p-1.5 hover:bg-red-50 text-red-500 rounded-md transition-colors"
              title="Eliminar Tablero"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          {!isMobile && (
            <div className="text-xs text-slate-400 font-mono mr-4">
              Canvas: 3000x3000px | Snap: 8px
            </div>
          )}

          <div className="relative">
            <button
              onClick={() => setIsAdding(!isAdding)}
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-all shadow-sm active:scale-95"
            >
              <Plus className="w-4 h-4" />
              <span>Añadir</span>
            </button>

            {isAdding && (
              <div className="absolute right-0 mt-2 w-48 bg-white rounded-xl shadow-xl border border-slate-200 py-2 z-50 animate-in fade-in zoom-in duration-200">
                <button
                  onClick={() => { fileInputRef.current?.click(); setIsAdding(false); }}
                  className="flex items-center gap-3 w-full px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
                >
                  <ImageIcon className="w-4 h-4 text-blue-500" />
                  Imagen
                </button>
                <button
                  onClick={() => handleAddItem('link')}
                  className="flex items-center gap-3 w-full px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
                >
                  <LinkIcon className="w-4 h-4 text-green-500" />
                  Enlace
                </button>
                <button
                  onClick={() => handleAddItem('text')}
                  className="flex items-center gap-3 w-full px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
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
        className={`flex-1 overflow-auto bg-slate-100 ${isMobile ? 'p-4' : 'relative'}`}
        ref={canvasRef}
      >
        {!currentBoard ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-400 gap-4">
            <Maximize2 className="w-12 h-12 opacity-20" />
            <p>Crea tu primer tablero para empezar a añadir referencias</p>
            <button
              onClick={handleCreateBoard}
              className="text-indigo-600 font-medium hover:underline"
            >
              Crear Tablero
            </button>
          </div>
        ) : isMobile ? (
          // Mobile Grid View
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
               <div className="text-center py-10 text-slate-400">
                  No hay elementos en este tablero.
               </div>
            )}
          </div>
        ) : (
          // Desktop Absolute Canvas
          <div
            className="canvas-container"
            style={{
              width: '3000px',
              height: '3000px',
              position: 'relative',
              backgroundImage: 'radial-gradient(#cbd5e1 1px, transparent 0)',
              backgroundSize: '24px 24px', // Dot grid
              backgroundColor: '#f8fafc'
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

      {/* Footer / Stats */}
      {currentBoard && (
        <div className="px-6 py-2 bg-white border-t border-slate-200 text-[10px] text-slate-400 flex justify-between">
          <div>{items.length} elementos en "{currentBoard.name}"</div>
          <div>Cualquier cambio se guarda automáticamente</div>
        </div>
      )}
    </div>
  );
};

export default MoodboardCanvas;
