import { createContext, useContext, useReducer, type Dispatch } from 'react';
import type { BuilderState, BuilderAction, BlockType, BuilderBlock } from './types';
import { getDefinition } from './defaults';
import { DEFAULT_FRAMEWORK } from './emitters';
import { DEFAULT_THEME } from './theme';
import { cx } from './ui-node';
import { normalizePositionFrames } from './sanitize-tree';
import { EMPTY_MODEL } from './data-model';
import { isOutOfFlow } from './style-utils';
import { distributeFree } from './align';

let nextId = 1;
function genId(): string {
  return `block-${nextId++}`;
}

const initialState: BuilderState = {
  blocks: {},
  rootIds: [],
  selectedId: null,
  centerTab: 'visual',
  codeOverride: null,
  chatMessages: [],
  chatLoading: false,
  stateVars: [],
  framework: DEFAULT_FRAMEWORK,
  canvasMode: 'design',
  componentName: 'MiComponente',
  model: EMPTY_MODEL,
  callbacks: [],
  customStyles: '',
  stylesLanguage: 'css',
  theme: DEFAULT_THEME,
  pendingEditId: null,
};

function removeBlock(state: BuilderState, id: string): BuilderState {
  const block = state.blocks[id];
  if (!block) return state;

  let s = state;
  for (const childId of block.children) {
    s = removeBlock(s, childId);
  }

  const { [id]: _, ...rest } = s.blocks;
  const rootIds = s.rootIds.filter((r) => r !== id);
  const blocks = { ...rest };
  for (const b of Object.values(blocks)) {
    if (b.children.includes(id)) {
      blocks[b.id] = { ...b, children: b.children.filter((c) => c !== id) };
    }
  }

  return { ...s, blocks, rootIds, selectedId: s.selectedId === id ? null : s.selectedId };
}

/** Contenedor que alberga a `id`, o `undefined` si el bloque cuelga de la raíz. */
export function findParentId(blocks: Record<string, BuilderBlock>, id: string): string | undefined {
  return Object.values(blocks).find((b) => b.children.includes(id))?.id;
}

/** Inserta `id` en `list` en la posición pedida (al final si no se indica o está fuera de rango). */
function insertAt(list: string[], id: string, index?: number): string[] {
  const out = [...list];
  out.splice(index === undefined || index < 0 || index > out.length ? out.length : index, 0, id);
  return out;
}

/** `true` si `candidateId` está dentro del subárbol de `rootId` (o es él mismo). */
function isWithinSubtree(state: BuilderState, rootId: string, candidateId: string): boolean {
  if (rootId === candidateId) return true;
  const block = state.blocks[rootId];
  return block ? block.children.some((c) => isWithinSubtree(state, c, candidateId)) : false;
}

function coreReducer(state: BuilderState, action: BuilderAction): BuilderState {
  switch (action.type) {
    case 'ADD_BLOCK': {
      const id = genId();
      const def = getDefinition(action.blockType);
      const block = { id, type: action.blockType as BlockType, props: { ...def.defaultProps }, children: [] };
      const blocks = { ...state.blocks, [id]: block };
      const pendingEditId = action.autoEdit ? id : state.pendingEditId;
      if (action.parentId && state.blocks[action.parentId]) {
        const parent = state.blocks[action.parentId];
        blocks[action.parentId] = { ...parent, children: insertAt(parent.children, id, action.index) };
        return { ...state, blocks, selectedId: id, pendingEditId };
      }
      return { ...state, blocks, rootIds: insertAt(state.rootIds, id, action.index), selectedId: id, pendingEditId };
    }
    case 'DUPLICATE_BLOCK': {
      const src = state.blocks[action.id];
      if (!src) return state;
      const blocks = { ...state.blocks };
      const cloneTree = (bid: string): string => {
        const b = state.blocks[bid];
        const nid = genId();
        blocks[nid] = {
          ...b,
          id: nid,
          props: { ...b.props },
          children: b.children.map(cloneTree),
          events: b.events?.map((e) => ({ ...e, actions: [...e.actions] })),
          visibleIf: b.visibleIf ? { ...b.visibleIf } : undefined,
          styleRules: b.styleRules?.map((r) => ({ ...r, when: { ...r.when } })),
        };
        return nid;
      };
      const nid = cloneTree(action.id);
      const parentId = findParentId(state.blocks, action.id);
      const parent = parentId ? state.blocks[parentId] : undefined;
      if (parent) {
        const children = [...blocks[parent.id].children];
        children.splice(children.indexOf(action.id) + 1, 0, nid);
        blocks[parent.id] = { ...blocks[parent.id], children };
        return { ...state, blocks, selectedId: nid };
      }
      const rootIds = [...state.rootIds];
      rootIds.splice(rootIds.indexOf(action.id) + 1, 0, nid);
      return { ...state, blocks, rootIds, selectedId: nid };
    }
    case 'SHIFT_BLOCK': {
      const parentId = findParentId(state.blocks, action.id);
      const parent = parentId ? state.blocks[parentId] : undefined;
      const list = parent ? [...parent.children] : [...state.rootIds];
      const idx = list.indexOf(action.id);
      const to = idx + action.delta;
      if (idx === -1 || to < 0 || to >= list.length) return state;
      list.splice(idx, 1);
      list.splice(to, 0, action.id);
      if (parent) {
        return { ...state, blocks: { ...state.blocks, [parent.id]: { ...parent, children: list } } };
      }
      return { ...state, rootIds: list };
    }
    case 'CLEAR_PENDING_EDIT':
      return { ...state, pendingEditId: null };
    case 'LOAD_TREE': {
      const maxId = Object.keys(action.blocks).reduce((max, k) => {
        const n = parseInt(k.replace('block-', ''), 10);
        return isNaN(n) ? max : Math.max(max, n);
      }, nextId);
      nextId = maxId + 1;
      return {
        ...state,
        // Se normaliza al cargar, no solo al escribir: los componentes guardados
        // antes de esta regla —y los que llegan de la librería del backend—
        // pueden traer bloques absolutos cuyo contenedor no es marco de
        // referencia, y se pintarían en un sitio distinto al que exportan.
        blocks: normalizePositionFrames(action.blocks),
        rootIds: action.rootIds,
        stateVars: action.stateVars,
        componentName: action.componentName,
        model: action.model ?? EMPTY_MODEL,
        callbacks: action.callbacks ?? [],
        // El destino viaja con el componente: abrir uno de JavaScript tiene que
        // dejar el constructor emitiendo JavaScript, o el código que se ve no
        // sería el que se guardó.
        framework: action.target ?? state.framework,
        selectedId: null,
        codeOverride: null,
        pendingEditId: null,
        // La IA devuelve árbol pero no toca los estilos propios: solo se
        // sustituyen cuando quien carga los aporta (abrir otro componente).
        customStyles: action.customStyles ?? state.customStyles,
        stylesLanguage: action.stylesLanguage ?? state.stylesLanguage,
        // Un árbol recién cargado (el que acaba de generar la IA, o el
        // componente que se abre) se entrega listo para editar: en modo
        // interactivo el lienzo no deja seleccionar ni arrastrar nada.
        canvasMode: 'design',
      };
    }
    case 'MOVE_BLOCK': {
      const { id, targetIndex, parentId } = action;
      // Soltar un contenedor dentro de sí mismo o de un descendiente crearía un
      // ciclo y el renderizador recursivo colgaría el navegador.
      if (parentId && isWithinSubtree(state, id, parentId)) return state;
      const rootIds = state.rootIds.filter((r) => r !== id);
      const blocks = { ...state.blocks };
      for (const b of Object.values(blocks)) {
        if (b.children.includes(id)) {
          blocks[b.id] = { ...b, children: b.children.filter((c) => c !== id) };
        }
      }
      if (parentId && blocks[parentId]) {
        const parent = blocks[parentId];
        const children = [...parent.children];
        children.splice(targetIndex, 0, id);
        blocks[parentId] = { ...parent, children };
      } else {
        rootIds.splice(targetIndex, 0, id);
      }
      return { ...state, blocks, rootIds };
    }
    case 'UPDATE_PROPS':
    case 'UPDATE_PROPS_TRANSIENT': {
      const block = state.blocks[action.id];
      if (!block) return state;
      const blocks = {
        ...state.blocks,
        [action.id]: { ...block, props: { ...block.props, ...action.props } },
      };
      // El campo de clases en crudo del panel puede sacar un bloque del flujo
      // sin pasar por `SET_FREE_POSITION`, que es quien marca el contenedor como
      // marco de referencia. Si no se repone aquí, el bloque se mediría contra
      // un ancestro distinto en el lienzo y en el código exportado.
      return {
        ...state,
        blocks: 'className' in action.props ? normalizePositionFrames(blocks) : blocks,
      };
    }
    case 'DISTRIBUTE_BLOCKS': {
      const changes = distributeFree(
        action.items
          .filter((i) => state.blocks[i.id])
          .map((i) => ({ id: i.id, className: state.blocks[i.id].props.className || '', box: i.box })),
        action.axis,
      );
      // Menos de tres bloques libres, o ya solapados: no hay reparto posible y
      // devolver el estado tal cual evita ensuciar el historial de deshacer.
      if (Object.keys(changes).length === 0) return state;

      const blocks = { ...state.blocks };
      for (const [id, className] of Object.entries(changes)) {
        blocks[id] = { ...blocks[id], props: { ...blocks[id].props, className } };
      }
      return { ...state, blocks };
    }
    /**
     * Saca un bloque del flujo, o lo devuelve a él.
     *
     * Toca DOS bloques a propósito: el que se libera recibe `absolute` con sus
     * desplazamientos, y su contenedor recibe `relative`, que es contra quien se
     * resuelven. Sin lo segundo el bloque se posicionaría respecto al primer
     * ancestro posicionado que hubiera por encima —o respecto a la página— y
     * acabaría en un sitio distinto en el lienzo y en el código exportado.
     */
    case 'SET_FREE_POSITION': {
      const block = state.blocks[action.id];
      if (!block) return state;

      const cls = block.props.className || '';
      const withoutPosition = cls
        .split(/\s+/)
        .filter((c) => c && !/^(absolute|static)$/.test(c) && !/^(top|left|right|bottom)-\[/.test(c))
        .join(' ');

      const next = action.free
        ? cx(withoutPosition, 'absolute', `left-[${Math.round(action.left ?? 0)}px]`, `top-[${Math.round(action.top ?? 0)}px]`)
        : withoutPosition;

      const blocks = {
        ...state.blocks,
        [action.id]: { ...block, props: { ...block.props, className: next } },
      };

      // El contenedor pasa a ser el marco de referencia. La raíz ya lo es: su
      // envoltorio se emite con `relative` (ROOT_LAYOUT).
      const parentId = action.free ? findParentId(state.blocks, action.id) : null;
      if (parentId) {
        const parent = state.blocks[parentId];
        let parentCls = parent.props.className || '';
        if (!parentCls.split(/\s+/).includes('relative')) {
          parentCls = cx(parentCls, 'relative');
        }

        /*
          Si al liberar este bloque el contenedor se queda SIN hijos en el flujo,
          su altura pasa a depender de nada: colapsa a su relleno y los bloques
          que aloja se salen por abajo. No es un fallo del lienzo —el componente
          exportado hace exactamente lo mismo, comprobado— pero sí es un mal
          resultado al que lleva el propio botón de posición libre.

          Se le fija la altura que TENÍA, como `min-h` real y medida por quien
          despacha la acción. Es una clase más del componente, así que el export
          sigue coincidiendo con el lienzo: se conserva el diseño, no se disimula.
        */
        const quedanEnFlujo = parent.children.some(
          (childId) => childId !== action.id && !isOutOfFlow(blocks[childId]?.props.className || ''),
        );
        const yaTieneAlto = /(^|\s)(h-|min-h-)/.test(parentCls);
        if (action.free && !quedanEnFlujo && !yaTieneAlto && action.containerHeight) {
          parentCls = cx(parentCls, `min-h-[${Math.round(action.containerHeight)}px]`);
        }

        if (parentCls !== (parent.props.className || '')) {
          blocks[parentId] = { ...parent, props: { ...parent.props, className: parentCls } };
        }
      }

      return { ...state, blocks };
    }
    case 'DELETE_BLOCK':
      return removeBlock(state, action.id);
    case 'SELECT':
      return { ...state, selectedId: action.id };
    case 'SET_TAB':
      return { ...state, centerTab: action.tab };
    case 'SET_CODE':
      return { ...state, codeOverride: action.code };
    case 'SET_COMPONENT_NAME':
      return { ...state, componentName: action.name };
    case 'SET_MODEL':
      return { ...state, model: action.model };
    case 'SET_CALLBACKS': {
      // Al quitar una prop de función se limpian las acciones que la llamaban,
      // igual que al borrar una variable: una acción huérfana no se emite, pero
      // sigue apareciendo en el panel como si el botón hiciera algo.
      const vivos = new Set(action.callbacks.map((c) => c.name));
      const blocks: typeof state.blocks = {};
      for (const [id, block] of Object.entries(state.blocks)) {
        blocks[id] = {
          ...block,
          events: block.events
            ?.map((e) => ({
              ...e,
              actions: e.actions.filter((a) => a.kind !== 'call' || vivos.has(a.target)),
            }))
            .filter((e) => e.actions.length > 0),
        };
      }
      return { ...state, callbacks: action.callbacks, blocks };
    }
    case 'SET_CUSTOM_STYLES':
      return {
        ...state,
        customStyles: action.styles,
        stylesLanguage: action.language ?? state.stylesLanguage,
      };
    case 'SET_THEME':
      return { ...state, theme: action.theme };
    case 'SET_CANVAS_MODE':
      // Al probar el componente se deselecciona: el panel de propiedades no
      // aplica mientras se interactúa.
      return { ...state, canvasMode: action.mode, selectedId: action.mode === 'interactive' ? null : state.selectedId };
    case 'SET_FRAMEWORK':
      // El código editado a mano pertenece al framework anterior: se descarta
      // para no mostrar TSX bajo la etiqueta de otra tecnología.
      return { ...state, framework: action.framework, codeOverride: null };
    case 'ADD_STATE_VAR': {
      if (state.stateVars.some((v) => v.name === action.variable.name)) return state;
      return { ...state, stateVars: [...state.stateVars, action.variable] };
    }
    case 'UPDATE_STATE_VAR': {
      const renamed = action.patch.name;
      const stateVars = state.stateVars.map((v) =>
        v.name === action.name ? { ...v, ...action.patch } : v,
      );
      if (!renamed || renamed === action.name) return { ...state, stateVars };

      // Al renombrar hay que arrastrar las referencias, o las acciones y las
      // reglas de visibilidad quedarían apuntando a una variable inexistente.
      const blocks: typeof state.blocks = {};
      for (const [id, block] of Object.entries(state.blocks)) {
        blocks[id] = {
          ...block,
          props: block.props.bindTo === action.name
            ? { ...block.props, bindTo: renamed }
            : block.props,
          events: block.events?.map((e) => ({
            ...e,
            actions: e.actions.map((a) =>
              // `call` también tiene `target`, pero apunta a una prop de función
              // y no a una variable: renombrarla aquí la desviaría a un nombre
              // que en su espacio no significa nada.
              a.kind !== 'call' && 'target' in a && a.target === action.name
                ? { ...a, target: renamed }
                : a,
            ),
          })),
          // Solo las condiciones sobre estado. Las que miran un campo del modelo
          // no tienen nada que ver con esta variable, aunque se llamen igual.
          visibleIf: !block.visibleIf?.field && block.visibleIf?.var === action.name
            ? { ...block.visibleIf, var: renamed }
            : block.visibleIf,
          styleRules: block.styleRules?.map((r) =>
            !r.when.field && r.when.var === action.name
              ? { ...r, when: { ...r.when, var: renamed } }
              : r,
          ),
        };
      }
      return { ...state, stateVars, blocks };
    }
    case 'DELETE_STATE_VAR': {
      const stateVars = state.stateVars.filter((v) => v.name !== action.name);
      // Se limpian las referencias huérfanas en el mismo paso.
      const blocks: typeof state.blocks = {};
      for (const [id, block] of Object.entries(state.blocks)) {
        const { bindTo, ...restProps } = block.props;
        blocks[id] = {
          ...block,
          props: bindTo === action.name ? restProps : block.props,
          events: block.events
            ?.map((e) => ({
              ...e,
              actions: e.actions.filter(
                (a) => a.kind === 'call' || !('target' in a) || a.target !== action.name,
              ),
            }))
            .filter((e) => e.actions.length > 0),
          visibleIf: !block.visibleIf?.field && block.visibleIf?.var === action.name
            ? undefined
            : block.visibleIf,
          styleRules: block.styleRules?.filter((r) => r.when.field || r.when.var !== action.name),
        };
      }
      return { ...state, stateVars, blocks };
    }
    case 'SET_BLOCK_EVENTS': {
      const block = state.blocks[action.id];
      if (!block) return state;
      return { ...state, blocks: { ...state.blocks, [action.id]: { ...block, events: action.events } } };
    }
    case 'APPLY_BLOCK_PATCH': {
      const block = state.blocks[action.id];
      if (!block) return state;

      const { props, events, visibleIf, validations, styleRules } = action.patch;
      const patched = {
        ...block,
        props: props ? { ...block.props, ...props } : block.props,
        events: events ?? block.events,
        // `null` explícito quita la condición; `undefined` la deja como estaba.
        visibleIf: visibleIf === null ? undefined : visibleIf ?? block.visibleIf,
        validations: validations ?? block.validations,
        styleRules: styleRules ?? block.styleRules,
      };
      return { ...state, blocks: { ...state.blocks, [action.id]: patched } };
    }
    case 'SET_BLOCK_VALIDATIONS': {
      const block = state.blocks[action.id];
      if (!block) return state;
      return {
        ...state,
        blocks: {
          ...state.blocks,
          [action.id]: {
            ...block,
            validations: action.validations.length > 0 ? action.validations : undefined,
          },
        },
      };
    }
    case 'SET_BLOCK_VISIBILITY': {
      const block = state.blocks[action.id];
      if (!block) return state;
      return {
        ...state,
        blocks: { ...state.blocks, [action.id]: { ...block, visibleIf: action.rule ?? undefined } },
      };
    }
    case 'SET_BLOCK_STYLE_RULES': {
      const block = state.blocks[action.id];
      if (!block) return state;
      return {
        ...state,
        blocks: {
          ...state.blocks,
          [action.id]: { ...block, styleRules: action.rules.length > 0 ? action.rules : undefined },
        },
      };
    }
    case 'ADD_CHAT_MESSAGE':
      return { ...state, chatMessages: [...state.chatMessages, action.message] };
    case 'SET_CHAT_LOADING':
      return { ...state, chatLoading: action.loading };
    case 'CLEAR_CANVAS':
      return { ...state, blocks: {}, rootIds: [], selectedId: null, codeOverride: null, stateVars: [] };
    case 'LOAD_TEMPLATE': {
      const maxId = Object.keys(action.blocks).reduce((max, k) => {
        const n = parseInt(k.replace('block-', ''), 10);
        return isNaN(n) ? max : Math.max(max, n);
      }, nextId);
      nextId = maxId + 1;
      /*
        El árbol se CLONA antes de entrar al estado.

        `TEMPLATES` es una constante de módulo, y `normalizePositionFrames`
        devuelve el mismo objeto cuando no hay nada que normalizar —que es el
        caso de las cuatro plantillas—. Sin clonar, el lienzo quedaba trabajando
        sobre los propios bloques de la plantilla: bastaba una escritura en sitio
        en cualquier punto del editor para corromper la plantilla durante el
        resto de la sesión, y volver a cargarla daría el árbol ya tocado. Es un
        fallo que no se ve al probarlo una vez.
      */
      return {
        ...state,
        blocks: normalizePositionFrames(structuredClone(action.blocks)),
        rootIds: [...action.rootIds],
        /*
          El estado viene con la plantilla, y el anterior se descarta.

          Antes solo se reemplazaban los bloques: las variables del componente
          anterior sobrevivían a la carga, apuntando a campos que ya no existen,
          mientras que un `bindTo` de la plantilla nueva no encontraba la suya y
          dejaba el campo sin enlazar y el envío sin comprobar. Es el mismo
          criterio que ya aplicaba `CLEAR_CANVAS`, que también las vacía.
        */
        stateVars: action.stateVars ? structuredClone(action.stateVars) : [],
        selectedId: null,
        codeOverride: null,
      };
    }
    default:
      return state;
  }
}

const HISTORY_ACTIONS = new Set([
  'ADD_BLOCK', 'MOVE_BLOCK', 'UPDATE_PROPS', 'DELETE_BLOCK', 'CLEAR_CANVAS', 'LOAD_TEMPLATE',
  'DUPLICATE_BLOCK', 'SHIFT_BLOCK', 'LOAD_TREE', 'DISTRIBUTE_BLOCKS',
  'ADD_STATE_VAR', 'UPDATE_STATE_VAR', 'DELETE_STATE_VAR',
  'SET_BLOCK_EVENTS', 'SET_BLOCK_VISIBILITY', 'SET_BLOCK_VALIDATIONS', 'APPLY_BLOCK_PATCH',
  'SET_FREE_POSITION',
]);
const MAX_HISTORY = 50;

interface HistoryState {
  current: BuilderState;
  past: BuilderState[];
  future: BuilderState[];
}

function historyReducer(history: HistoryState, action: BuilderAction): HistoryState {
  if (action.type === 'UNDO') {
    if (history.past.length === 0) return history;
    const previous = history.past[history.past.length - 1];
    return {
      past: history.past.slice(0, -1),
      current: previous,
      future: [history.current, ...history.future],
    };
  }
  if (action.type === 'REDO') {
    if (history.future.length === 0) return history;
    const next = history.future[0];
    return {
      past: [...history.past, history.current],
      current: next,
      future: history.future.slice(1),
    };
  }

  const newState = coreReducer(history.current, action);
  if (newState === history.current) return history;

  if (HISTORY_ACTIONS.has(action.type)) {
    return {
      past: [...history.past.slice(-(MAX_HISTORY - 1)), history.current],
      current: newState,
      future: [],
    };
  }

  return { ...history, current: newState };
}

const initialHistory: HistoryState = { current: initialState, past: [], future: [] };

const BuilderCtx = createContext<BuilderState>(initialState);
const DispatchCtx = createContext<Dispatch<BuilderAction>>(() => {});
const HistoryInfoCtx = createContext<{ canUndo: boolean; canRedo: boolean }>({ canUndo: false, canRedo: false });

export function useBuilderState() {
  return useContext(BuilderCtx);
}

export function useBuilderDispatch() {
  return useContext(DispatchCtx);
}

export function useHistoryInfo() {
  return useContext(HistoryInfoCtx);
}

export function useBuilderReducer(): [BuilderState, Dispatch<BuilderAction>, { canUndo: boolean; canRedo: boolean }] {
  const [history, rawDispatch] = useReducer(historyReducer, initialHistory);
  return [history.current, rawDispatch, { canUndo: history.past.length > 0, canRedo: history.future.length > 0 }];
}

export { BuilderCtx, DispatchCtx, HistoryInfoCtx };
