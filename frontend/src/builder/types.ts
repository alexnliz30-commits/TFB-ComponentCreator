import type {
  BlockEvent, CallbackProp, StateVar, StyleRule, ValidationRule, VisibilityRule,
} from './actions';
import type { DataModel } from './data-model';
import type { Theme } from './theme';

export type { BlockEvent, CallbackProp, StateVar, StyleRule, ValidationRule, VisibilityRule };

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
  /** Reglas de validación, solo con sentido en los bloques de campo. */
  validations?: ValidationRule[];
  /**
   * Clases condicionales: la respuesta «cámbiale el aspecto» a una regla de
   * negocio, frente a la respuesta «que no exista» de `visibleIf`.
   */
  styleRules?: StyleRule[];
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  /**
   * Respuestas rápidas a una pregunta del asistente.
   *
   * Solo se ofrecen en el último mensaje: contestar a una pregunta de hace tres
   * turnos daría una respuesta fuera de contexto.
   */
  options?: string[];
  /**
   * Miniaturas (data URL) de las imágenes que acompañaban al turno.
   *
   * Se guardan solo para mostrarlas en el chat: al backend viajan una única vez,
   * con el turno en que se adjuntaron, y no se reenvían en el historial.
   */
  images?: string[];
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
  /**
   * Contrato de datos del componente: qué recibe de fuera.
   *
   * Separado de `stateVars` porque son cosas distintas: el estado es lo que
   * el componente recuerda mientras se usa; el modelo, lo que le entregan.
   */
  model: DataModel;
  /**
   * Props de función que el componente recibe de la aplicación anfitriona.
   *
   * Tercera pata del contrato, junto al estado y al modelo: lo que el componente
   * recuerda, lo que le dan y lo que devuelve. Una regla de negocio que depende
   * de la app —borrar, navegar, confirmar— sale por aquí y no se resuelve dentro.
   */
  callbacks: CallbackProp[];
  /** Framework destino del código mostrado y exportado. */
  framework: string;
  /**
   * `design` selecciona y arrastra; `interactive` ejecuta el componente. El
   * clic no puede significar las dos cosas a la vez, de ahí el conmutador.
   */
  canvasMode: CanvasMode;
  /** Nombre del componente al exportarlo como paquete. */
  componentName: string;
  /** CSS o SASS propio de este componente, además del tema y de Tailwind. */
  customStyles: string;
  stylesLanguage: StylesLanguage;
  /** Estilos globales de la librería a la que pertenece el componente. */
  theme: Theme;
  /**
   * Bloque recién creado cuyo editor de texto debe abrirse solo (doble clic en
   * el lienzo vacío). Lo consume `BlockRenderer` y lo limpia al abrirlo.
   */
  pendingEditId: string | null;
}

export type CanvasMode = 'design' | 'interactive';
export type StylesLanguage = 'css' | 'scss';

export type BuilderAction =
  /** `index` inserta en esa posición de la lista destino; sin él, al final. */
  | { type: 'ADD_BLOCK'; blockType: BlockType; parentId?: string; index?: number; autoEdit?: boolean }
  | { type: 'MOVE_BLOCK'; id: string; targetIndex: number; parentId?: string }
  /** Duplica el bloque (con su subárbol) justo después del original. */
  | { type: 'DUPLICATE_BLOCK'; id: string }
  /** Mueve el bloque una posición arriba (-1) o abajo (+1) dentro de su lista. */
  | { type: 'SHIFT_BLOCK'; id: string; delta: number }
  | { type: 'CLEAR_PENDING_EDIT' }
  /** Carga un árbol completo (componente de un proyecto), sustituyendo el lienzo. */
  | {
      type: 'LOAD_TREE';
      blocks: Record<string, BuilderBlock>;
      rootIds: string[];
      stateVars: StateVar[];
      /** Contrato de datos; ausente = el componente no recibe ninguno. */
      model?: DataModel;
      /** Props de función; ausente = el componente no avisa de nada. */
      callbacks?: CallbackProp[];
      /**
       * Destino del componente (clave del emisor). Ausente = se conserva el
       * actual, que es lo que quiere el árbol devuelto por la IA: el asistente
       * no elige tecnología, la elige quien diseña.
       */
      target?: string;
      componentName: string;
      /** Estilos propios del componente; ausente = se conservan los actuales. */
      customStyles?: string;
      stylesLanguage?: StylesLanguage;
    }
  | { type: 'UPDATE_PROPS'; id: string; props: Record<string, string> }
  /**
   * Igual que UPDATE_PROPS pero sin entrada de historial. Para gestos continuos
   * (redimensionar con el ratón): el primer movimiento va como UPDATE_PROPS y
   * ancla el punto de deshacer; el resto del arrastre va por aquí.
   */
  | { type: 'UPDATE_PROPS_TRANSIENT'; id: string; props: Record<string, string> }
  | {
      type: 'SET_FREE_POSITION';
      id: string;
      free: boolean;
      left?: number;
      top?: number;
      /**
       * Altura que tenía el contenedor justo antes de liberar el bloque.
       *
       * La mide quien despacha la acción, porque depende del contenido y no está
       * escrita en ninguna prop. Solo se usa si al bloque liberado no le quedan
       * hermanos en el flujo (ver el reductor).
       */
      containerHeight?: number;
    }
  /**
   * Reparte el hueco entre bloques libres hermanos.
   *
   * Las cajas llegan medidas desde el lienzo porque el tamaño de un bloque no
   * suele estar escrito en sus props: depende de su contenido. El `className`
   * lo pone el reductor, que es quien lo tiene al día.
   */
  | {
      type: 'DISTRIBUTE_BLOCKS';
      axis: 'x' | 'y';
      items: { id: string; box: { left: number; top: number; width: number; height: number } }[];
    }
  | { type: 'DELETE_BLOCK'; id: string }
  | { type: 'SELECT'; id: string | null }
  | { type: 'SET_TAB'; tab: CenterTab }
  | { type: 'SET_CODE'; code: string }
  | { type: 'SET_FRAMEWORK'; framework: string }
  | { type: 'SET_CANVAS_MODE'; mode: CanvasMode }
  | { type: 'SET_COMPONENT_NAME'; name: string }
  | { type: 'SET_CUSTOM_STYLES'; styles: string; language?: StylesLanguage }
  /** Cambia los estilos globales de la librería. */
  | { type: 'SET_THEME'; theme: Theme }
  | { type: 'SET_MODEL'; model: DataModel }
  | { type: 'SET_CALLBACKS'; callbacks: CallbackProp[] }
  | { type: 'ADD_CHAT_MESSAGE'; message: ChatMessage }
  | { type: 'SET_CHAT_LOADING'; loading: boolean }
  | { type: 'CLEAR_CANVAS' }
  | { type: 'UNDO' }
  | { type: 'REDO' }
  | {
    type: 'LOAD_TEMPLATE';
    blocks: Record<string, BuilderBlock>;
    rootIds: string[];
    /** Estado que la plantilla necesita; ausente vacía el que hubiera. */
    stateVars?: StateVar[];
  }
  | { type: 'ADD_STATE_VAR'; variable: StateVar }
  | { type: 'UPDATE_STATE_VAR'; name: string; patch: Partial<StateVar> }
  | { type: 'DELETE_STATE_VAR'; name: string }
  | { type: 'SET_BLOCK_EVENTS'; id: string; events: BlockEvent[] }
  | { type: 'SET_BLOCK_VISIBILITY'; id: string; rule: VisibilityRule | null }
  | { type: 'SET_BLOCK_VALIDATIONS'; id: string; validations: ValidationRule[] }
  | { type: 'SET_BLOCK_STYLE_RULES'; id: string; rules: StyleRule[] }
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
  validations?: ValidationRule[];
  styleRules?: StyleRule[];
}
