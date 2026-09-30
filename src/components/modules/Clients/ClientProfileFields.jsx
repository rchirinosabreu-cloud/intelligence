import React, { useId } from 'react';
import Select from '@/components/ui/Select';
import { PARTY_DOCUMENT_TYPES } from '@/lib/partyIdentity';

/**
 * Los campos de la ficha de un cliente (Rodny, 30 de septiembre de 2026: «al crear un
 * cliente nuevo se desplieguen todos los campos propios de un cliente, no es solo el
 * nombre»). Uno solo para Clientes, el directorio de Financiero y la cuenta por cobrar:
 * lo que va impreso en la cuenta de cobro, a quién se le cobra y dónde.
 *
 * Controlado: `value` es el formulario (ver `emptyClientProfile` / `clientProfileFrom`) y
 * `onChange` recibe solo el campo que cambió. `errors` pinta el aviso de cada campo.
 */
const DEFAULT_FIELD = 'min-h-11 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2.5 text-sm text-zinc-900 disabled:opacity-60 dark:border-white/10 dark:bg-zinc-950 dark:text-white';

export default function ClientProfileFields({ value, onChange, errors = {}, disabled = false, showName = true, nameAutoFocus = false, fieldClassName = DEFAULT_FIELD }) {
    const id = useId();
    const field = (key, label, props = {}) => (
        <label className="block space-y-1.5 text-sm text-zinc-700 dark:text-zinc-200" htmlFor={`${id}-${key}`}>
            <span className="block">{label}</span>
            <input id={`${id}-${key}`} value={value[key] ?? ''} disabled={disabled}
                aria-invalid={errors[key] ? true : undefined}
                aria-describedby={errors[key] ? `${id}-${key}-error` : undefined}
                onChange={(event) => onChange({ [key]: event.target.value })}
                className={fieldClassName} {...props} />
            {errors[key] && <span id={`${id}-${key}-error`} role="alert" className="block text-xs text-destructive brain-destructive-text">{errors[key]}</span>}
        </label>
    );

    return (
        <div className="space-y-5" data-client-profile-fields>
            {showName && field('name', 'Nombre del cliente', { required: true, maxLength: 120, autoFocus: nameAutoFocus, placeholder: 'Como lo llama el equipo, ej. Fundación Grit' })}

            <fieldset className="space-y-3">
                <legend className="text-sm font-medium text-zinc-900 dark:text-white">Datos para la cuenta de cobro</legend>
                <p className="text-xs text-zinc-500">Van impresos en el documento. Son opcionales: sin ellos la cuenta sale con el nombre del cliente.</p>
                {field('legalName', 'Nombre completo o razón social', { maxLength: 200, placeholder: 'Fundación Grit Colombia' })}
                <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
                    <label className="block space-y-1.5 text-sm text-zinc-700 dark:text-zinc-200">
                        <span className="block">Documento</span>
                        <Select value={value.documentType ?? ''} disabled={disabled} aria-label="Tipo de documento del cliente"
                            onChange={(event) => onChange({ documentType: event.target.value })} className={fieldClassName}>
                            <option value="">Sin documento</option>
                            {PARTY_DOCUMENT_TYPES.map((type) => <option key={type.value} value={type.value}>{type.name}</option>)}
                        </Select>
                        {errors.documentType && <span role="alert" className="block text-xs text-destructive brain-destructive-text">{errors.documentType}</span>}
                    </label>
                    {field('documentNumber', 'Número', { maxLength: 30, autoCapitalize: 'none', autoCorrect: 'off', spellCheck: false, placeholder: '901378858' })}
                </div>
            </fieldset>

            <fieldset className="space-y-3">
                <legend className="text-sm font-medium text-zinc-900 dark:text-white">Contacto</legend>
                {field('contactName', 'Persona de contacto', { maxLength: 120, placeholder: 'A quién se le cobra' })}
                <div className="grid gap-3 sm:grid-cols-2">
                    {field('email', 'Correo', { type: 'email', maxLength: 160, autoCapitalize: 'none', spellCheck: false, placeholder: 'pagos@empresa.com' })}
                    {field('phone', 'Teléfono', { type: 'tel', maxLength: 40, placeholder: '+57 300 000 0000' })}
                </div>
            </fieldset>

            <fieldset className="space-y-3">
                <legend className="text-sm font-medium text-zinc-900 dark:text-white">Ubicación</legend>
                {field('address', 'Dirección', { maxLength: 200, placeholder: 'Calle, número, barrio' })}
                <div className="grid gap-3 sm:grid-cols-2">
                    {field('city', 'Ciudad', { maxLength: 80, placeholder: 'Cartagena' })}
                    {field('country', 'País', { maxLength: 80, placeholder: 'Colombia' })}
                </div>
            </fieldset>
        </div>
    );
}
