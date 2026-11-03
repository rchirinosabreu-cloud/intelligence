import React, { useContext, useState } from 'react';
import TeamAvatar from '@/components/ui/TeamAvatar';
import { cn } from '@/lib/utils';
import { pixelAvatars } from './pixelAvatars';
import { pixelPoseSheets, poseFrames } from './pixelPoseSheets';
import { LeaguePoseContext } from './LeaguePoseContext';
import { LEAGUE_POSES } from '@/lib/leaguePose';

// Tres poses por persona, elegidas al abrir la liga. La hoja original se recorta solo al renderizar;
// el PNG conserva su alfa. Si falla, usa el avatar anterior y después la foto. `size` es el alto visible.
export default function RunnerAvatar({ person, size = 40, className, title, phase = 0 }) {
  const pose = useContext(LeaguePoseContext);
  const [failedSheet, setFailedSheet] = useState(null);
  const [failedUrl, setFailedUrl] = useState(null);
  const key = person?.pixelAvatarKey;
  const sheet = Object.hasOwn(pixelPoseSheets, key) ? pixelPoseSheets[key] : null;
  const frame = poseFrames[key];
  const url = (Object.hasOwn(pixelAvatars, person?.pixelAvatarKey) && pixelAvatars[person.pixelAvatarKey]) || person?.pixelAvatarUrl;
  if (sheet && frame && sheet !== failedSheet) {
    const scale = size / frame.height;
    const cellWidth = frame.width / 3;
    return <span data-runner-avatar="pixel" data-avatar-pose={LEAGUE_POSES[pose]}
      className={cn('league-pixel relative block shrink-0 overflow-hidden select-none', className)}
      style={{ width: cellWidth * scale, height: size, animationDelay: `${-(phase % 6) * 0.6}s` }}>
      <img src={sheet} alt={title || person.name || ''} draggable={false} decoding="async"
        onError={() => setFailedSheet(sheet)} className="absolute max-w-none"
        style={{ width: frame.width * scale, height: frame.imageHeight * scale, left: -pose * cellWidth * scale, top: -frame.top * scale }} />
    </span>;
  }
  if (url && url !== failedUrl) {
    return (
      <img
        src={url}
        onError={() => setFailedUrl(url)}
        alt={title || person.name || ''}
        draggable={false}
        data-runner-avatar="pixel"
        style={{ height: size, animationDelay: `${-((phase % 6) * 0.15).toFixed(2)}s` }}
        className={cn('league-pixel block w-auto max-w-none select-none object-contain', className)}
      />
    );
  }
  return (
    <span data-runner-avatar="photo" className={cn('league-pixel block shrink-0', className)} style={{ width: size, height: size, animationDelay: `${-((phase % 6) * 0.15).toFixed(2)}s` }}>
      <TeamAvatar member={person} size={size} className="h-full w-full rounded-full" showTitle={false} />
    </span>
  );
}
