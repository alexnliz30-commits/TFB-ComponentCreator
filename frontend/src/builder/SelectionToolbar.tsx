import { useState, type ReactNode } from 'react';
import type { BuilderBlock } from './types';
import { getDefinition } from './defaults';
import { useBuilderDispatch } from './useBuilderStore';
import { getUtility, setUtility, STYLE_SECTIONS } from './style-utils';

/**
 * Barra de herramientas flotante del bloque seleccionado.
 *
 * Estilo a golpe de ratón sin abrir el panel de propiedades: escribe utilidades
 * Tailwind en el `className` del bloque con los MISMOS matchers que el panel,
 * de modo que ambos caminos se sustituyen mutuamente en vez de acumular clases
 * en conflicto. Las clases usadas aquí aparecen como literales en este fichero
 * a propósito: el JIT de Tailwind solo compila lo que ve escrito en el código.
 */

function matcher(section: string, group: string): RegExp {
  const m = STYLE_SECTIONS.find((s) => s.key === section)?.groups.find((g) => g.key === group)?.matcher;
  if (!m) throw new Error(`Grupo de estilo desconocido: ${section}/${group}`);
  return m;
}

const SIZE_M = matcher('typography', 'text-size');
const WEIGHT_M = matcher('typography', 'font-weight');
const ALIGN_M = matcher('typography', 'text-align');
const TCOLOR_M = matcher('typography', 'text-color');
const BG_M = matcher('background', 'bg');
const PAD_M = matcher('spacing', 'p');
const ROUND_M = matcher('border', 'rounded');
const SHADOW_M = matcher('border', 'shadow');
const ITALIC_M = /^italic$/;

const TEXT_SIZES = ['text-xs', 'text-sm', 'text-base', 'text-lg', 'text-xl', 'text-2xl', 'text-3xl', 'text-4xl', 'text-5xl'];
const PADDINGS = ['p-0', 'p-1', 'p-2', 'p-3', 'p-4', 'p-5', 'p-6', 'p-8', 'p-10', 'p-12'];
const ROUNDS = ['', 'rounded', 'rounded-lg', 'rounded-xl', 'rounded-2xl', 'rounded-full'];
const SHADOWS = ['', 'shadow-sm', 'shadow', 'shadow-md', 'shadow-lg', 'shadow-xl'];

const TEXT_COLORS = [
  'text-slate-900', 'text-slate-500', 'text-white', 'text-red-600', 'text-amber-500',
  'text-green-600', 'text-blue-600', 'text-violet-600',
];
const BG_COLORS = [
  'bg-white', 'bg-slate-100', 'bg-slate-900', 'bg-red-50', 'bg-amber-50',
  'bg-green-50', 'bg-blue-50', 'bg-blue-600', 'bg-green-600', 'bg-red-600',
];

interface Props {
  block: BuilderBlock;
}

export function SelectionToolbar({ block }: Props) {
  const dispatch = useBuilderDispatch();
  const [palette, setPalette] = useState<'text' | 'bg' | null>(null);
  const cls = block.props.className || '';

  const setCls = (next: string) => {
    if (next !== cls) dispatch({ type: 'UPDATE_PROPS', id: block.id, props: { className: next } });
  };
  const current = (m: RegExp) => getUtility(cls, '', m);
  const toggle = (m: RegExp, value: string) =>
    setCls(setUtility(cls, '', m, current(m) === value ? '' : value));
  /** Avanza por una escala; desde «sin clase» entra por `fallback`. */
  const step = (m: RegExp, scale: string[], delta: number, fallback: number) => {
    const idx = scale.indexOf(current(m));
    const next = idx === -1 ? fallback : Math.min(scale.length - 1, Math.max(0, idx + delta));
    setCls(setUtility(cls, '', m, scale[next]));
  };
  /** Cicla una escala cuyo primer elemento es «sin clase». */
  const cycle = (m: RegExp, scale: string[]) => {
    const idx = scale.indexOf(current(m));
    setCls(setUtility(cls, '', m, scale[(idx + 1) % scale.length]));
  };

  const btn = (active: boolean) =>
    `min-w-6 h-6 px-1 rounded flex items-center justify-center text-[11px] leading-none transition-colors
     ${active ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-700 hover:text-white'}`;
  const sep = <span className="w-px h-4 bg-slate-700 mx-0.5" />;

  return (
    <div
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      className="absolute -top-9 left-0 z-30 flex items-center gap-0.5 bg-slate-900 rounded-md shadow-xl px-1.5 py-1 whitespace-nowrap"
    >
      <span className="text-[9px] font-semibold uppercase tracking-wide text-slate-500 pr-1">
        {getDefinition(block.type).label}
      </span>
      {sep}
      <button className={btn(current(WEIGHT_M) === 'font-bold')} title="Negrita"
        onClick={() => toggle(WEIGHT_M, 'font-bold')}><b>B</b></button>
      <button className={btn(current(ITALIC_M) === 'italic')} title="Cursiva"
        onClick={() => toggle(ITALIC_M, 'italic')}><i>I</i></button>
      <button className={btn(false)} title="Texto más pequeño"
        onClick={() => step(SIZE_M, TEXT_SIZES, -1, 1)}>A−</button>
      <button className={btn(false)} title="Texto más grande"
        onClick={() => step(SIZE_M, TEXT_SIZES, +1, 3)}>A+</button>
      {sep}
      {([['text-left', '⯇'], ['text-center', '≡'], ['text-right', '⯈']] as const).map(([v, icon]) => (
        <button key={v} className={btn(current(ALIGN_M) === v)} onClick={() => toggle(ALIGN_M, v)}
          title={`Alinear ${v === 'text-left' ? 'izquierda' : v === 'text-center' ? 'centro' : 'derecha'}`}>
          {icon}
        </button>
      ))}
      {sep}
      <div className="relative">
        <button className={btn(palette === 'text')} title="Color de texto"
          onClick={() => setPalette(palette === 'text' ? null : 'text')}>
          <span className={`font-bold ${current(TCOLOR_M) || 'text-slate-300'}`}>A</span>
        </button>
        {palette === 'text' && (
          <Swatches
            values={TEXT_COLORS}
            active={current(TCOLOR_M)}
            render={(v) => <span className={`text-xs font-bold ${v}`}>A</span>}
            onPick={(v) => { toggle(TCOLOR_M, v); setPalette(null); }}
          />
        )}
      </div>
      <div className="relative">
        <button className={btn(palette === 'bg')} title="Color de fondo"
          onClick={() => setPalette(palette === 'bg' ? null : 'bg')}>
          <span className={`w-3.5 h-3.5 rounded-sm border border-slate-600 ${current(BG_M) || 'bg-transparent'}`} />
        </button>
        {palette === 'bg' && (
          <Swatches
            values={BG_COLORS}
            active={current(BG_M)}
            render={(v) => <span className={`w-4 h-4 rounded-sm border border-slate-300 ${v}`} />}
            onPick={(v) => { toggle(BG_M, v); setPalette(null); }}
          />
        )}
      </div>
      {sep}
      <button className={btn(false)} title="Menos padding" onClick={() => step(PAD_M, PADDINGS, -1, 0)}>▣−</button>
      <button className={btn(false)} title="Más padding" onClick={() => step(PAD_M, PADDINGS, +1, 2)}>▣+</button>
      <button className={btn(Boolean(current(ROUND_M)) && current(ROUND_M) !== 'rounded-none')}
        title="Redondeo (clic para ciclar)" onClick={() => cycle(ROUND_M, ROUNDS)}>◜◞</button>
      <button className={btn(Boolean(current(SHADOW_M)) && current(SHADOW_M) !== 'shadow-none')}
        title="Sombra (clic para ciclar)" onClick={() => cycle(SHADOW_M, SHADOWS)}>▚</button>
      {sep}
      <button className={btn(false)} title="Mover arriba"
        onClick={() => dispatch({ type: 'SHIFT_BLOCK', id: block.id, delta: -1 })}>↑</button>
      <button className={btn(false)} title="Mover abajo"
        onClick={() => dispatch({ type: 'SHIFT_BLOCK', id: block.id, delta: +1 })}>↓</button>
      <button className={btn(false)} title="Duplicar"
        onClick={() => dispatch({ type: 'DUPLICATE_BLOCK', id: block.id })}>⧉</button>
      <button
        className="min-w-6 h-6 px-1 rounded flex items-center justify-center text-[11px] text-red-400 hover:bg-red-500 hover:text-white transition-colors"
        title="Eliminar"
        onClick={() => dispatch({ type: 'DELETE_BLOCK', id: block.id })}
      >✕</button>
    </div>
  );
}

function Swatches({ values, active, render, onPick }: {
  values: string[];
  active: string;
  render: (value: string) => ReactNode;
  onPick: (value: string) => void;
}) {
  return (
    // flex y no grid: `grid-cols-5` no aparece como literal en ningún fuente,
    // así que el JIT de Tailwind no la compila y las celdas se solaparían.
    <div className="absolute top-full left-0 mt-1 flex gap-1 bg-slate-800 border border-slate-700 rounded-md p-1.5 shadow-xl z-40">
      {values.map((v) => (
        <button
          key={v}
          onClick={() => onPick(v)}
          title={v + (active === v ? ' (clic para quitar)' : '')}
          className={`w-6 h-6 rounded flex items-center justify-center bg-white/95 hover:ring-2 hover:ring-blue-400
            ${active === v ? 'ring-2 ring-blue-500' : ''}`}
        >
          {render(v)}
        </button>
      ))}
    </div>
  );
}
