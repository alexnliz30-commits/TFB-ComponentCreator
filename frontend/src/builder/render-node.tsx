/**
 * Renderiza la IR en el lienzo.
 *
 * Sustituye a la antigua reimplementación de cada bloque en `BlockRenderer`:
 * ahora lienzo y código exportado salen del mismo `schema.ts`, así que no
 * pueden volver a divergir.
 *
 * Dos modos:
 *   - **diseño**: los valores dinámicos se pintan con su `preview` (estado
 *     inicial). Los eventos no se disparan, porque el clic sirve para
 *     seleccionar el bloque.
 *   - **interactivo**: los valores se calculan con los cierres `live` contra el
 *     estado real y los eventos ejecutan sus acciones. Nunca se evalúan las
 *     cadenas de código destinadas al emisor.
 */

import {
  createContext, useContext, useEffect, useMemo, useReducer, useRef,
  type CSSProperties, type ReactNode,
} from 'react';
import type { StateVar } from './actions';
import { initialStateMap } from './actions';
import type { Attr, Runtime, UiNode } from './ui-node';
import { VOID_TAGS } from './ui-node';

export type CanvasMode = 'design' | 'interactive';

interface RenderCtx {
  mode: CanvasMode;
  runtime: Runtime;
  /** Renderiza los bloques hijos donde el esquema declara un `slot`. */
  renderSlot: () => ReactNode;
}

const RuntimeCtx = createContext<Runtime>({ get: () => undefined, set: () => {} });
export const useRuntime = () => useContext(RuntimeCtx);

export function RuntimeProvider({ runtime, children }: { runtime: Runtime; children: ReactNode }) {
  return <RuntimeCtx.Provider value={runtime}>{children}</RuntimeCtx.Provider>;
}

/**
 * Estado vivo del lienzo en modo interactivo.
 *
 * El valor real vive en una ref y no en `useState` a propósito: un manejador
 * puede ejecutar varias acciones seguidas sobre la misma variable, y con estado
 * de React las lecturas intermedias verían el valor viejo. La ref da lecturas
 * frescas y el `force` provoca el repintado.
 */
export function useCanvasRuntime(vars: StateVar[]): { runtime: Runtime; reset: () => void } {
  const stateRef = useRef<Record<string, unknown>>(initialStateMap(vars));
  const [, force] = useReducer((n: number) => n + 1, 0);

  // Firma de las variables: al declararlas, renombrarlas o cambiar su valor
  // inicial hay que rehacer el estado, o quedarían claves huérfanas.
  const signature = vars.map((v) => `${v.name}:${v.type}:${v.initial}`).join('|');
  useEffect(() => {
    stateRef.current = initialStateMap(vars);
    force();
    // `signature` resume exactamente los cambios que obligan a reiniciar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  const runtime = useMemo<Runtime>(() => ({
    get: (name) => stateRef.current[name],
    set: (name, value) => {
      stateRef.current = { ...stateRef.current, [name]: value };
      force();
    },
  }), []);

  const reset = useMemo(() => () => {
    stateRef.current = initialStateMap(vars);
    force();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  return { runtime, reset };
}

/** `"width: 50%; height: 2px"` -> objeto de estilo de React. */
function parseStyle(css: string): CSSProperties {
  const style: Record<string, string> = {};
  for (const decl of css.split(';')) {
    const idx = decl.indexOf(':');
    if (idx === -1) continue;
    const prop = decl.slice(0, idx).trim();
    const value = decl.slice(idx + 1).trim();
    if (!prop || !value) continue;
    // `background-color` -> `backgroundColor`
    const key = prop.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
    style[key] = value;
  }
  return style as CSSProperties;
}

/** Valor efectivo de un atributo según el modo. */
function attrValue(attr: Attr, ctx: RenderCtx): string {
  if (attr.kind === 'static') return attr.value;
  if (attr.kind === 'expr') {
    return ctx.mode === 'interactive' && attr.live ? attr.live(ctx.runtime) : attr.preview;
  }
  return '';
}

/** Atributos que React espera como booleanos y no como cadena. */
const BOOLEAN_ATTRS = new Set(['controls', 'disabled', 'checked', 'readOnly', 'autoPlay', 'loop', 'muted']);

/**
 * Tamaños arbitrarios (`w-[347px]`, los que escribe el redimensionado con el
 * ratón) resueltos a estilo inline. El CSS del lienzo se compila en build-time,
 * así que una clase arbitraria generada en runtime no tiene regla; en el
 * sandbox (Tailwind en runtime) y en el paquete (CLI de Tailwind) sí la tiene.
 * Sin esta traducción, el lienzo no reflejaría lo que exporta.
 */
const ARBITRARY_SIZE = /(?:^|\s)([wh])-\[(\d+(?:\.\d+)?)px\]/g;

function arbitrarySizeStyle(className: string): CSSProperties | null {
  let style: Record<string, string> | null = null;
  for (const m of className.matchAll(ARBITRARY_SIZE)) {
    style = { ...(style ?? {}), [m[1] === 'w' ? 'width' : 'height']: `${m[2]}px` };
  }
  return style as CSSProperties | null;
}

function toProps(node: Extract<UiNode, { kind: 'el' }>, ctx: RenderCtx): Record<string, unknown> {
  const props: Record<string, unknown> = {};

  for (const [name, attr] of Object.entries(node.attrs)) {
    if (attr.kind === 'event') {
      if (ctx.mode !== 'interactive' || !attr.run) continue;
      const run = attr.run;
      props[name] = (e: { preventDefault?: () => void; target?: { value?: unknown } }) => {
        e?.preventDefault?.();
        run(ctx.runtime, e?.target?.value);
      };
      continue;
    }

    const value = attrValue(attr, ctx);

    if (name === 'style') {
      props.style = parseStyle(value);
      continue;
    }
    if (BOOLEAN_ATTRS.has(name)) {
      props[name] = value === 'true' || value === '';
      continue;
    }
    // Un aria-* vacío no debe emitirse: `aria-current=""` es distinto de ausente.
    if (value === '' && name.startsWith('aria-')) continue;

    props[name] = value;
  }

  if (typeof props.className === 'string') {
    const sized = arbitrarySizeStyle(props.className);
    if (sized) props.style = { ...(props.style as CSSProperties | undefined), ...sized };
  }

  // En diseño los controles no deben aceptar escritura: el lienzo no es un
  // formulario, y React avisaría de inputs controlados sin onChange.
  if (ctx.mode === 'design') {
    if (node.tag === 'input' || node.tag === 'textarea' || node.tag === 'select') {
      if (props.value !== undefined && props.onChange === undefined) props.readOnly = true;
    }
  } else if (props.value !== undefined && props.onChange === undefined) {
    // Interactivo pero sin handler declarado: se deja no controlado.
    props.defaultValue = props.value;
    delete props.value;
  }

  return props;
}

export function renderNode(node: UiNode, ctx: RenderCtx, key?: number): ReactNode {
  switch (node.kind) {
    case 'text':
      return node.value || null;

    case 'expr':
      return ctx.mode === 'interactive' && node.live ? node.live(ctx.runtime) : node.preview;

    case 'slot':
      return ctx.renderSlot();

    case 'when': {
      const visible = ctx.mode === 'interactive' && node.live
        ? node.live(ctx.runtime)
        : node.previewVisible;
      if (!visible) return null;
      return node.children.map((c, i) => renderNode(c, ctx, i));
    }

    case 'el': {
      const props = toProps(node, ctx);
      const Tag = node.tag as keyof JSX.IntrinsicElements;

      if (VOID_TAGS.has(node.tag) || node.children.length === 0) {
        return <Tag key={key} {...props} />;
      }
      return (
        <Tag key={key} {...props}>
          {node.children.map((c, i) => renderNode(c, ctx, i))}
        </Tag>
      );
    }
  }
}

export type { RenderCtx };
