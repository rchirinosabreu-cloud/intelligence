import React, { useContext, useState } from 'react';
import TeamAvatar from '@/components/ui/TeamAvatar';
import { cn } from '@/lib/utils';
import { pixelAvatars } from './pixelAvatars';
import { pixelPoseSheets, poseFrames } from './pixelPoseSheets';
import { LeaguePoseContext } from './LeaguePoseContext';
import { LEAGUE_POSES, LEAGUE_SPRITE_FRAMES, leagueGesture, leagueStillFrame, spriteLayout } from '@/lib/leaguePose';

// Cada persona tiene una hoja animada de ocho cuadros (reposo, saludo y celebración). Al abrir la liga hace el gesto
// de la pose sorteada una sola vez y vuelve al reposo; al pasar el cursor, enfocar o tocar lo repite. Con movimiento
// reducido queda el cuadro fijo de la pose. Si la hoja falla, usa el avatar anterior y después la foto.
// `size` es el alto visible de la persona de pie: las manos en alto y el salto se asoman fuera de la caja.
export default function RunnerAvatar({ person, size = 40, className, title, phase = 0 }) {
  const pose = useContext(LeaguePoseContext);
  const [failedSheet, setFailedSheet] = useState(null);
  const [failedUrl, setFailedUrl] = useState(null);
  const [asked, setAsked] = useState(0);
  const key = person?.pixelAvatarKey;
  const sheet = Object.hasOwn(pixelPoseSheets, key) ? pixelPoseSheets[key] : null;
  const layout = spriteLayout({ sheet: poseFrames, person: Object.hasOwn(poseFrames.people, key) ? poseFrames.people[key] : null, size });
  const url = (Object.hasOwn(pixelAvatars, person?.pixelAvatarKey) && pixelAvatars[person.pixelAvatarKey]) || person?.pixelAvatarUrl;
  if (sheet && layout && sheet !== failedSheet) {
    const poseName = LEAGUE_POSES[pose];
    const gesture = leagueGesture(poseName, asked > 0);
    const again = () => setAsked(count => count + 1);
    return <span data-runner-avatar="pixel" data-avatar-pose={poseName} data-avatar-gesture={gesture || 'none'}
      onMouseEnter={again} onFocus={again} onClick={again}
      className={cn('league-pixel relative block shrink-0 select-none', className)}
      style={{ width: layout.width, height: layout.height, animationDelay: `${-(phase % 6) * 0.6}s` }}>
      <span className="pointer-events-none absolute left-1/2 block overflow-hidden"
        style={{ width: layout.frameWidth, height: layout.frameHeight, marginLeft: -layout.frameWidth / 2, top: layout.top }}>
        <img key={`${poseName}-${asked}`} src={sheet} alt={title || person.name || ''} draggable={false} decoding="async"
          onError={() => setFailedSheet(sheet)}
          className={cn('league-sprite absolute left-0 top-0 max-w-none', gesture && `league-sprite-${gesture}`)}
          style={{ width: layout.sheetWidth, height: layout.frameHeight, imageRendering: layout.scale < 1 ? 'auto' : 'pixelated',
            animationDelay: `${0.25 + (phase % 6) * 0.12}s`, '--league-still': `${-leagueStillFrame(poseName) * 100 / LEAGUE_SPRITE_FRAMES}%` }} />
      </span>
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
