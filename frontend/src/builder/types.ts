import type { BlockEvent, StateVar, VisibilityRule } from './actions';

export type { BlockEvent, StateVar, VisibilityRule };

export type BlockType = string;

export interface BuilderBlock {
  id: string;
  type: BlockType;
  props: Record<string, string>;
  children: string[];
  /**
   * Comportamiento del bloque. Opcionales a propósito: las plantillas de
   * `templates.ts` y los componentes ya guardados en librerías se cargan sin
   * estos campos y deben seguir funcionando.
   */
  events?: BlockEvent[];
  visibleIf?: VisibilityRule;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export type CenterTab = 'visual' | 'code' | 'preview';

export interface BuilderState {
  blocks: Record<string, BuilderBlock>;
  rootIds: string[];
  selectedId: string | null;
  centerTab: CenterTab;
  codeOverride: string | null;
  chatMessages: ChatMessage[];
  chatLoading: boolean;
  /** Estado local del componente que se está construyendo. */
  stateVars: StateVar[];
  /** Framework destino del código mostrado y exportado. */
  framework: string;
  /**
   * `design` selecciona y arrastra; `interactive` ejecuta el componente. El
   * clic no puede significar las dos cosas a la vez, de ahí el conmutador.
   */
  canvasMode: CanvasMode;
  /** Nombre del componente al exportarlo como paquete. */
  componentName: string;
  /** CSS o SASS propio, además de las utilidades Tailwind. */
  customStyles: string;
  stylesLanguage: StylesLanguage;
  /**
   * Bloque recién creado cuyo editor de texto debe abrirse solo (doble clic en
   * el lienzo vacío). Lo consume `BlockRenderer` y lo limpia al abrirlo.
   */
  pendingEditId: string | null;
}

export type CanvasMode = 'design' | 'interactive';
export type StylesLanguage = 'css' | 'scss';

export type BuilderAction =
  | { type: 'ADD_BLOCK'; blockType: BlockType; parentId?: string; autoEdit?: boolean }
  | { type: 'MOVE_BLOCK'; id: string; targetIndex: number; parentId?: string }
  /** Duplica el bloque (con su subárbol) justo después del original. */
  | { type: 'DUPLICATE_BLOCK'; id: string }
  /** Mueve el bloque una posición arriba (-1) o abajo (+1) dentro de su lista. */
  | { type: 'SHIFT_BLOCK'; id: string; delta: number }
  | { type: 'CLEAR_PENDING_EDIT' }
  /** Carga un árbol completo (componente de un proyecto), sustituyendo el lienzo. */
  | { type: 'LOAD_TREE'; blocks: Record<string, BuilderBlock>; rootIds: string[]; stateVars: StateVar[]; componentName: string }
  | { type: 'UPDATE_PROPS'; id: string; props: Record<string, string> }
  /**
   * Igual que UPDATE_PROPS pero sin entrada de historial. Para gestos continuos
   * (redimensionar con el ratón): el primer movimiento va como UPDATE_PROPS y
   * ancla el punto de deshacer; el resto del arrastre va por aquí.
   */
  | { type: 'UPDATE_PROPS_TRANSIENT'; id: string; props: Record<string, string> }
  | { type: 'DELETE_BLOCK'; id: string }
  | { type: 'SELECT'; id: string | null }
  | { type: 'SET_TAB'; tab: CenterTab }
  | { type: 'SET_CODE'; code: string }
  | { type: 'SET_FRAMEWORK'; framework: string }
  | { type: 'SET_CANVAS_MODE'; mode: CanvasMode }
  | { type: 'SET_COMPONENT_NAME'; name: string }
  | { type: 'SET_CUSTOM_STYLES'; styles: string; language?: StylesLanguage }
  | { type: 'ADD_CHAT_MESSAGE'; message: ChatMessage }
  | { type: 'SET_CHAT_LOADING'; loading: boolean }
  | { type: 'CLEAR_CANVAS' }
  | { type: 'UNDO' }
  | { type: 'REDO' }
  | { type: 'LOAD_TEMPLATE'; blocks: Record<string, BuilderBlock>; rootIds: string[] }
  | { type: 'ADD_STATE_VAR'; variable: StateVar }
  | { type: 'UPDATE_STATE_VAR'; name: string; patch: Partial<StateVar> }
  | { type: 'DELETE_STATE_VAR'; name: string }
  | { type: 'SET_BLOCK_EVENTS'; id: string; events: BlockEvent[] }
  | { type: 'SET_BLOCK_VISIBILITY'; id: string; rule: VisibilityRule | null }
  | { type: 'APPLY_BLOCK_PATCH'; id: string; patch: BlockPatch };

/**
 * Cambio estructurado sobre un bloque, tal y como lo devuelve la IA.
 *
 * Las claves ausentes se dejan como están; `visibleIf: null` elimina la condición.
 * El backend ya lo ha saneado, pero el reducer vuelve a ser conservador: aplica solo
 * lo que reconoce.
 */
export interface BlockPatch {
  props?: Record<string, string>;
  events?: BlockEvent[];
  visibleIf?: VisibilityRule | null;
}
