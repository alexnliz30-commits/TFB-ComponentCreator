import { useState, type ReactNode } from 'react';
import type { BuilderBlock } from './types';
import { getDefinition } from './defaults';
import { isContainer } from './schema';
import { useBuilderDispatch } from './useBuilderStore';
import { getUtility, setUtility, STYLE_SECTIONS, WIDTH_MATCHER, HEIGHT_MATCHER } from './style-utils';
import { alignBlock, ALIGN_EDGES, type DistributeInput } from './align';
import { LAYOUT_PRESETS, applyLayoutPreset, currentLayoutPreset, stepGap } from './container-layout';

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

/**
 * Anchos relativos al contenedor.
 *
 * Es la respuesta rápida a «que se amolde al ancho de la sección»: en vez de
 * arrastrar hasta acertar, se fija la proporción de una vez. Son fracciones de
 * Tailwind y no porcentajes arbitrarios porque el valor se lee en el código
 * exportado y no depende del ancho del monitor donde se diseñó.
 */
const WIDTHS: { value: string; label: string; title: string }[] = [
  { value: 'w-full', label: '100%', title: 'Ocupar todo el ancho del contenedor' },
  { value: 'w-1/2', label: '½', title: 'La mitad del contenedor' },
  { value: 'w-1/3', label: '⅓', title: 'Un tercio del contenedor' },
  { value: 'w-auto', label: 'auto', title: 'El ancho de su contenido' },
];

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
  const [palette, setPalette] = useState<'text' | 'bg' | 'align' | 'layout' | null>(null);
  const cls = block.props.className || '';
  const isFree = cls.split(/\s+/).includes('absolute');

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
      {WIDTHS.map(({ value, label, title }) => (
        <button
          key={value}
          className={btn(current(WIDTH_MATCHER) === value)}
          title={title}
          onClick={() => toggle(WIDTH_MATCHER, value)}
        >
          {label}
        </button>
      ))}
      <button
        className={btn(false)}
        title="Quitar el tamaño fijo (ancho y alto automáticos)"
        onClick={() => setCls(setUtility(setUtility(cls, '', WIDTH_MATCHER, ''), '', HEIGHT_MATCHER, ''))}
      >
        ⤢
      </button>
      <button
        className={btn(isFree)}
        title={isFree
          ? 'Devolver el bloque al flujo: volverá a colocarse tras el anterior'
          : 'Posición libre: sacar el bloque del flujo para arrastrarlo a cualquier punto de su contenedor'}
        onClick={() => dispatch({
          type: 'SET_FREE_POSITION',
          id: block.id,
          free: !isFree,
          left: 16,
          top: 16,
          // La altura del contenedor se mide AQUÍ: depende del contenido y no
          // está escrita en ninguna prop, así que el reductor no puede saberla.
          containerHeight: document
            .querySelector(`[data-block-id="${block.id}"]`)
            ?.parentElement?.closest('[data-block-id]')
            ?.getBoundingClientRect().height,
        })}
      >
        ✥
      </button>
      {sep}
      <div className="relative">
        <button className={btn(palette === 'align')} title="Alinear el bloque en su contenedor"
          onClick={() => setPalette(palette === 'align' ? null : 'align')}>⊹</button>
        {palette === 'align' && (
          <AlignMenu block={block} isFree={isFree} onDone={() => setPalette(null)} />
        )}
      </div>
      {isContainer(block.type) && (
        <div className="relative">
          <button className={btn(palette === 'layout')} title="Cómo se colocan los hijos de este contenedor"
            onClick={() => setPalette(palette === 'layout' ? null : 'layout')}>▦</button>
          {palette === 'layout' && <LayoutMenu block={block} />}
        </div>
      )}
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

/**
 * Alineación del bloque dentro de su contenedor, y reparto entre hermanos.
 *
 * Los seis destinos se ofrecen siempre, pero un bloque EN EL FLUJO no se puede
 * alinear verticalmente contra un contenedor que no tiene altura propia: en ese
 * caso los tres verticales se desactivan explicando por qué, en vez de escribir
 * una clase que no haría nada visible.
 */
function AlignMenu({ block, isFree, onDone }: { block: BuilderBlock; isFree: boolean; onDone: () => void }) {
  const dispatch = useBuilderDispatch();
  const cls = block.props.className || '';

  /**
   * Reparte el hueco entre los hermanos libres, midiéndolos en el lienzo.
   *
   * Las cajas se toman del DOM y no del modelo porque el tamaño de un bloque
   * casi nunca está escrito: depende de su contenido, y sin medirlo el reparto
   * dejaría huecos desiguales.
   */
  function distribute(axis: 'x' | 'y') {
    const self = document.querySelector(`[data-block-id="${block.id}"]`);
    const zone = self?.parentElement;
    if (!zone) return;

    const items: DistributeInput[] = [];
    for (const node of zone.children) {
      if (!(node instanceof HTMLElement)) continue;
      const id = node.dataset.blockId;
      if (!id) continue;
      items.push({
        id,
        className: '',
        box: { left: node.offsetLeft, top: node.offsetTop, width: node.offsetWidth, height: node.offsetHeight },
      });
    }
    onDone();
    dispatch({ type: 'DISTRIBUTE_BLOCKS', axis, items });
  }

  const cell = (enabled: boolean) =>
    `w-7 h-7 rounded flex items-center justify-center text-sm transition-colors ${
      enabled ? 'text-slate-200 hover:bg-blue-600 hover:text-white' : 'text-slate-600 cursor-not-allowed'
    }`;

  return (
    <div className="absolute top-full left-0 mt-1 bg-slate-800 border border-slate-700 rounded-md p-2 shadow-xl z-40 w-max">
      <p className="text-[9px] uppercase tracking-wide text-slate-500 mb-1.5">Alinear en el contenedor</p>
      <div className="flex gap-1">
        {ALIGN_EDGES.map(({ edge, axis, label, icon }) => {
          const enabled = isFree || axis === 'x';
          return (
            <button
              key={edge}
              disabled={!enabled}
              className={cell(enabled)}
              title={enabled
                ? label
                : `${label} — solo para bloques en posición libre: dentro del flujo el contenedor no tiene una altura contra la que alinear`}
              onClick={() => {
                dispatch({ type: 'UPDATE_PROPS', id: block.id, props: { className: alignBlock(cls, edge) } });
                onDone();
              }}
            >
              {icon}
            </button>
          );
        })}
      </div>

      <p className="text-[9px] uppercase tracking-wide text-slate-500 mt-2.5 mb-1.5">Repartir hermanos libres</p>
      <div className="flex gap-1">
        <button className={cell(true)} title="Repartir el hueco horizontalmente (hacen falta 3 o más bloques libres)"
          onClick={() => distribute('x')}>↔</button>
        <button className={cell(true)} title="Repartir el hueco verticalmente (hacen falta 3 o más bloques libres)"
          onClick={() => distribute('y')}>↕</button>
      </div>
    </div>
  );
}

/**
 * Disposición de los hijos de un contenedor, como rejilla de 3×3.
 *
 * Cada celda es «dónde quiero el grupo de hijos». La traducción a `justify-*` /
 * `items-*` —que cambia según la dirección— la hace `container-layout.ts`.
 */
function LayoutMenu({ block }: { block: BuilderBlock }) {
  const dispatch = useBuilderDispatch();
  const cls = block.props.className || '';
  const current = currentLayoutPreset(cls);
  const write = (next: string) =>
    dispatch({ type: 'UPDATE_PROPS', id: block.id, props: { className: next } });

  return (
    <div className="absolute top-full left-0 mt-1 bg-slate-800 border border-slate-700 rounded-md p-2 shadow-xl z-40 w-max">
      <p className="text-[9px] uppercase tracking-wide text-slate-500 mb-1.5">Dirección</p>
      <div className="flex gap-1 mb-2">
        {([['row', 'Fila', '→'], ['col', 'Columna', '↓']] as const).map(([axis, label, icon]) => (
          <button
            key={axis}
            title={`Colocar los hijos en ${label.toLowerCase()}`}
            className={`px-2 h-6 rounded text-[11px] flex items-center gap-1 transition-colors ${
              current.axis === axis ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-700'
            }`}
            onClick={() => write(applyLayoutPreset(cls, { ...current, axis }))}
          >
            {icon} {label}
          </button>
        ))}
      </div>

      <p className="text-[9px] uppercase tracking-wide text-slate-500 mb-1.5">Colocación</p>
      <div className="grid grid-cols-3 gap-1 w-max">
        {LAYOUT_PRESETS.map(({ h, v, label }) => {
          const active = !current.spread && current.h === h && current.v === v;
          return (
            <button
              key={`${h}-${v}`}
              title={label}
              className={`w-6 h-6 rounded border transition-colors ${
                active ? 'bg-blue-600 border-blue-400' : 'border-slate-600 hover:border-blue-400'
              }`}
              onClick={() => write(applyLayoutPreset(cls, { ...current, h, v, spread: false }))}
            >
              <span className={`block w-1.5 h-1.5 rounded-full ${active ? 'bg-white' : 'bg-slate-400'}`}
                style={{
                  marginLeft: h === 'start' ? 2 : h === 'center' ? 'auto' : 'auto',
                  marginRight: h === 'end' ? 2 : h === 'center' ? 'auto' : 'auto',
                  marginTop: v === 'start' ? 2 : v === 'center' ? 'auto' : 'auto',
                  marginBottom: v === 'end' ? 2 : v === 'center' ? 'auto' : 'auto',
                }}
              />
            </button>
          );
        })}
      </div>

      <div className="flex gap-1 mt-2">
        <button
          title="Repartir el sobrante entre los hijos, en lugar de agruparlos"
          className={`px-2 h-6 rounded text-[11px] transition-colors ${
            current.spread ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-700'
          }`}
          onClick={() => write(applyLayoutPreset(cls, { ...current, spread: !current.spread }))}
        >
          ⇹ Repartir
        </button>
        <button className="w-6 h-6 rounded text-[11px] text-slate-300 hover:bg-slate-700"
          title="Menos separación entre hijos" onClick={() => write(stepGap(cls, -1))}>−</button>
        <button className="w-6 h-6 rounded text-[11px] text-slate-300 hover:bg-slate-700"
          title="Más separación entre hijos" onClick={() => write(stepGap(cls, +1))}>+</button>
      </div>
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
