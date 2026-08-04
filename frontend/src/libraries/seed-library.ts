/**
 * «Atenea», librería de ejemplo completa.
 *
 * Existe para que el sistema se pueda enseñar y comprobar de un vistazo, sin
 * tener que construir a mano un catálogo cada vez. No es una demo decorativa:
 * cada componente ejercita a propósito una capacidad distinta del constructor
 * —validación, estado, eventos, visibilidad condicional, adaptabilidad, estilos
 * propios— de modo que si algo se rompe, se rompe aquí y se ve.
 *
 * Sobre todo, es la demostración de la CASCADA de estilos:
 *
 *   1. La librería define un **tema** (roles de color, tipografía, forma) que
 *      todos sus componentes consumen por rol. Cambiarlo repinta el kit entero.
 *   2. La librería define además una **hoja global** con lo que el tema no
 *      cubre.
 *   3. Cada componente puede traer su **hoja propia**, que va en una capa por
 *      debajo: el global manda.
 *   4. Un componente se desvía del global solo si lo declara con `!propio`.
 *      `TarjetaDePrecio` lo hace a propósito, para que ese camino esté recorrido
 *      por algo real y no solo descrito en un comentario.
 *
 * Los bloques se estilan por ROL (`bg-[var(--vz-primario)]`) y no con colores
 * literales: es lo que hace que el tema de la librería signifique algo.
 */

import type { BuilderBlock } from '../builder/types';
import type { StateVar } from '../builder/actions';
import type { Theme } from '../builder/theme';
import { DEFAULT_THEME } from '../builder/theme';

export interface SeedComponent {
  name: string;
  /** Qué capacidad del constructor ejercita, para el README y la interfaz. */
  demuestra: string;
  blocks: Record<string, BuilderBlock>;
  rootIds: string[];
  stateVars: StateVar[];
  /** Hoja propia del componente: va por debajo de la global de la librería. */
  customStyles?: string;
}

export interface SeedLibrary {
  name: string;
  description: string;
  theme: Theme;
  globalStyles: string;
  components: SeedComponent[];
}

/** Atajo para no repetir `children: []` ochenta veces. */
const b = (
  id: string,
  type: string,
  props: Record<string, string> = {},
  extra: Partial<BuilderBlock> = {},
): BuilderBlock => ({
  id,
  type: type as BuilderBlock['type'],
  props,
  children: [],
  ...extra,
});

/** Construye el mapa de bloques a partir de una lista. */
const map = (list: BuilderBlock[]): Record<string, BuilderBlock> =>
  Object.fromEntries(list.map((x) => [x.id, x]));

// ── El tema de la librería ───────────────────────────────────────────────────

/**
 * Identidad visual de Atenea: verde azulado sobre superficies muy claras.
 *
 * Se aparta del tema por defecto a propósito. Si la semilla usara los valores
 * de fábrica, «el tema de la librería se aplica» y «no se aplica ninguno» se
 * verían idénticos, y la comprobación no comprobaría nada.
 */
export const SEED_THEME: Theme = {
  ...DEFAULT_THEME,
  colors: {
    primario: '#0f766e',
    primarioContraste: '#ffffff',
    superficie: '#ffffff',
    superficieAlt: '#f0fdfa',
    texto: '#134e4a',
    textoSuave: '#5f8a86',
    borde: '#ccfbf1',
    exito: '#15803d',
    aviso: '#b45309',
    error: '#b91c1c',
  },
  typography: {
    ...DEFAULT_THEME.typography,
    familia: '"Avenir Next", "Century Gothic", system-ui, sans-serif',
    tamanoBase: 15,
    pesoTitulo: '600',
  },
  shape: {
    ...DEFAULT_THEME.shape,
    radio: '0.75rem',
    grosorBorde: '1px',
    sombra: '0 1px 2px 0 rgb(19 78 74 / 0.08)',
  },
};

/**
 * Hoja global de la librería: lo que el tema por roles no alcanza a expresar.
 *
 * Va en la capa `vz-global`, así que **manda sobre la hoja propia de cada
 * componente**. Es deliberadamente el sitio donde se fijan los rasgos que hacen
 * que el kit se reconozca como uno: el ritmo tipográfico y el anillo de foco.
 */
export const SEED_GLOBAL_CSS = `/* Atenea — rasgos comunes a todo el kit. */
.visualiza-component, body {
  letter-spacing: 0.006em;
}

/* Un único anillo de foco para toda la librería: la accesibilidad no puede
   depender de que cada componente se acuerde de definirlo. */
.visualiza-component :focus-visible,
body :focus-visible {
  outline: 2px solid var(--vz-primario);
  outline-offset: 2px;
  border-radius: var(--vz-radio);
}

/* Los títulos del kit van algo más apretados que el texto corrido. */
.visualiza-component h1, .visualiza-component h2, .visualiza-component h3,
body h1, body h2, body h3 {
  letter-spacing: -0.015em;
}
`;

// ── 1. Formulario de alta ────────────────────────────────────────────────────

/**
 * Ejercita la VALIDACIÓN: cinco reglas de cuatro tipos distintos, el envío que
 * no se ejecuta hasta que todas pasan, y el estado de éxito por visibilidad
 * condicional.
 */
const formularioAlta: SeedComponent = {
  name: 'FormularioDeAlta',
  demuestra: 'Validación de campos, envío condicionado y estado de éxito',
  stateVars: [
    { name: 'enviado', type: 'boolean', initial: 'false' },
    { name: 'correo', type: 'string', initial: '' },
  ],
  rootIds: ['fa-form', 'fa-ok'],
  blocks: map([
    b('fa-form', 'form', { className: 'space-y-4 max-w-md w-full' }, {
      children: ['fa-h', 'fa-nombre', 'fa-correo', 'fa-clave', 'fa-tel', 'fa-cond', 'fa-enviar'],
      events: [{ event: 'submit', actions: [{ kind: 'set', target: 'enviado', value: 'true' }] }],
      visibleIf: { var: 'enviado', op: 'is', value: 'false' },
    }),
    b('fa-h', 'h2', { text: 'Crear cuenta', className: 'text-xl' }),
    b('fa-nombre', 'input', {
      label: 'Nombre completo', placeholder: 'Ada Lovelace', inputType: 'text',
      className: 'w-full border border-[color:var(--vz-borde)] rounded-[var(--vz-radio)] px-3 py-2 text-sm',
    }, {
      validations: [
        { kind: 'required' },
        { kind: 'minLength', value: '3', message: 'Escribe al menos 3 caracteres' },
      ],
    }),
    b('fa-correo', 'input', {
      label: 'Correo electrónico', placeholder: 'ada@ejemplo.com', inputType: 'email', bindTo: 'correo',
      className: 'w-full border border-[color:var(--vz-borde)] rounded-[var(--vz-radio)] px-3 py-2 text-sm',
    }, {
      validations: [{ kind: 'required' }, { kind: 'email' }],
    }),
    b('fa-clave', 'input', {
      label: 'Contraseña', placeholder: '········', inputType: 'password',
      className: 'w-full border border-[color:var(--vz-borde)] rounded-[var(--vz-radio)] px-3 py-2 text-sm',
    }, {
      validations: [
        { kind: 'required' },
        { kind: 'minLength', value: '8', message: 'Mínimo 8 caracteres' },
      ],
    }),
    b('fa-tel', 'input', {
      label: 'Teléfono', placeholder: '600 000 000', inputType: 'text',
      className: 'w-full border border-[color:var(--vz-borde)] rounded-[var(--vz-radio)] px-3 py-2 text-sm',
    }, {
      validations: [
        { kind: 'pattern', value: '^[0-9 ]{9,12}$', message: 'Nueve dígitos, sin prefijo' },
      ],
    }),
    b('fa-cond', 'checkbox', { label: 'Acepto las condiciones del servicio', className: 'text-sm' }, {
      validations: [{ kind: 'required', message: 'Hay que aceptar las condiciones' }],
    }),
    b('fa-enviar', 'button', {
      text: 'Crear cuenta', buttonType: 'submit',
      className: 'w-full bg-[var(--vz-primario)] text-[color:var(--vz-primario-contraste)] rounded-[var(--vz-radio)] px-4 py-2 text-sm font-semibold hover:opacity-90 transition-opacity',
    }),
    b('fa-ok', 'result', {
      title: '¡Cuenta creada!',
      text: 'Te hemos enviado un correo de confirmación.',
      variant: 'success', className: 'max-w-md w-full',
    }, {
      visibleIf: { var: 'enviado', op: 'is', value: 'true' },
    }),
  ]),
  customStyles: `/* Hoja PROPIA del formulario. Va por debajo de la global de la
   librería: si intentara cambiar el interlineado del kit, perdería. */
.visualiza-component form {
  container-type: inline-size;
}
`,
};

// ── 2. Tarjeta de precio ─────────────────────────────────────────────────────

/**
 * Ejercita el DESVÍO EXPLÍCITO del estilo global.
 *
 * Es el único componente del kit que se sale de la hoja global, y lo hace
 * declarándolo con `!propio`. Sin un caso real que recorra ese camino, la puerta
 * de salida sería una promesa sin comprobar.
 */
const tarjetaPrecio: SeedComponent = {
  name: 'TarjetaDePrecio',
  demuestra: 'Desvío declarado del estilo global con !propio',
  stateVars: [{ name: 'anual', type: 'boolean', initial: 'false' }],
  rootIds: ['tp-card'],
  blocks: map([
    b('tp-card', 'card', {
      className: 'relative p-6 w-full max-w-sm bg-[var(--vz-superficie)] border border-[color:var(--vz-borde)] rounded-[var(--vz-radio)] shadow-[var(--vz-sombra)] destacado',
    }, {
      children: ['tp-badge', 'tp-plan', 'tp-precio', 'tp-periodo', 'tp-switch', 'tp-lista', 'tp-cta'],
    }),
    // Anclado a un borde, no en píxeles: así se adapta a cualquier ancho sin
    // necesidad de plegarse.
    b('tp-badge', 'badge', { text: 'Recomendado', variant: 'green', className: 'absolute top-4 right-4' }),
    b('tp-plan', 'h3', { text: 'Plan Estudio', className: 'text-lg' }),
    b('tp-precio', 'p', { text: '29 €', className: 'text-4xl font-bold text-[color:var(--vz-primario)] mt-2 precio' }),
    b('tp-periodo', 'p', { text: 'por usuario y mes', className: 'text-sm text-[color:var(--vz-texto-suave)]' }),
    b('tp-switch', 'switch', { label: 'Facturación anual (–20 %)', checked: 'false', className: 'mt-4 text-sm' }, {
      events: [{ event: 'change', actions: [{ kind: 'toggle', target: 'anual' }] }],
    }),
    b('tp-lista', 'ul', {
      items: 'Componentes ilimitados,Exportación a React y Vue,Tema compartido,Soporte por correo',
      className: 'mt-4 space-y-1 text-sm list-disc list-inside text-[color:var(--vz-texto-suave)]',
    }),
    b('tp-cta', 'button', {
      text: 'Elegir plan',
      className: 'mt-6 w-full bg-[var(--vz-primario)] text-[color:var(--vz-primario-contraste)] rounded-[var(--vz-radio)] px-4 py-2 text-sm font-semibold hover:opacity-90 transition-opacity',
    }),
  ]),
  customStyles: `/* Hoja PROPIA con un DESVÍO DECLARADO.

   La hoja global del kit aprieta los títulos y da un interlineado común. Esta
   tarjeta es la pieza destacada del catálogo y quiere respirar más, así que se
   sale a propósito — y para poder salirse tiene que decirlo con \`!propio\`.
   Sin la marca, la regla se escribiría igual y no haría nada: el global manda.

   Compáralas: la primera pierde, la segunda gana. */
.destacado .precio {
  letter-spacing: 0.006em;              /* pierde: es lo que ya dice el global */
}

.destacado {
  letter-spacing: 0.04em !propio;       /* gana: desvío declarado */
}

.destacado .precio {
  font-variant-numeric: tabular-nums;   /* el global no lo disputa: se aplica */
}
`,
};

// ── 3. Tabla de pedidos ──────────────────────────────────────────────────────

/**
 * Ejercita la ADAPTABILIDAD: ocho columnas no caben en un móvil, y una celda no
 * encoge por debajo de su contenido. Sin el contenedor desplazable que emite el
 * bloque, lo que desbordaría es la página entera.
 */
const tablaPedidos: SeedComponent = {
  name: 'TablaDePedidos',
  demuestra: 'Tabla ancha que se desplaza en vez de desbordar la página',
  stateVars: [{ name: 'busqueda', type: 'string', initial: '' }],
  rootIds: ['tb-wrap'],
  blocks: map([
    b('tb-wrap', 'card', { className: 'w-full p-5 space-y-4' }, {
      children: ['tb-cabecera', 'tb-tabla', 'tb-vacio'],
    }),
    b('tb-cabecera', 'flex', { direction: 'row', gap: '3', className: 'items-center justify-between' }, {
      children: ['tb-titulo', 'tb-buscar'],
    }),
    b('tb-titulo', 'h3', { text: 'Pedidos recientes', className: 'text-lg' }),
    b('tb-buscar', 'search', { placeholder: 'Buscar pedido…', bindTo: 'busqueda', className: 'w-56 max-w-full' }),
    b('tb-tabla', 'table', { rows: '5', cols: '8', className: 'w-full border-collapse text-sm' }),
    b('tb-vacio', 'empty', {
      title: 'Sin resultados',
      text: 'Ningún pedido coincide con la búsqueda.',
      className: 'py-8',
    }, {
      // Solo aparece cuando se ha escrito algo: enseña la visibilidad
      // condicional atada a un campo de texto.
      visibleIf: { var: 'busqueda', op: 'not', value: '' },
    }),
  ]),
};

// ── 4. Panel de indicadores ──────────────────────────────────────────────────

/**
 * Ejercita el PLEGADO de la rejilla: cuatro columnas en escritorio, dos en
 * tablet y una en móvil, sin que nadie lo pida.
 */
const panelIndicadores: SeedComponent = {
  name: 'PanelDeIndicadores',
  demuestra: 'Rejilla que se pliega sola de 4 a 2 a 1 columna',
  stateVars: [],
  rootIds: ['pi-wrap'],
  blocks: map([
    b('pi-wrap', 'section', { className: 'w-full space-y-4' }, {
      children: ['pi-h', 'pi-grid', 'pi-progreso'],
    }),
    b('pi-h', 'h2', { text: 'Resumen del mes', className: 'text-xl' }),
    b('pi-grid', 'grid', { cols: '4', gap: '4' }, {
      children: ['pi-s1', 'pi-s2', 'pi-s3', 'pi-s4'],
    }),
    b('pi-s1', 'stat', { label: 'Componentes', value: '128', change: '+12' }),
    b('pi-s2', 'stat', { label: 'Librerías', value: '9', change: '+2' }),
    b('pi-s3', 'stat', { label: 'Exportaciones', value: '1.204', change: '+18,5 %' }),
    b('pi-s4', 'stat', { label: 'Tiempo medio', value: '3,4 min', change: '−22 %' }),
    b('pi-progreso', 'progress', { value: '72', label: 'Cobertura del catálogo', className: 'mt-2' }),
  ]),
};

// ── 5. Barra de navegación ───────────────────────────────────────────────────

/**
 * Ejercita ESTADO + EVENTOS + VISIBILIDAD juntos: el menú de móvil se abre y se
 * cierra de verdad, no es una maqueta.
 */
const barraNavegacion: SeedComponent = {
  name: 'BarraDeNavegacion',
  demuestra: 'Estado, eventos y visibilidad condicional (menú móvil real)',
  stateVars: [{ name: 'menuAbierto', type: 'boolean', initial: 'false' }],
  rootIds: ['bn-wrap'],
  blocks: map([
    b('bn-wrap', 'header', { className: 'w-full' }, { children: ['bn-nav', 'bn-menu'] }),
    b('bn-nav', 'navbar', {
      brand: 'Atenea',
      items: 'Catálogo,Componentes,Temas,Documentación',
      className: 'px-4 py-3 bg-[var(--vz-superficie)] border-b border-[color:var(--vz-borde)]',
    }, { children: ['bn-toggle'] }),
    b('bn-toggle', 'icon-button', { icon: '☰', label: 'Abrir el menú', className: 'md:hidden' }, {
      events: [{ event: 'click', actions: [{ kind: 'toggle', target: 'menuAbierto' }] }],
    }),
    b('bn-menu', 'menu', {
      items: 'Catálogo,Componentes,Temas,—,Documentación',
      className: 'w-full md:hidden border border-[color:var(--vz-borde)] rounded-[var(--vz-radio)] mt-1',
    }, {
      visibleIf: { var: 'menuAbierto', op: 'is', value: 'true' },
    }),
  ]),
};

// ── 6. Diálogo de confirmación ───────────────────────────────────────────────

/**
 * Ejercita el OVERLAY: un `fixed` que a propósito NO se pliega en móvil, porque
 * es lo que sostiene el diálogo y su fondo.
 */
const dialogoConfirmacion: SeedComponent = {
  name: 'DialogoDeConfirmacion',
  demuestra: 'Overlay fijo, acciones y cierre real',
  stateVars: [
    { name: 'abierto', type: 'boolean', initial: 'true' },
    { name: 'confirmado', type: 'boolean', initial: 'false' },
  ],
  rootIds: ['dc-lanzar', 'dc-fondo', 'dc-hecho'],
  blocks: map([
    b('dc-lanzar', 'button', {
      text: 'Eliminar la librería',
      className: 'bg-[var(--vz-error)] text-white rounded-[var(--vz-radio)] px-4 py-2 text-sm font-semibold',
    }, {
      events: [{ event: 'click', actions: [{ kind: 'set', target: 'abierto', value: 'true' }] }],
      visibleIf: { var: 'abierto', op: 'is', value: 'false' },
    }),
    b('dc-fondo', 'div', {
      className: 'fixed inset-0 bg-black/40 flex items-center justify-center p-4',
    }, {
      children: ['dc-modal'],
      visibleIf: { var: 'abierto', op: 'is', value: 'true' },
    }),
    b('dc-modal', 'card', {
      className: 'w-full max-w-sm p-6 bg-[var(--vz-superficie)] rounded-[var(--vz-radio)] shadow-xl space-y-3',
    }, { children: ['dc-t', 'dc-p', 'dc-acciones'] }),
    b('dc-t', 'h3', { text: '¿Eliminar la librería?', className: 'text-lg' }),
    b('dc-p', 'p', {
      text: 'Se borrarán también todos sus componentes. Esta acción no se puede deshacer.',
      className: 'text-sm text-[color:var(--vz-texto-suave)]',
    }),
    b('dc-acciones', 'flex', { direction: 'row', gap: '2', className: 'justify-end pt-2' }, {
      children: ['dc-cancelar', 'dc-borrar'],
    }),
    b('dc-cancelar', 'button', {
      text: 'Cancelar',
      className: 'border border-[color:var(--vz-borde)] rounded-[var(--vz-radio)] px-4 py-2 text-sm',
    }, {
      events: [{ event: 'click', actions: [{ kind: 'set', target: 'abierto', value: 'false' }] }],
    }),
    b('dc-borrar', 'button', {
      text: 'Sí, eliminar',
      className: 'bg-[var(--vz-error)] text-white rounded-[var(--vz-radio)] px-4 py-2 text-sm font-semibold',
    }, {
      events: [{
        event: 'click',
        actions: [
          { kind: 'set', target: 'abierto', value: 'false' },
          { kind: 'set', target: 'confirmado', value: 'true' },
        ],
      }],
    }),
    b('dc-hecho', 'alert', {
      text: 'La librería se ha eliminado.', variant: 'success', className: 'mt-3',
    }, {
      visibleIf: { var: 'confirmado', op: 'is', value: 'true' },
    }),
  ]),
};

// ── 7. Selector de cantidad ──────────────────────────────────────────────────

/**
 * Ejercita la ARITMÉTICA de estado: `increment` en los dos sentidos, con el
 * total recalculándose solo.
 */
const selectorCantidad: SeedComponent = {
  name: 'SelectorDeCantidad',
  demuestra: 'Estado numérico con incremento en ambos sentidos',
  stateVars: [{ name: 'cantidad', type: 'number', initial: '1' }],
  rootIds: ['sc-wrap'],
  blocks: map([
    b('sc-wrap', 'card', { className: 'p-5 w-full max-w-xs space-y-3' }, {
      children: ['sc-t', 'sc-fila', 'sc-aviso'],
    }),
    b('sc-t', 'h3', { text: 'Licencias', className: 'text-base' }),
    b('sc-fila', 'flex', { direction: 'row', gap: '3', className: 'items-center' }, {
      children: ['sc-menos', 'sc-valor', 'sc-mas'],
    }),
    b('sc-menos', 'icon-button', { icon: '−', label: 'Quitar una licencia' }, {
      events: [{ event: 'click', actions: [{ kind: 'increment', target: 'cantidad', by: '-1' }] }],
    }),
    b('sc-valor', 'span', {
      bindTo: 'cantidad',
      className: 'text-2xl font-semibold w-12 text-center tabular-nums',
    }),
    b('sc-mas', 'icon-button', { icon: '+', label: 'Añadir una licencia' }, {
      events: [{ event: 'click', actions: [{ kind: 'increment', target: 'cantidad', by: '1' }] }],
    }),
    b('sc-aviso', 'alert', {
      text: 'Con 10 licencias o más se aplica el descuento por volumen.',
      variant: 'info', className: 'text-xs',
    }),
  ]),
};

export const SEED_LIBRARY: SeedLibrary = {
  name: 'Atenea',
  description: 'Kit de ejemplo: validación, estado, eventos, adaptabilidad y cascada de estilos.',
  theme: SEED_THEME,
  globalStyles: SEED_GLOBAL_CSS,
  components: [
    formularioAlta,
    tarjetaPrecio,
    tablaPedidos,
    panelIndicadores,
    barraNavegacion,
    dialogoConfirmacion,
    selectorCantidad,
  ],
};

/**
 * Forma persistida del árbol, tal y como la guarda el catálogo en `treeJson`.
 *
 * Pide solo los campos del árbol y no un `SeedComponent` entero para que valga
 * igual con la semilla y con el componente ya copiado dentro de un proyecto,
 * que es lo que se publica al crear un proyecto de ejemplo desde la interfaz.
 */
export function seedTreeJson(
  component: Pick<SeedComponent, 'blocks' | 'rootIds' | 'stateVars' | 'customStyles'>,
): string {
  return JSON.stringify({
    blocks: component.blocks,
    rootIds: component.rootIds,
    stateVars: component.stateVars,
    customStyles: component.customStyles ?? '',
    stylesLanguage: 'css',
  });
}
