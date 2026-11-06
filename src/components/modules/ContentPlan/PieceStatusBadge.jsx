import React from 'react';
import { AlertCircle, Calendar, CheckCircle2, Circle, Clock, FileText, Image, Send, Sparkles } from '@/components/ui/icons';
import { cn } from '@/lib/utils';
import { pieceStatusPresentation } from './pieceStatusPresentation';

const ICONS = { AlertCircle, Calendar, CheckCircle2, Circle, Clock, FileText, Image, Send, Sparkles };

export default function PieceStatusBadge({ item, publicView = false, className }) {
  const meta = pieceStatusPresentation(item, { publicView });
  const Icon = ICONS[meta.icon];
  return <span data-piece-status={item?.status || 'BORRADOR'} className={cn('inline-flex w-fit items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold', meta.chip, 'text-zinc-800 dark:text-zinc-100', className)}>
    <Icon className="h-3 w-3 shrink-0" aria-hidden="true" />{meta.label}
  </span>;
}
