import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, ArrowRight, Check, CheckCircle2, ExternalLink, Loader2, Sparkles, Clock, AlertCircle } from '@/components/ui/icons';
import { BrainDatePicker } from '@/components/ui/BrainDatePicker';
import { cn } from '@/lib/utils';
import {
  WELCOME, THANKS, visibleSteps, visibleQuestions, validateStep, progressFor, encouragement, selectedServices, SERVICE_CATEGORIES
} from '@/lib/commercialRequestForm';

const DRAFT_KEY = 'brain:solicitud-comercial:borrador:v1';

const readDraft = () => {
  try {
    const saved = JSON.parse(sessionStorage.getItem(DRAFT_KEY) || 'null');
    return saved && typeof saved.answers === 'object' ? saved : null;
  } catch { return null; }
};
const writeDraft = value => { try { sessionStorage.setItem(DRAFT_KEY, JSON.stringify(value)); } catch { /* private mode */ } };
const clearDraft = () => { try { sessionStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ } };

const inputClass = 'w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-base text-zinc-900 outline-none transition-colors placeholder:text-zinc-400 focus:border-primary/60 focus:ring-2 focus:ring-primary/20 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-500';
const labelClass = 'mb-2 block text-sm font-semibold text-zinc-900 dark:text-zinc-50';

const Field = ({ question, error, children }) => (
  <div className="min-w-0" data-question={question.id}>
    <label className={labelClass} htmlFor={`q-${question.id}`}>
      {question.label}{question.required ? '' : <span className="ml-1 text-xs font-normal text-zinc-400">(opcional)</span>}
    </label>
    {children}
    {question.help && !error && <p className="mt-1.5 text-xs leading-5 text-zinc-500 dark:text-zinc-400">{question.help}</p>}
    {error && <p className="mt-1.5 flex items-center gap-1 text-xs font-medium text-destructive" role="alert"><AlertCircle className="h-3.5 w-3.5" /> {error}</p>}
  </div>
);

const OptionCard = ({ selected, onToggle, label, description, role, big = false, name }) => (
  <button
    type="button"
    role={role}
    aria-checked={selected}
    aria-label={label}
    name={name}
    onClick={onToggle}
    className={cn(
      'group flex min-h-12 w-full items-start gap-3 rounded-xl border px-4 py-3 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40',
      selected
        ? 'border-primary bg-primary/[0.07] shadow-sm dark:bg-primary/10'
        : 'border-zinc-200 bg-white hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:hover:border-zinc-600 dark:hover:bg-zinc-900',
      big && 'py-4'
    )}
  >
    <span className={cn('mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors', selected ? 'border-primary bg-primary text-white' : 'border-zinc-300 bg-white dark:border-zinc-600 dark:bg-zinc-900')}>
      {selected && <Check className="h-3 w-3" />}
    </span>
    <span className="min-w-0">
      <span className={cn('block text-sm font-semibold', selected ? 'text-zinc-950 dark:text-white' : 'text-zinc-800 dark:text-zinc-100')}>{label}</span>
      {description && <span className="mt-0.5 block text-xs leading-5 text-zinc-500 dark:text-zinc-400">{description}</span>}
    </span>
  </button>
);

const MoneyInput = ({ question, value, onChange }) => {
  const amount = value?.amount ?? '';
  const undefinedFlag = Boolean(value?.undefined);
  return (
    <div className="space-y-2">
      <div className="flex items-center rounded-xl border border-zinc-200 bg-white focus-within:border-primary/60 focus-within:ring-2 focus-within:ring-primary/20 dark:border-zinc-700 dark:bg-zinc-950">
        <span className="pl-4 text-sm font-semibold text-zinc-400">$</span>
        <input
          id={`q-${question.id}`}
          inputMode="numeric"
          disabled={undefinedFlag}
          value={amount}
          onChange={event => onChange({ amount: event.target.value.replace(/[^0-9.,]/g, ''), undefined: false })}
          placeholder="0"
          className="w-full bg-transparent px-2 py-3 text-base text-zinc-900 outline-none placeholder:text-zinc-400 disabled:opacity-50 dark:text-zinc-100"
        />
      </div>
      {question.allowUndefined && (
        <label className="inline-flex min-h-10 cursor-pointer items-center gap-2 text-sm text-zinc-700 dark:text-zinc-200">
          <input type="checkbox" className="h-4 w-4 accent-primary" checked={undefinedFlag} onChange={event => onChange({ amount: '', undefined: event.target.checked })} />
          {question.allowUndefined}
        </label>
      )}
    </div>
  );
};

const Question = ({ question, value, error, onChange }) => {
  switch (question.type) {
    case 'textarea':
      return (
        <Field question={question} error={error}>
          <textarea id={`q-${question.id}`} rows={question.rows || 4} value={value || ''} onChange={event => onChange(event.target.value)} placeholder={question.placeholder} className={cn(inputClass, 'resize-y')} />
        </Field>
      );
    case 'single':
      return (
        <Field question={question} error={error}>
          <div role="radiogroup" aria-labelledby={`q-${question.id}`} className={cn('grid gap-2', question.options.length > 3 ? 'sm:grid-cols-2' : '')}>
            {question.options.map(option => (
              <OptionCard key={option.value} role="radio" name={question.id} selected={value === option.value} label={option.label} description={option.description} onToggle={() => onChange(option.value)} />
            ))}
          </div>
        </Field>
      );
    case 'multi': {
      const current = Array.isArray(value) ? value : [];
      const toggle = optionValue => {
        const exclusive = question.exclusive || [];
        if (current.includes(optionValue)) return onChange(current.filter(item => item !== optionValue));
        if (exclusive.includes(optionValue)) return onChange([optionValue]);
        return onChange([...current.filter(item => !exclusive.includes(item)), optionValue]);
      };
      return (
        <Field question={question} error={error}>
          <div role="group" className={cn('grid gap-2', question.layout === 'cards' ? 'sm:grid-cols-2' : 'sm:grid-cols-2')}>
            {question.options.map(option => (
              <OptionCard key={option.value} role="checkbox" name={question.id} big={question.layout === 'cards'} selected={current.includes(option.value)} label={option.label} description={question.layout === 'cards' ? option.description : undefined} onToggle={() => toggle(option.value)} />
            ))}
          </div>
        </Field>
      );
    }
    case 'date':
      return (
        <Field question={question} error={error}>
          <BrainDatePicker id={`q-${question.id}`} value={value || ''} onChange={onChange} className="py-3 text-base" isClearable />
        </Field>
      );
    case 'money':
      return (
        <Field question={question} error={error}>
          <MoneyInput question={question} value={value} onChange={onChange} />
        </Field>
      );
    default:
      return (
        <Field question={question} error={error}>
          <input
            id={`q-${question.id}`}
            type={question.type === 'email' ? 'email' : question.type === 'phone' ? 'tel' : 'text'}
            inputMode={question.type === 'url' ? 'url' : undefined}
            autoComplete={question.autoComplete}
            value={value || ''}
            onChange={event => onChange(event.target.value)}
            placeholder={question.placeholder}
            className={inputClass}
          />
        </Field>
      );
  }
};

const ProgressBar = ({ ratio, stepLabel }) => {
  const percent = Math.round(ratio * 100);
  return (
    <div className="space-y-2" aria-live="polite">
      <div className="flex items-center justify-between text-xs font-semibold">
        <span className="text-zinc-600 dark:text-zinc-300">{stepLabel}</span>
        <span className="flex items-center gap-1.5 text-primary"><Sparkles className="h-3.5 w-3.5" /> {encouragement(ratio)} · {percent} %</span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-zinc-200/80 dark:bg-zinc-800" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
        <motion.div className="h-full rounded-full bg-brand-primary" initial={false} animate={{ width: `${Math.max(3, percent)}%` }} transition={{ type: 'spring', stiffness: 120, damping: 20 }} />
      </div>
    </div>
  );
};

const StepRail = ({ steps, current }) => (
  <ol className="hidden gap-1.5 lg:flex" aria-label="Pasos">
    {steps.map((step, index) => {
      const state = index < current ? 'done' : index === current ? 'current' : 'todo';
      return (
        <li key={step.id} title={step.title} className={cn('flex h-2 flex-1 rounded-full transition-colors', state === 'done' && 'bg-brand-green', state === 'current' && 'bg-primary', state === 'todo' && 'bg-zinc-200 dark:bg-zinc-800')} />
      );
    })}
  </ol>
);

const Welcome = ({ onStart, stepCount }) => (
  <div className="space-y-6">
    <span className="inline-flex items-center gap-2 rounded-full border border-brand-cyan/30 bg-brand-cyan/10 px-3 py-1 text-xs font-semibold text-brand-cyan-deep dark:text-brand-cyan">
      <Clock className="h-3.5 w-3.5" /> {stepCount} pasos · unos {WELCOME.estimatedMinutes} minutos
    </span>
    <h1 className="text-3xl font-bold leading-tight tracking-tight text-zinc-950 dark:text-white sm:text-4xl">{WELCOME.title}</h1>
    {WELCOME.paragraphs.map(paragraph => <p key={paragraph.slice(0, 24)} className="text-base leading-7 text-zinc-600 dark:text-zinc-300">{paragraph}</p>)}
    <a href={WELCOME.link.href} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-10 items-center gap-1.5 text-sm font-semibold text-primary hover:underline">
      {WELCOME.link.label} <ExternalLink className="h-3.5 w-3.5" />
    </a>
    <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-300">{WELCOME.closing}</p>
    <button type="button" onClick={onStart} className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-brand-primary px-6 text-base font-semibold text-white shadow-md shadow-brand-cyan/25 transition-transform hover:shadow-lg active:scale-95">
      Comenzar <ArrowRight className="h-4 w-4" />
    </button>
  </div>
);

const Thanks = ({ answers, result }) => {
  const services = selectedServices(answers).map(value => SERVICE_CATEGORIES.find(item => item.value === value)?.label).filter(Boolean);
  return (
    <div className="space-y-6 text-center" data-request-thanks>
      <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-brand-primary text-white shadow-md shadow-brand-cyan/25"><CheckCircle2 className="h-8 w-8" /></span>
      <h1 className="text-3xl font-bold tracking-tight text-zinc-950 dark:text-white">{THANKS.title}</h1>
      <p className="mx-auto max-w-xl text-base leading-7 text-zinc-600 dark:text-zinc-300">{THANKS.body}</p>
      {services.length > 0 && (
        <div className="flex flex-wrap justify-center gap-2">
          {services.map(label => <span key={label} className="rounded-full border border-brand-green/30 bg-brand-green/10 px-3 py-1 text-xs font-semibold text-brand-green-deep dark:text-brand-green">{label}</span>)}
        </div>
      )}
      {result?.reference && <p className="text-xs text-zinc-500">Referencia de tu solicitud: <span className="font-mono font-semibold text-zinc-700 dark:text-zinc-200">{result.reference}</span></p>}
      <div className="pt-2">
        <p className="text-sm font-bold text-zinc-900 dark:text-zinc-50">{THANKS.signature}</p>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">{THANKS.tagline}</p>
      </div>
    </div>
  );
};

/**
 * Public commercial request form. Everything it asks comes from src/lib/commercialRequestForm.js.
 * `onSubmit(answers)` must resolve with { reference } or throw with a readable message.
 */
export default function CommercialRequestForm({ onSubmit, initialAnswers = null }) {
  const draft = useRef(initialAnswers ? null : readDraft()).current;
  const [answers, setAnswers] = useState(() => initialAnswers || draft?.answers || {});
  const [screen, setScreen] = useState(() => (draft?.stepIndex >= 0 ? 'step' : 'welcome'));
  const [stepIndex, setStepIndex] = useState(() => draft?.stepIndex || 0);
  const [errors, setErrors] = useState({});
  const [direction, setDirection] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [result, setResult] = useState(null);
  const cardRef = useRef(null);

  const steps = useMemo(() => visibleSteps(answers), [answers]);
  const safeIndex = Math.min(stepIndex, steps.length - 1);
  const step = steps[safeIndex];
  const questions = useMemo(() => (step ? visibleQuestions(step, answers) : []), [step, answers]);
  const ratio = screen === 'thanks' ? 1 : screen === 'welcome' ? 0 : progressFor(answers, safeIndex);

  useEffect(() => {
    if (screen === 'step') writeDraft({ answers, stepIndex: safeIndex });
  }, [answers, safeIndex, screen]);

  const setAnswer = (id, value) => {
    setAnswers(current => ({ ...current, [id]: value }));
    setErrors(current => (current[id] ? { ...current, [id]: undefined } : current));
  };

  const scrollTop = () => cardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  const goNext = async () => {
    const stepErrors = validateStep(step, answers);
    if (Object.keys(stepErrors).length > 0) {
      setErrors(stepErrors);
      const first = Object.keys(stepErrors)[0];
      cardRef.current?.querySelector(`[data-question="${first}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    setErrors({});
    if (safeIndex < steps.length - 1) {
      setDirection(1);
      setStepIndex(safeIndex + 1);
      scrollTop();
      return;
    }
    setSubmitting(true);
    setSubmitError('');
    try {
      const response = await onSubmit(answers);
      setResult(response || null);
      clearDraft();
      setScreen('thanks');
      scrollTop();
    } catch (error) {
      setSubmitError(error?.message || 'No pudimos enviar tu solicitud. Inténtalo de nuevo en un momento.');
    } finally {
      setSubmitting(false);
    }
  };

  const goBack = () => {
    setErrors({});
    setDirection(-1);
    if (safeIndex === 0) { setScreen('welcome'); return; }
    setStepIndex(safeIndex - 1);
    scrollTop();
  };

  const variants = {
    enter: dir => ({ opacity: 0, x: dir * 24 }),
    center: { opacity: 1, x: 0 },
    exit: dir => ({ opacity: 0, x: dir * -24 })
  };

  return (
    <div ref={cardRef} className="brain-glass brain-glass-strong mx-auto w-full max-w-3xl scroll-mt-6 p-6 sm:p-10" data-commercial-request>
      {screen !== 'welcome' && (
        <div className="mb-8 space-y-3">
          <ProgressBar ratio={ratio} stepLabel={screen === 'thanks' ? 'Solicitud enviada' : `Paso ${safeIndex + 1} de ${steps.length}`} />
          <StepRail steps={steps} current={screen === 'thanks' ? steps.length : safeIndex} />
        </div>
      )}

      <AnimatePresence mode="wait" custom={direction} initial={false}>
        {screen === 'welcome' && (
          <motion.div key="welcome" custom={direction} variants={variants} initial="enter" animate="center" exit="exit" transition={{ duration: 0.25 }}>
            <Welcome onStart={() => { setDirection(1); setScreen('step'); setStepIndex(0); }} stepCount={steps.length} />
          </motion.div>
        )}
        {screen === 'thanks' && (
          <motion.div key="thanks" custom={direction} variants={variants} initial="enter" animate="center" exit="exit" transition={{ duration: 0.25 }}>
            <Thanks answers={answers} result={result} />
          </motion.div>
        )}
        {screen === 'step' && step && (
          <motion.form
            key={step.id}
            custom={direction}
            variants={variants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.25 }}
            className="space-y-8"
            onSubmit={event => { event.preventDefault(); goNext(); }}
            noValidate
          >
            <header className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-widest text-primary">{step.eyebrow}</p>
              <h2 className="text-2xl font-bold leading-tight tracking-tight text-zinc-950 dark:text-white sm:text-3xl">{step.title}</h2>
              {step.intro && <p className="text-sm leading-6 text-zinc-600 dark:text-zinc-300">{step.intro}</p>}
              {step.link && (
                <a href={step.link.href} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-10 items-center gap-1.5 text-sm font-semibold text-primary hover:underline">
                  {step.link.label} <ExternalLink className="h-3.5 w-3.5" />
                </a>
              )}
            </header>

            <div className="space-y-6">
              {questions.map(question => (
                <Question key={question.id} question={question} value={answers[question.id]} error={errors[question.id]} onChange={value => setAnswer(question.id, value)} />
              ))}
            </div>

            {submitError && (
              <div className="brain-alert-surface rounded-xl px-4 py-3 text-sm" role="alert"><span className="font-semibold">No se envió.</span> {submitError}</div>
            )}

            <footer className="flex flex-col-reverse gap-3 border-t border-zinc-200/80 pt-6 dark:border-zinc-800 sm:flex-row sm:items-center sm:justify-between">
              <button type="button" onClick={goBack} disabled={submitting} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-zinc-900 disabled:opacity-50 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-white">
                <ArrowLeft className="h-4 w-4" /> Atrás
              </button>
              <button type="submit" disabled={submitting} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-brand-primary px-6 text-base font-semibold text-white shadow-md shadow-brand-cyan/25 transition-transform hover:shadow-lg active:scale-95 disabled:opacity-60">
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {safeIndex === steps.length - 1 ? 'Enviar solicitud' : 'Continuar'}
                {!submitting && safeIndex < steps.length - 1 && <ArrowRight className="h-4 w-4" />}
              </button>
            </footer>
          </motion.form>
        )}
      </AnimatePresence>
    </div>
  );
}
