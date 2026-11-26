import React, { useId } from 'react';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { AlertCircle, Info, Loader2 } from '@/components/ui/icons';
import { TiktokLogo } from '@/components/ui/SocialBrandLogos';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';
import {
  TIKTOK_BRANDED_CONTENT_POLICY_URL, TIKTOK_MUSIC_CONFIRMATION_URL, TIKTOK_PRIVACY_LABELS,
  normalizeTikTokOptions, tiktokCommercialLabel, tiktokConsentText
} from '@/lib/tiktokPublishing';

/**
 * Lo que TikTok obliga a preguntar antes de cada publicación (25 de noviembre de 2026). Aparece en la
 * banda cuando la persona marca TikTok, y sin responderlo «Programar» no se enciende.
 *
 * No es diseño nuestro: son los requisitos con los que TikTok aprueba o rechaza la aplicación.
 *
 * - Se muestra **a qué cuenta** se publica, con el nombre que TikTok da en ese momento.
 * - **Quién puede verlo** no trae opción por defecto y solo ofrece lo que esa cuenta admite hoy.
 * - **Comentarios, dúo y pegar** salen apagados; lo que la cuenta tiene desactivado aparece en gris.
 * - **Contenido comercial** sale apagado; al encenderlo hay que decir si es la marca propia, la de un
 *   tercero o las dos, y se dice cómo quedará etiquetado. Una colaboración pagada no puede ir como «Solo yo».
 * - La frase de consentimiento va escrita junto a la casilla que la acepta.
 *
 * Lo que la cuenta permite se le pregunta a TikTok cada vez que esto se abre: TikTok no deja guardarlo.
 */
const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('authToken')}` });
const fetchCreatorInfo = async (accountId) => (await axios.get(`${getApiBaseUrl()}/api/social/tiktok/creator-info`, { params: { accountId }, headers: authHeaders() })).data;

const CHECK = 'h-4 w-4 shrink-0 accent-brand-cyan disabled:cursor-not-allowed';
const LINK = 'font-medium text-brand-cyan-deep underline underline-offset-2 dark:text-brand-cyan';

const Toggle = ({ label, checked, disabled, hint, onChange, ...rest }) => (
  <label className={`inline-flex min-h-9 items-center gap-2 text-[13px] ${disabled ? 'cursor-not-allowed text-zinc-400 dark:text-zinc-500' : 'cursor-pointer text-zinc-700 dark:text-zinc-200'}`} title={hint || undefined}>
    <input type="checkbox" checked={checked && !disabled} disabled={disabled} onChange={(event) => onChange(event.target.checked)} className={CHECK} {...rest} />
    <span>{label}{disabled && hint ? <span className="text-zinc-400 dark:text-zinc-500"> · {hint}</span> : null}</span>
  </label>
);

export default function TikTokPostOptions({ account, value, onChange, onCreatorInfo, loadCreatorInfo = fetchCreatorInfo, disabled = false }) {
  const id = useId();
  const options = normalizeTikTokOptions(value);
  const { data: creator, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['tiktok-creator-info', account.id],
    queryFn: async () => {
      const info = await loadCreatorInfo(account.id);
      onCreatorInfo?.(account.id, info);
      return info;
    },
    // Siempre fresco: el dueño de la cuenta cambia su privacidad desde el teléfono.
    staleTime: 0,
    gcTime: 0,
    retry: false,
    refetchOnWindowFocus: false
  });
  const set = (patch) => onChange({ ...options, ...patch });

  if (isLoading) {
    return (
      <div className="mt-2 flex items-center gap-2 rounded-xl border border-zinc-200 px-3 py-3 text-xs text-zinc-500 dark:border-white/10 dark:text-zinc-400" data-tiktok-options="loading">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Preguntando a TikTok qué permite esta cuenta…
      </div>
    );
  }

  if (error || !creator) {
    return (
      <div className="mt-2 flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-3 text-xs text-destructive" role="alert" data-tiktok-options="error">
        <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span className="min-w-0 flex-1 break-words">
          {error?.response?.data?.error || 'No se pudo consultar la cuenta de TikTok. Sin eso no se puede programar ahí.'}
          {' '}
          <button type="button" onClick={() => refetch()} disabled={isFetching} className="font-bold underline underline-offset-2 disabled:opacity-60">Volver a intentar</button>
        </span>
      </div>
    );
  }

  const privacyChoices = creator.privacyLevelOptions.filter((level) => TIKTOK_PRIVACY_LABELS[level]);
  const commercialLabel = tiktokCommercialLabel(options);
  const consent = tiktokConsentText(options);
  const needsCommercialChoice = options.commercial && !options.yourBrand && !options.brandedContent;
  const privateWithBranded = (level) => level === 'SELF_ONLY' && options.brandedContent;

  return (
    <fieldset disabled={disabled} className="mt-2 min-w-0 space-y-3 rounded-xl border border-zinc-200 bg-white px-3 py-3 dark:border-white/10 dark:bg-zinc-900/60" data-tiktok-options={account.id}>
      <legend className="sr-only">Opciones de TikTok para {account.displayName}</legend>

      <p className="flex min-w-0 items-center gap-2 text-xs text-zinc-600 dark:text-zinc-300">
        <TiktokLogo className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span className="min-w-0 break-words">Se publica en la cuenta <strong className="text-zinc-900 dark:text-zinc-50">{creator.nickname || account.displayName}</strong>{creator.username ? ` (@${creator.username})` : ''}.</span>
      </p>

      <div className="min-w-0">
        <label htmlFor={`${id}-privacy`} className="mb-1 block text-xs font-medium text-zinc-600 dark:text-zinc-300">Quién puede ver este video</label>
        <select
          id={`${id}-privacy`}
          value={options.privacyLevel || ''}
          onChange={(event) => set({ privacyLevel: event.target.value || null })}
          data-tiktok-privacy
          className="h-10 w-full min-w-0 rounded-xl border border-zinc-200 bg-white px-3 text-sm text-zinc-900 outline-none transition focus:border-brand-cyan focus:ring-2 focus:ring-brand-cyan/20 dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-50 sm:max-w-xs"
        >
          {/* Sin opción por defecto: TikTok exige que la persona elija cada vez. */}
          <option value="" disabled>Elige una opción</option>
          {privacyChoices.map((level) => (
            <option key={level} value={level} disabled={privateWithBranded(level)}>
              {TIKTOK_PRIVACY_LABELS[level]}{privateWithBranded(level) ? ' (no disponible para colaboración pagada)' : ''}
            </option>
          ))}
        </select>
      </div>

      <div role="group" aria-label="Permitir a otras personas" className="min-w-0">
        <span className="mb-0.5 block text-xs font-medium text-zinc-600 dark:text-zinc-300">Permitir a otras personas</span>
        <div className="flex flex-wrap gap-x-5 gap-y-1">
          <Toggle label="Comentar" checked={options.allowComment} disabled={creator.commentDisabled} hint={creator.commentDisabled ? 'desactivado en la cuenta' : ''} onChange={(checked) => set({ allowComment: checked })} data-tiktok-comment />
          <Toggle label="Dúo" checked={options.allowDuet} disabled={creator.duetDisabled} hint={creator.duetDisabled ? 'desactivado en la cuenta' : ''} onChange={(checked) => set({ allowDuet: checked })} data-tiktok-duet />
          <Toggle label="Pegar" checked={options.allowStitch} disabled={creator.stitchDisabled} hint={creator.stitchDisabled ? 'desactivado en la cuenta' : ''} onChange={(checked) => set({ allowStitch: checked })} data-tiktok-stitch />
        </div>
      </div>

      <div className="min-w-0">
        <Toggle
          label="Este video promociona una marca, un producto o un servicio"
          checked={options.commercial}
          onChange={(checked) => set({ commercial: checked, ...(checked ? {} : { yourBrand: false, brandedContent: false }) })}
          data-tiktok-commercial
        />
        {options.commercial && (
          <div className="ml-6 mt-1 flex flex-col items-start gap-0.5" data-tiktok-commercial-choice>
            <Toggle label="Tu marca: te promocionas a ti o a tu propio negocio" checked={options.yourBrand} onChange={(checked) => set({ yourBrand: checked })} data-tiktok-your-brand />
            <Toggle
              label="Contenido de marca: promocionas a un tercero"
              checked={options.brandedContent}
              disabled={options.privacyLevel === 'SELF_ONLY'}
              hint={options.privacyLevel === 'SELF_ONLY' ? 'no puede ir como «Solo yo»' : ''}
              onChange={(checked) => set({ brandedContent: checked })}
              data-tiktok-branded
            />
            {needsCommercialChoice && (
              <p className="flex items-start gap-1.5 pt-1 text-xs text-zinc-600 dark:text-zinc-300">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-zinc-400" aria-hidden="true" />
                <span>Marca al menos una de las dos para poder programar.</span>
              </p>
            )}
            {commercialLabel && <p className="pt-1 text-xs text-zinc-600 dark:text-zinc-300" data-tiktok-label>{commercialLabel}</p>}
          </div>
        )}
      </div>

      <label className="flex min-w-0 cursor-pointer items-start gap-2 border-t border-zinc-100 pt-3 text-xs leading-relaxed text-zinc-700 dark:border-white/5 dark:text-zinc-200">
        <input type="checkbox" checked={options.consent} onChange={(event) => set({ consent: event.target.checked })} className={`${CHECK} mt-0.5`} data-tiktok-consent />
        <span className="min-w-0">
          {consent.text}{' '}
          {consent.links.includes('branded') && <><a href={TIKTOK_BRANDED_CONTENT_POLICY_URL} target="_blank" rel="noreferrer" className={LINK}>Política de contenido de marca</a>{' · '}</>}
          <a href={TIKTOK_MUSIC_CONFIRMATION_URL} target="_blank" rel="noreferrer" className={LINK}>Confirmación de uso de música</a>
        </span>
      </label>

      <p className="flex items-start gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span>Después de salir, TikTok puede tardar unos minutos en procesar el video y mostrarlo en el perfil.</span>
      </p>
    </fieldset>
  );
}
