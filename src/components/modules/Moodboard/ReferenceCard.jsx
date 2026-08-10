import React, { useState, useRef, useEffect } from 'react';
import {
  Trash2,
  ExternalLink,
  MoreVertical,
  MessageSquare,
  Check,
  X,
  Palette,
  Globe
} from '@/components/ui/icons';
import { motion } from 'framer-motion';

const ReferenceCard = ({ item, isMobile, zoom = 1, onDelete, onUpdate, onDragStop }) => {
  const [isEditing, setIsEditing] = useState(item.isTemp || false);
  const [comment, setComment] = useState(item.comment || '');
  const [urlInput, setUrlInput] = useState('');
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
    if (item.isTemp) return; // Temp items handle their own save
    onUpdate({ comment });
    setIsEditing(false);
  };

  const handleLinkSubmit = async (e) => {
    if (e.key === 'Enter' && urlInput) {
      setIsEditing(false);
      // We need a way to tell the parent to replace the temp item with a real one
      // Since handleAddItem is in the parent, we'll use a special callback if provided
      // or just call onUpdate if it's meant to be a transformation
      // But according to my logic in MoodboardCanvas, I should probably have
      // a way to finalize temp items.
      onUpdate({ contentUrl: urlInput, isTemp: false });
    }
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
    if (isMobile || isEditing) return;

    // Prevent dragging if clicking on buttons or inputs
    if (e.target.closest('button') || e.target.closest('input') || e.target.closest('textarea')) return;

    setIsDragging(true);
    const startX = e.clientX - item.positionX;
    const startY = e.clientY - item.positionY;

    const handleMouseMove = (moveEvent) => {
      // Normalize delta by zoom
      const deltaX = (moveEvent.clientX - e.clientX) / zoom;
      const deltaY = (moveEvent.clientY - e.clientY) / zoom;

      const newX = item.positionX + deltaX;
      const newY = item.positionY + deltaY;

      if (cardRef.current) {
        cardRef.current.style.left = `${newX}px`;
        cardRef.current.style.top = `${newY}px`;
      }
    };

    const handleMouseUp = (upEvent) => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      setIsDragging(false);

      const deltaX = (upEvent.clientX - e.clientX) / zoom;
      const deltaY = (upEvent.clientY - e.clientY) / zoom;

      const finalX = item.positionX + deltaX;
      const finalY = item.positionY + deltaY;

      if (onDragStop) {
        onDragStop(finalX, finalY);
      }
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const getBrandInfo = (url) => {
    if (!url) return null;
    const lowerUrl = url.toLowerCase();
    if (lowerUrl.includes('instagram.com')) return { name: 'Instagram', color: 'from-purple-600 via-pink-500 to-orange-400' };
    if (lowerUrl.includes('facebook.com')) return { name: 'Facebook', color: 'from-blue-700 to-blue-500' };
    if (lowerUrl.includes('tiktok.com')) return { name: 'TikTok', color: 'from-zinc-900 via-zinc-800 to-zinc-900' };
    if (lowerUrl.includes('pinterest.com')) return { name: 'Pinterest', color: 'from-red-600 to-red-500' };
    if (lowerUrl.includes('twitter.com') || lowerUrl.includes('x.com')) return { name: 'X', color: 'from-zinc-950 to-zinc-800' };
    return null;
  };

  const renderContent = () => {
    switch (item.type) {
      case 'image':
        return (
          <div className="relative group overflow-hidden rounded-2xl shadow-sm border border-zinc-200 dark:border-zinc-800 aspect-video w-full">
            <img
              src={item.url}
              alt="Reference"
              className="w-full h-full object-cover block"
              loading="lazy"
            />
          </div>
        );
      case 'link':
        if (item.isTemp) {
          return (
            <div className="flex flex-col bg-white rounded-xl border-2 border-indigo-500 overflow-hidden min-w-[280px] p-4 shadow-2xl animate-in zoom-in-95">
              <div className="text-[10px] uppercase tracking-wider text-indigo-500 font-black mb-2">Pegar Enlace</div>
              <input
                autoFocus
                type="text"
                placeholder="https://..."
                className="w-full bg-zinc-50 border-none rounded-lg p-2 text-sm focus:ring-0 outline-none"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                onKeyDown={handleLinkSubmit}
              />
              <div className="text-[9px] text-zinc-400 mt-2">Presiona Enter para confirmar</div>
            </div>
          );
        }
        const meta = item.metadata || {};
        const brand = getBrandInfo(item.contentUrl);

        return (
          <div className="flex flex-col bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden w-full shadow-sm hover:shadow-2xl transition-all duration-500 group/link">
            {/* Header Visual: Image or Brand Fallback */}
            {meta.image ? (
              <div className="relative aspect-video w-full overflow-hidden border-b border-zinc-100 dark:border-zinc-800">
                <img src={meta.image} alt={meta.title} className="w-full h-full object-cover group-hover/link:scale-110 transition-transform duration-700" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover/link:opacity-100 transition-opacity" />
              </div>
            ) : (
              <div className={`aspect-video w-full flex items-center justify-center bg-gradient-to-br ${brand?.color || 'from-zinc-100 to-zinc-200 dark:from-zinc-800 dark:to-zinc-900'} border-b border-zinc-100 dark:border-zinc-800`}>
                {brand ? (
                   <div className="flex flex-col items-center gap-2">
                      <div className="w-12 h-12 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center border border-white/30 shadow-2xl">
                        <ExternalLink className="w-6 h-6 text-white" />
                      </div>
                      <span className="text-white text-[10px] font-black uppercase tracking-[0.2em] opacity-80">{brand.name}</span>
                   </div>
                ) : (
                  <ExternalLink className="w-10 h-10 text-zinc-300 dark:text-zinc-600" />
                )}
              </div>
            )}

            <div className="p-4 relative">
              {/* Site Badge */}
              <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-[9px] font-black text-zinc-500 dark:text-zinc-400 uppercase tracking-tighter mb-3">
                 <Globe className="w-2.5 h-2.5" />
                 {meta.siteName || brand?.name || 'Portal Web'}
              </div>

              <h4 className="text-sm font-black text-zinc-900 dark:text-zinc-100 line-clamp-2 leading-tight mb-2 tracking-tight">
                {meta.title}
              </h4>

              {meta.description && (
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400 line-clamp-2 leading-relaxed mb-4">
                  {meta.description}
                </p>
              )}

              <div className="flex items-center justify-between mt-auto pt-2 border-t border-zinc-100 dark:border-zinc-800">
                <a
                  href={item.contentUrl?.startsWith('http') ? item.contentUrl : `https://${item.contentUrl}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-[10px] font-black text-indigo-500 hover:text-indigo-400 transition-colors uppercase tracking-widest"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Explorar</span>
                </a>
                <div className="text-[9px] font-mono text-zinc-300 dark:text-zinc-600">
                  {(() => {
                    try {
                      return new URL(item.contentUrl).hostname.replace('www.', '');
                    } catch (e) {
                      return item.contentUrl || '';
                    }
                  })()}
                </div>
              </div>
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
                  className="w-full bg-transparent border-none focus:ring-0 text-sm resize-none h-24 outline-none shadow-none"
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
      className={`group ${isDragging ? 'cursor-grabbing' : 'cursor-grab'} ${isMobile ? 'w-full' : 'w-[340px] max-w-full'}`}
    >
      <div className={`relative transition-all ${isDragging ? 'scale-105 rotate-2' : ''}`}>

        {/* Item Content */}
        {renderContent()}

        {/* Comment Overlay (for Image and Link) */}
        {item.type !== 'text' && !item.isTemp && (
          <div className="mt-2 group-hover:opacity-100">
            {isEditing ? (
              <div className="bg-white border border-indigo-200 rounded-lg p-2 shadow-lg z-50">
                <textarea
                  autoFocus
                  className="w-full text-xs border-none focus:ring-0 resize-none outline-none shadow-none"
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

        {/* Delete Button (Hover only) */}
        {!item.isTemp && (
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="absolute -top-2 -right-2 opacity-0 group-hover:opacity-100 transition-opacity z-20 p-1.5 bg-red-500 text-white rounded-full shadow-lg hover:bg-red-600"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}

      </div>
    </div>
  );
};

export default ReferenceCard;
