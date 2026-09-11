import React, { forwardRef, useEffect, useRef, useState } from 'react';
import * as Picker from '@radix-ui/react-select';
import { Check, ChevronDown, ChevronUp } from '@/components/ui/icons';
import { cn } from '@/lib/utils';

const touchQuery = '(hover: none) and (pointer: coarse)';
const textOf = children => React.Children.toArray(children).map(child => React.isValidElement(child) ? textOf(child.props.children) : String(child)).join('');
const encode = value => `option:${value}`;

function readOptions(children, group = null, groupDisabled = false) {
  return React.Children.toArray(children).flatMap(child => {
    if (!React.isValidElement(child)) return [];
    if (child.type === 'option') return [{ value: String(child.props.value ?? textOf(child.props.children)), label: textOf(child.props.children), disabled: groupDisabled || Boolean(child.props.disabled), group }];
    if (child.type === 'optgroup') return readOptions(child.props.children, child.props.label, groupDisabled || child.props.disabled);
    if (child.type === React.Fragment) return readOptions(child.props.children, group, groupDisabled);
    return [];
  });
}

/** Same value/onChange contract as a select. Native on touch, styled and keyboard-accessible on desktop. */
const Select = forwardRef(function Select({ children, value, defaultValue, onChange, className, id, disabled, required, multiple, size, onInvalid, ...props }, forwardedRef) {
  const nativeRef = useRef(null);
  const triggerRef = useRef(null);
  const [touch, setTouch] = useState(() => typeof window !== 'undefined' && window.matchMedia(touchQuery).matches);
  const [uncontrolled, setUncontrolled] = useState(defaultValue);
  const [open, setOpen] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const [snapshot, setSnapshot] = useState(null);
  const options = readOptions(children);
  const currentValue = value === undefined ? (uncontrolled ?? options.find(option => !option.disabled)?.value ?? '') : value;
  const selected = String(currentValue ?? '');
  const native = touch || multiple || Number(size) > 1;
  useEffect(() => {
    const media = window.matchMedia(touchQuery);
    const update = () => { setTouch(media.matches); setOpen(false); };
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  useEffect(() => {
    const form = nativeRef.current?.form;
    const reset = () => { setUncontrolled(defaultValue); setInvalid(false); setOpen(false); };
    form?.addEventListener('reset', reset);
    return () => form?.removeEventListener('reset', reset);
  }, [defaultValue, native]);
  const setNativeRef = node => {
    nativeRef.current = node;
    if (typeof forwardedRef === 'function') forwardedRef(node);
    else if (forwardedRef) forwardedRef.current = node;
  };
  const change = event => { setUncontrolled(multiple ? Array.from(event.target.selectedOptions, option => option.value) : event.target.value); setInvalid(false); onChange?.(event); };
  const control = <select {...props} id={native ? id : undefined} data-brain-select-native={native ? 'visible' : 'hidden'} ref={setNativeRef} value={currentValue}
    disabled={disabled} required={required} multiple={multiple} size={size} onChange={change}
    className={native ? cn(className, 'appearance-auto') : 'sr-only pointer-events-none'} aria-hidden={native ? undefined : true} tabIndex={native ? props.tabIndex : -1}
    onInvalid={event => { onInvalid?.(event); if (!native) { event.preventDefault(); setInvalid(true); triggerRef.current?.focus(); } }}>
    {children}
  </select>;
  if (native) return control;
  // Keep the list stable while choosing. A refetch must not remove/reorder the focused option.
  const visibleOptions = open && snapshot ? snapshot : options;
  const updateOpen = next => { if (next) setSnapshot(options); setOpen(next); };
  const choose = encoded => {
    const next = encoded.slice('option:'.length);
    // A disappeared/disabled option from a background refresh cannot be submitted.
    if (!options.some(option => option.value === next && !option.disabled)) return;
    const element = nativeRef.current;
    element.value = next;
    element.dispatchEvent(new Event('change', { bubbles: true }));
  };
  const groups = [];
  for (const option of visibleOptions) {
    let group = groups[groups.length - 1];
    if (!group || group.label !== option.group) { group = { label: option.group, options: [] }; groups.push(group); }
    group.options.push(option);
  }
  const { name, form, autoComplete, ...triggerProps } = props;
  return <>
    <Picker.Root value={encode(selected)} onValueChange={choose} open={open && !disabled} onOpenChange={updateOpen} disabled={disabled}>
      <Picker.Trigger {...triggerProps} id={id} ref={triggerRef} type="button" data-brain-select="true" aria-required={required || undefined} aria-invalid={invalid || props['aria-invalid'] || undefined}
        className={cn('relative inline-flex min-h-11 w-full items-center rounded-xl border border-input bg-background px-3 pr-9 text-left text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-50', className)}>
        <Picker.Value asChild><span className="min-w-0 truncate">{options.find(option => option.value === selected)?.label || 'Selecciona una opción'}</span></Picker.Value>
        <Picker.Icon className="pointer-events-none absolute right-3 flex items-center text-muted-foreground"><ChevronDown className="h-4 w-4" /></Picker.Icon>
      </Picker.Trigger>
      <Picker.Portal>
        <Picker.Content position="popper" sideOffset={6} collisionPadding={12} data-brain-select-menu="true" data-side-panel-ignore="true"
          className="brain-popover-surface z-[300] min-w-[var(--radix-select-trigger-width)] overflow-hidden p-1.5 text-sm font-normal normal-case tracking-normal motion-safe:data-[state=open]:animate-in motion-safe:data-[state=open]:fade-in-0 motion-safe:data-[state=open]:duration-150"
          style={{ maxHeight: 'min(320px, var(--radix-select-content-available-height))', maxWidth: 'min(420px, calc(100vw - 24px))' }}>
          <Picker.ScrollUpButton className="flex h-6 items-center justify-center text-muted-foreground"><ChevronUp className="h-4 w-4" /></Picker.ScrollUpButton>
          <Picker.Viewport>{groups.map((group, index) => <Picker.Group key={`${group.label || 'plain'}:${index}`}>
            {group.label && <Picker.Label className="px-3 py-2 text-xs font-semibold text-muted-foreground">{group.label}</Picker.Label>}
            {group.options.map(option => <Picker.Item key={option.value} value={encode(option.value)} disabled={option.disabled} textValue={option.label}
              className="relative flex min-h-11 cursor-default select-none items-center rounded-lg py-2 pl-3 pr-9 leading-5 outline-none data-[highlighted]:bg-zinc-100 data-[state=checked]:font-medium data-[state=checked]:text-teal-700 data-[disabled]:opacity-45 dark:data-[highlighted]:bg-zinc-800 dark:data-[state=checked]:text-teal-300">
              <Picker.ItemText>{option.label}</Picker.ItemText><Picker.ItemIndicator className="absolute right-3"><Check className="h-4 w-4" /></Picker.ItemIndicator>
            </Picker.Item>)}
          </Picker.Group>)}</Picker.Viewport>
          <Picker.ScrollDownButton className="flex h-6 items-center justify-center text-muted-foreground"><ChevronDown className="h-4 w-4" /></Picker.ScrollDownButton>
        </Picker.Content>
      </Picker.Portal>
    </Picker.Root>
    {control}
  </>;
});
export default Select;
