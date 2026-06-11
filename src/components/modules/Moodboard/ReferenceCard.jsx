import React, { useState, useRef, useEffect } from 'react';
import {
  Trash2,
  ExternalLink,
  MoreVertical,
  MessageSquare,
  Check,
  X,
  Palette
} from 'lucide-react';
import { motion } from 'framer-motion';

const ReferenceCard = ({ item, isMobile, onDelete, onUpdate, onDragStop }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [comment, setComment] = useState(item.comment || '');
  const [showOptions, setShowOptions] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const cardRef = useRef(null);

  // Colors for Post-its (pastel)
  const colorMap = {
    yellow: 'bg-amber-100 border-amber-200 text-amber-900',
    blue: 'bg-sky-100 border-sky-200 text-sky-900',
    green: 'bg-emerald-100 border-emerald-200 text-emerald-900'
  };

  const currentColorClass = colorMap[item.metadata?.color] || colorMap.yellow;

  useEffect(() => {
    setComment(item.comment || '');
  }, [item.comment]);

  const handleSaveComment = () => {
    onUpdate({ comment });
    setIsEditing(false);
  };

  const handleColorChange = (color) => {
    onUpdate({ metadata: { ...item.metadata, color } });
  };

  const cardStyle = isMobile ? {} : {
    position: 'absolute',
    left: `${item.positionX}px`,
    top: `${item.positionY}px`,
    zIndex: isDragging ? 50 : 10
  };

  // Draggable logic for desktop
  const handleMouseDown = (e) => {
    if (isMobile || isEditing || showOptions) return;

    // Prevent dragging if clicking on buttons or inputs
    if (e.target.closest('button') || e.target.closest('input') || e.target.closest('textarea')) return;

    setIsDragging(true);
    const startX = e.clientX - item.positionX;
    const startY = e.clientY - item.positionY;

    const handleMouseMove = (moveEvent) => {
      const newX = moveEvent.clientX - startX;
      const newY = moveEvent.clientY - startY;

      // Update local UI position for smooth drag
      if (cardRef.current) {
        cardRef.current.style.left = `${newX}px`;
        cardRef.current.style.top = `${newY}px`;
      }
    };

    const handleMouseUp = (upEvent) => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      setIsDragging(false);

      const finalX = upEvent.clientX - startX;
      const finalY = upEvent.clientY - startY;

      if (onDragStop) {
        onDragStop(finalX, finalY);
      }
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const renderContent = () => {
    switch (item.type) {
      case 'image':
        return (
          <div className="relative group overflow-hidden rounded-lg">
            <img
              src={item.url || item.assetUrl}
              alt="Reference"
              className="w-full h-auto object-cover max-h-[400px] min-w-[200px]"
            />
          </div>
        );
      case 'link':
        const meta = item.metadata || {};
        return (
          <div className="flex flex-col bg-white rounded-lg border border-slate-200 overflow-hidden min-w-[280px]">
            {meta.image && (
              <img src={meta.image} alt={meta.title} className="w-full h-32 object-cover" />
            )}
            <div className="p-3">
              <div className="text-[10px] uppercase tracking-wider text-slate-400 font-bold mb-1">
                {meta.siteName || 'Enlace'}
              </div>
              <h4 className="text-sm font-bold text-slate-800 line-clamp-2 mb-1">{meta.title}</h4>
              <p className="text-xs text-slate-500 line-clamp-2">{meta.description}</p>
              <a
                href={item.contentUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 flex items-center gap-1.5 text-xs text-indigo-600 font-medium hover:underline"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Visitar</span>
              </a>
            </div>
          </div>
        );
      case 'text':
        return (
          <div className={`p-4 rounded-xl border shadow-sm min-w-[200px] min-h-[150px] ${currentColorClass}`}>
             <div className="flex justify-between items-start mb-2">
                <Palette className="w-3.5 h-3.5 opacity-30" />
                <div className="flex gap-1">
                   {['yellow', 'blue', 'green'].map(c => (
                     <button
                        key={c}
                        onClick={() => handleColorChange(c)}
                        className={`w-3 h-3 rounded-full border border-black/10 ${c === 'yellow' ? 'bg-amber-300' : c === 'blue' ? 'bg-sky-300' : 'bg-emerald-300'}`}
                     />
                   ))}
                </div>
             </div>
             {isEditing ? (
               <textarea
                  autoFocus
                  className="w-full bg-transparent border-none focus:ring-0 text-sm resize-none h-24"
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  onBlur={handleSaveComment}
                  placeholder="Escribe algo..."
               />
             ) : (
               <div
                  className="text-sm cursor-text h-24 whitespace-pre-wrap overflow-hidden"
                  onClick={() => setIsEditing(true)}
               >
                  {comment || 'Hacer clic para editar...'}
               </div>
             )}
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div
      ref={cardRef}
      style={cardStyle}
      onMouseDown={handleMouseDown}
      className={`group ${isDragging ? 'cursor-grabbing' : 'cursor-grab'} ${isMobile ? 'w-full' : ''}`}
    >
      <div className={`relative transition-all ${isDragging ? 'scale-105 rotate-2' : ''}`}>

        {/* Item Content */}
        {renderContent()}

        {/* Comment Overlay (for Image and Link) */}
        {item.type !== 'text' && (
          <div className="mt-2 group-hover:opacity-100">
            {isEditing ? (
              <div className="bg-white border border-indigo-200 rounded-lg p-2 shadow-lg z-50">
                <textarea
                  autoFocus
                  className="w-full text-xs border-none focus:ring-0 resize-none"
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Añadir comentario..."
                  rows={2}
                />
                <div className="flex justify-end gap-1 mt-1">
                  <button onClick={() => setIsEditing(false)} className="p-1 hover:bg-slate-100 rounded text-slate-400">
                    <X className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={handleSaveComment} className="p-1 hover:bg-indigo-50 rounded text-indigo-600">
                    <Check className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ) : comment ? (
              <div
                className="inline-flex items-center gap-1.5 bg-slate-800/90 text-white px-2.5 py-1.5 rounded-full text-[11px] shadow-sm cursor-pointer hover:bg-slate-700 transition-colors"
                onClick={() => setIsEditing(true)}
              >
                <MessageSquare className="w-3 h-3 text-slate-400" />
                <span className="font-medium truncate max-w-[150px]">{comment}</span>
              </div>
            ) : (
              <button
                className="opacity-0 group-hover:opacity-100 inline-flex items-center gap-1.5 bg-white text-slate-500 px-2.5 py-1.5 rounded-full text-[11px] shadow-sm border border-slate-200 hover:bg-slate-50 transition-all"
                onClick={() => setIsEditing(true)}
              >
                <MessageSquare className="w-3 h-3" />
                <span>Añadir nota</span>
              </button>
            )}
          </div>
        )}

        {/* Options Menu */}
        <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity z-20">
          <div className="relative">
            <button
              onClick={(e) => { e.stopPropagation(); setShowOptions(!showOptions); }}
              className="p-1.5 bg-white/90 backdrop-blur rounded-lg shadow-sm border border-slate-200 hover:bg-white text-slate-600"
            >
              <MoreVertical className="w-4 h-4" />
            </button>

            {showOptions && (
              <div className="absolute right-0 mt-1 w-32 bg-white rounded-lg shadow-xl border border-slate-200 py-1 overflow-hidden z-50 animate-in fade-in zoom-in duration-150">
                <button
                  onClick={(e) => { e.stopPropagation(); onDelete(); setShowOptions(false); }}
                  className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-red-600 hover:bg-red-50"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Eliminar
                </button>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
};

export default ReferenceCard;
