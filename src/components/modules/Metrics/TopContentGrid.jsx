
import React from 'react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Eye, MousePointer2, Facebook, Instagram, Image as ImageIcon, Video, Layers } from 'lucide-react';

const TopContentGrid = ({ content }) => {
  if (!content || content.length === 0) {
    return (
      <Card className="p-12 text-center border-dashed border-2">
        <p className="text-zinc-500">No hay contenido destacado en este periodo.</p>
      </Card>
    );
  }

  const getTypeIcon = (type) => {
    switch (type) {
      case 'VIDEO':
      case 'REELS':
        return <Video className="w-3 h-3" />;
      case 'CAROUSEL_ALBUM':
        return <Layers className="w-3 h-3" />;
      default:
        return <ImageIcon className="w-3 h-3" />;
    }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
      {content.map((item) => (
        <Card key={item.id} className="group overflow-hidden border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 transition-all bg-white dark:bg-zinc-950 flex flex-col">
          {/* Thumbnail Container */}
          <div className="relative aspect-square bg-zinc-100 dark:bg-zinc-900 overflow-hidden">
            {item.thumbnail ? (
              <img
                src={item.thumbnail}
                alt={item.content}
                className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-zinc-300">
                <ImageIcon className="w-10 h-10" />
              </div>
            )}

            {/* Platform Badge */}
            <div className="absolute top-2 left-2">
              <Badge className={`h-6 w-6 p-0 flex items-center justify-center rounded-full border-0 ${item.platform === 'facebook' ? 'bg-[#1877F2]' : 'bg-gradient-to-tr from-[#f09433] via-[#e1306c] to-[#bc1888]'}`}>
                {item.platform === 'facebook' ? <Facebook className="w-3.5 h-3.5 text-white" /> : <Instagram className="w-3.5 h-3.5 text-white" />}
              </Badge>
            </div>

            {/* Type Badge */}
            <div className="absolute top-2 right-2">
               <Badge variant="secondary" className="h-6 px-2 text-[10px] font-bold backdrop-blur-md bg-black/50 text-white border-0 gap-1">
                 {getTypeIcon(item.type)}
                 {item.type === 'CAROUSEL_ALBUM' ? 'CAROUSEL' : item.type}
               </Badge>
            </div>

            {/* Stats Overlay on Hover */}
            <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-4 text-white">
                <div className="flex flex-col items-center">
                    <Eye className="w-5 h-5 mb-1 text-zinc-300" />
                    <span className="text-xs font-bold">{item.reach.toLocaleString()}</span>
                </div>
                <div className="flex flex-col items-center">
                    <MousePointer2 className="w-5 h-5 mb-1 text-zinc-300" />
                    <span className="text-xs font-bold">{item.engagement.toLocaleString()}</span>
                </div>
            </div>
          </div>

          {/* Content Info */}
          <div className="p-3 space-y-2 flex-1 flex flex-col">
            <p className="text-[11px] text-zinc-600 dark:text-zinc-400 line-clamp-2 leading-relaxed flex-1">
              {item.content}
            </p>

            <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1 text-[10px] font-bold text-zinc-500">
                        <Eye className="w-3 h-3" />
                        {item.reach > 1000 ? (item.reach / 1000).toFixed(1) + 'k' : item.reach}
                    </div>
                    <div className="flex items-center gap-1 text-[10px] font-bold text-zinc-500">
                        <MousePointer2 className="w-3 h-3" />
                        {item.engagement}
                    </div>
                </div>
                <span className="text-[9px] text-zinc-400 font-medium">
                    {new Date(item.date).toLocaleDateString()}
                </span>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
};

export default TopContentGrid;
