/** Controles compartidos por los paneles laterales del builder. */

import type { ReactNode } from 'react';

export const FIELD_CLS =
  'mt-1 block w-full bg-slate-700 border border-slate-600 rounded-md px-2.5 py-1.5 text-sm ' +
  'text-slate-200 placeholder-slate-500 focus:ring-1 focus:ring-blue-500 focus:border-blue-500';

export function Section({ title, open, onToggle, children, badge }: {
  title: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
  badge?: string;
}) {
  return (
    <div className="border border-slate-800 rounded-lg overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-3 py-2 bg-slate-800/60 hover:bg-slate-800 transition-colors"
      >
        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-300">
          {title}
          {badge && <span className="ml-1.5 text-[10px] font-normal text-blue-400">{badge}</span>}
        </span>
        <span className="text-slate-500 text-xs">{open ? '▾' : '▸'}</span>
      </button>
      {open && <div className="p-3 space-y-2.5">{children}</div>}
    </div>
  );
}

export function Field({ label, value, onChange, textarea, placeholder, invalid, onSubmit }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  textarea?: boolean;
  placeholder?: string;
  invalid?: boolean;
  /**
   * Confirmación con Intro, para los campos que van junto a un botón «Añadir».
   *
   * Escribir un nombre y pulsar Intro es el gesto que hace todo el mundo, y no
   * hacía nada: el texto se quedaba en el campo y había que ir al botón con el
   * ratón. Declarar tres campos y dos variables son cinco viajes de ida y vuelta
   * por algo que la tecla ya estaba pidiendo.
   */
  onSubmit?: () => void;
}) {
  const cls = `${FIELD_CLS} ${invalid ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : ''}`;
  return (
    <div>
      <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wide">{label}</span>
      {textarea ? (
        <textarea
          value={value} onChange={(e) => onChange(e.target.value)} rows={3} placeholder={placeholder}
          className={`${cls} resize-none text-xs font-mono`}
        />
      ) : (
        <input
          value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
          onKeyDown={onSubmit && ((e) => {
            if (e.key !== 'Enter') return;
            // El panel vive dentro del lienzo; sin esto, el Intro puede acabar
            // enviando un formulario ancestro y recargando la página.
            e.preventDefault();
            onSubmit();
          })}
          className={cls} aria-invalid={invalid || undefined}
        />
      )}
    </div>
  );
}

export function SelectField({ label, value, options, onChange, allowEmpty, emptyLabel }: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
  allowEmpty?: boolean;
  emptyLabel?: string;
}) {
  return (
    <div>
      <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wide">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className={FIELD_CLS}>
        {allowEmpty && <option value="">{emptyLabel ?? '— sin definir —'}</option>}
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}
