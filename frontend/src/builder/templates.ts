/**
 * Plantillas: puntos de partida para un componente.
 *
 * No son ejemplos decorativos. Son la primera pantalla que ve alguien que abre
 * el constructor sin saber qué construir, así que lo que salga de aquí es lo que
 * esa persona va a creer que produce la herramienta.
 *
 * Dos reglas que antes no se cumplían:
 *
 *   1. **El color lo pone el TEMA, no la plantilla.** Las cuatro traían el azul
 *      de Tailwind escrito a mano (`bg-blue-600`, `text-blue-100`,
 *      `hover:bg-blue-700`). El resultado era un componente que ignoraba el tema
 *      de su librería: cambiabas el color de marca en un sitio y los componentes
 *      de la semilla se repintaban mientras los nacidos de una plantilla se
 *      quedaban azules. Ahora usan los roles del tema, igual que los valores por
 *      defecto de los 104 bloques y que el vocabulario del asistente.
 *
 *   2. **La descripción tiene que ser cierta.** «Formulario · Registro con
 *      validación» no traía una sola regla de validación: era un `card` con
 *      cuatro `input` sueltos, sin `form`, sin estado y sin envío. Quien lo
 *      cargaba para ver cómo se valida en esta herramienta no veía nada.
 *
 * El degradado del hero desapareció por la primera regla: un degradado necesita
 * dos colores y el tema define uno de marca. Prometer un degradado obligaría a
 * inventarse el segundo, que es justo lo que hacía que la plantilla no siguiera
 * al tema.
 */

import type { StateVar } from './actions';
import type { BuilderBlock } from './types';

export interface Template {
  id: string;
  label: string;
  description: string;
  blocks: Record<string, BuilderBlock>;
  rootIds: string[];
  /**
   * Estado que la plantilla necesita para funcionar.
   *
   * Sin esto una plantilla solo podía traer marcado. El formulario con
   * validación necesita recordar si ya se envió, y un `bindTo` que apunte a una
   * variable inexistente deja el campo sin enlazar y el envío sin comprobar.
   */
  stateVars?: StateVar[];
}

// ── Vocabulario de estilo compartido ─────────────────────────────────────────
//
// Escrito una vez y reutilizado: son las mismas decisiones que toman los valores
// por defecto de la paleta, y repetirlas a mano en cada plantilla es como se
// coló el azul fijo la primera vez.

/** Superficie de tarjeta: fondo, borde, radio y sombra del tema. */
const TARJETA = 'bg-[var(--vz-superficie)] border border-[color:var(--vz-borde)] rounded-[var(--vz-radio)] shadow-[var(--vz-sombra)] p-6';

/** Botón principal: relleno de marca y su color de contraste. */
const BOTON_PRIMARIO = 'bg-[var(--vz-primario)] text-[color:var(--vz-primario-contraste)] font-semibold px-4 py-2 rounded-[var(--vz-radio)] text-sm hover:opacity-90 transition-opacity';

/** Botón secundario: solo borde, para no competir con el principal. */
const BOTON_SECUNDARIO = 'border border-[color:var(--vz-borde)] text-[color:var(--vz-texto)] font-medium px-4 py-2 rounded-[var(--vz-radio)] text-sm hover:opacity-90 transition-opacity';

/** Botón sobre fondo de marca: se invierte, porque ahí el primario no contrasta. */
const BOTON_SOBRE_MARCA = 'bg-[var(--vz-superficie)] text-[color:var(--vz-primario)] font-semibold px-8 py-3 rounded-[var(--vz-radio)] text-sm hover:opacity-90 transition-opacity';

/** Campo de formulario, idéntico al valor por defecto del bloque `input`. */
const CAMPO = 'w-full border border-[color:var(--vz-borde)] rounded-[var(--vz-radio)] px-3 py-2 text-sm';

const TEXTO_SUAVE = 'text-[color:var(--vz-texto-suave)]';

export const TEMPLATES: Template[] = [
  {
    id: 'landing',
    label: 'Landing Page',
    description: 'Hero, características y CTA',
    blocks: {
      'block-t1': { id: 'block-t1', type: 'section', props: { className: `text-center py-16 px-6 bg-[var(--vz-primario)] text-[color:var(--vz-primario-contraste)] rounded-[var(--vz-radio)]` }, children: ['block-t2', 'block-t3', 'block-t4'] },
      'block-t2': { id: 'block-t2', type: 'h1', props: { text: 'Construye interfaces increíbles', className: 'text-4xl font-bold text-[color:var(--vz-primario-contraste)]' }, children: [] },
      'block-t3': { id: 'block-t3', type: 'p', props: { text: 'La forma más rápida de crear componentes de interfaz asistida por IA.', className: 'text-lg text-[color:var(--vz-primario-contraste)] mt-4 max-w-2xl mx-auto' }, children: [] },
      'block-t4': { id: 'block-t4', type: 'button', props: { text: 'Empieza gratis', buttonType: 'button', className: `mt-8 ${BOTON_SOBRE_MARCA}` }, children: [] },
      'block-t5': { id: 'block-t5', type: 'section', props: { className: 'py-12 px-6 space-y-4' }, children: ['block-t6', 'block-t7'] },
      'block-t6': { id: 'block-t6', type: 'h2', props: { text: 'Características', className: 'text-3xl font-bold text-center mb-8' }, children: [] },
      'block-t7': { id: 'block-t7', type: 'grid', props: { cols: '3', gap: '6', className: '' }, children: ['block-t8', 'block-t9', 'block-t10'] },
      'block-t8': { id: 'block-t8', type: 'card', props: { className: `${TARJETA} text-center` }, children: ['block-t11', 'block-t12'] },
      'block-t9': { id: 'block-t9', type: 'card', props: { className: `${TARJETA} text-center` }, children: ['block-t13', 'block-t14'] },
      'block-t10': { id: 'block-t10', type: 'card', props: { className: `${TARJETA} text-center` }, children: ['block-t15', 'block-t16'] },
      'block-t11': { id: 'block-t11', type: 'h3', props: { text: 'Arrastrar y soltar', className: 'text-lg font-semibold' }, children: [] },
      'block-t12': { id: 'block-t12', type: 'p', props: { text: 'Arrastra componentes desde la paleta y compón tu interfaz visualmente.', className: `text-sm ${TEXTO_SUAVE} mt-2` }, children: [] },
      'block-t13': { id: 'block-t13', type: 'h3', props: { text: 'IA integrada', className: 'text-lg font-semibold' }, children: [] },
      'block-t14': { id: 'block-t14', type: 'p', props: { text: 'Genera y refina componentes conversando con el asistente.', className: `text-sm ${TEXTO_SUAVE} mt-2` }, children: [] },
      'block-t15': { id: 'block-t15', type: 'h3', props: { text: 'Código limpio', className: 'text-lg font-semibold' }, children: [] },
      'block-t16': { id: 'block-t16', type: 'p', props: { text: 'Exporta la carpeta del componente lista para llevártela a tu proyecto.', className: `text-sm ${TEXTO_SUAVE} mt-2` }, children: [] },
      'block-t17': { id: 'block-t17', type: 'cta', props: { title: '¿Listo para empezar?', text: 'Crea tu primer componente en menos de un minuto.', buttonText: 'Crear cuenta', className: '' }, children: [] },
    },
    rootIds: ['block-t1', 'block-t5', 'block-t17'],
  },

  {
    id: 'dashboard',
    label: 'Dashboard',
    description: 'Indicadores, tabla y progreso',
    blocks: {
      'block-d1': { id: 'block-d1', type: 'h2', props: { text: 'Panel de control', className: 'text-3xl font-bold' }, children: [] },
      'block-d2': { id: 'block-d2', type: 'grid', props: { cols: '3', gap: '4', className: '' }, children: ['block-d3', 'block-d4', 'block-d5'] },
      'block-d3': { id: 'block-d3', type: 'stat', props: { label: 'Usuarios activos', value: '2.847', change: '+12,5 %', className: '' }, children: [] },
      'block-d4': { id: 'block-d4', type: 'stat', props: { label: 'Ingresos', value: '48.200 €', change: '+8,2 %', className: '' }, children: [] },
      'block-d5': { id: 'block-d5', type: 'stat', props: { label: 'Conversión', value: '3,6 %', change: '-0,4 %', className: '' }, children: [] },
      'block-d6': { id: 'block-d6', type: 'grid', props: { cols: '2', gap: '4', className: '' }, children: ['block-d7', 'block-d8'] },
      'block-d7': { id: 'block-d7', type: 'card', props: { className: TARJETA }, children: ['block-d9', 'block-d10'] },
      'block-d8': { id: 'block-d8', type: 'card', props: { className: `${TARJETA} space-y-4` }, children: ['block-d11', 'block-d12', 'block-d13'] },
      'block-d9': { id: 'block-d9', type: 'h3', props: { text: 'Últimos usuarios', className: 'text-2xl font-semibold mb-3' }, children: [] },
      'block-d10': { id: 'block-d10', type: 'table-ui', props: { headers: 'Nombre,Correo,Rol', rows: 'María García:maria@ejemplo.com:Admin,Juan López:juan@ejemplo.com:Editor,Ana Ruiz:ana@ejemplo.com:Lectura', className: '' }, children: [] },
      'block-d11': { id: 'block-d11', type: 'h3', props: { text: 'Progreso del mes', className: 'text-2xl font-semibold mb-3' }, children: [] },
      'block-d12': { id: 'block-d12', type: 'progress', props: { value: '72', label: 'Objetivo de ventas', className: '' }, children: [] },
      'block-d13': { id: 'block-d13', type: 'progress', props: { value: '45', label: 'Nuevos registros', className: '' }, children: [] },
    },
    rootIds: ['block-d1', 'block-d2', 'block-d6'],
  },

  {
    id: 'form',
    label: 'Formulario',
    description: 'Registro con validación y estado de éxito',
    /*
      Esta plantilla es la que más cambia, porque era la que más prometía y menos
      traía. Ahora es un `form` de verdad —no un `div` con campos sueltos— con
      reglas por campo, envío que las comprueba todas antes de actuar, y un
      estado de éxito que sustituye al formulario cuando pasa.

      Es también la demostración más corta de que la validación del constructor
      no es marcado: el generador y el intérprete del lienzo salen de las mismas
      reglas, así que el «Interactivo» valida igual que el código exportado.
    */
    stateVars: [
      { name: 'enviado', type: 'boolean', initial: 'false' },
      { name: 'correo', type: 'string', initial: '' },
    ],
    blocks: {
      'block-f1': {
        id: 'block-f1',
        type: 'form',
        props: { className: `${TARJETA} space-y-4 max-w-md mx-auto` },
        children: ['block-f2', 'block-f3', 'block-f4', 'block-f5', 'block-f6', 'block-f7', 'block-f8', 'block-f9'],
        events: [{ event: 'submit', actions: [{ kind: 'set', target: 'enviado', value: 'true' }] }],
        // Al enviarse correctamente el formulario desaparece y deja sitio al
        // aviso de éxito: los dos ocupan el mismo hueco, nunca los dos a la vez.
        visibleIf: { var: 'enviado', op: 'is', value: 'false' },
      },
      'block-f2': { id: 'block-f2', type: 'h2', props: { text: 'Crear cuenta', className: 'text-3xl font-bold text-center' }, children: [] },
      'block-f3': { id: 'block-f3', type: 'p', props: { text: 'Introduce tus datos para registrarte.', className: `text-sm ${TEXTO_SUAVE} text-center mb-6` }, children: [] },
      'block-f4': {
        id: 'block-f4', type: 'input',
        props: { label: 'Nombre completo', placeholder: 'Ada Lovelace', inputType: 'text', className: CAMPO },
        children: [],
        validations: [
          { kind: 'required' },
          { kind: 'minLength', value: '3', message: 'Escribe al menos 3 caracteres' },
        ],
      },
      'block-f5': {
        id: 'block-f5', type: 'input',
        // Enlazado a `correo`, que es lo que convierte el campo en controlado y
        // permite que el envío compruebe su valor.
        props: { label: 'Correo electrónico', placeholder: 'ada@ejemplo.com', inputType: 'email', bindTo: 'correo', className: CAMPO },
        children: [],
        validations: [{ kind: 'required' }, { kind: 'email' }],
      },
      'block-f6': {
        id: 'block-f6', type: 'input',
        props: { label: 'Contraseña', placeholder: 'Mínimo 8 caracteres', inputType: 'password', className: CAMPO },
        children: [],
        validations: [
          { kind: 'required' },
          { kind: 'minLength', value: '8', message: 'Mínimo 8 caracteres' },
        ],
      },
      'block-f7': {
        id: 'block-f7', type: 'checkbox',
        props: { label: 'Acepto los términos y condiciones', className: 'text-sm' },
        children: [],
        validations: [{ kind: 'required', message: 'Hay que aceptar los términos' }],
      },
      'block-f8': { id: 'block-f8', type: 'button', props: { text: 'Crear cuenta', buttonType: 'submit', className: `w-full ${BOTON_PRIMARIO}` }, children: [] },
      'block-f9': { id: 'block-f9', type: 'p', props: { text: '¿Ya tienes cuenta? Inicia sesión', className: `text-xs ${TEXTO_SUAVE} text-center mt-4` }, children: [] },
      'block-f10': {
        id: 'block-f10', type: 'result',
        props: { variant: 'success', title: '¡Cuenta creada!', text: 'Te hemos enviado un correo de confirmación.', className: 'max-w-md mx-auto' },
        children: [],
        visibleIf: { var: 'enviado', op: 'is', value: 'true' },
      },
    },
    rootIds: ['block-f1', 'block-f10'],
  },

  {
    id: 'pricing',
    label: 'Precios',
    description: 'Tres planes, con el recomendado destacado',
    blocks: {
      'block-p1': { id: 'block-p1', type: 'section', props: { className: 'text-center py-8 space-y-4' }, children: ['block-p2', 'block-p3'] },
      'block-p2': { id: 'block-p2', type: 'h2', props: { text: 'Planes y precios', className: 'text-3xl font-bold' }, children: [] },
      'block-p3': { id: 'block-p3', type: 'p', props: { text: 'Elige el plan que mejor se adapte a tus necesidades.', className: `${TEXTO_SUAVE} mt-2` }, children: [] },
      'block-p4': { id: 'block-p4', type: 'grid', props: { cols: '3', gap: '6', className: '' }, children: ['block-p5', 'block-p8', 'block-p12'] },

      'block-p5': { id: 'block-p5', type: 'card', props: { className: `${TARJETA} text-center` }, children: ['block-p6', 'block-p16', 'block-p7', 'block-p17'] },
      'block-p6': { id: 'block-p6', type: 'h3', props: { text: 'Básico', className: 'text-2xl font-semibold' }, children: [] },
      'block-p16': { id: 'block-p16', type: 'h2', props: { text: '0 €/mes', className: 'text-3xl font-bold mt-4' }, children: [] },
      'block-p7': { id: 'block-p7', type: 'ul', props: { items: '5 componentes,1 proyecto,Soporte por correo', className: `list-disc list-inside space-y-1 text-sm ${TEXTO_SUAVE} mt-4 text-left` }, children: [] },
      'block-p17': { id: 'block-p17', type: 'button', props: { text: 'Empezar', buttonType: 'button', className: `mt-6 w-full ${BOTON_SECUNDARIO}` }, children: [] },

      /*
        El plan recomendado se destaca invirtiendo el color de marca, no con un
        azul propio: así sigue siendo «el plan destacado» con cualquier tema, que
        es lo que la tarjeta quiere decir.
      */
      'block-p8': { id: 'block-p8', type: 'card', props: { className: 'bg-[var(--vz-primario)] text-[color:var(--vz-primario-contraste)] border border-[color:var(--vz-primario)] rounded-[var(--vz-radio)] shadow-[var(--vz-sombra)] p-6 text-center' }, children: ['block-p9', 'block-p18', 'block-p10', 'block-p11'] },
      'block-p9': { id: 'block-p9', type: 'h3', props: { text: 'Pro', className: 'text-2xl font-semibold text-[color:var(--vz-primario-contraste)]' }, children: [] },
      'block-p18': { id: 'block-p18', type: 'h2', props: { text: '29 €/mes', className: 'text-3xl font-bold mt-4 text-[color:var(--vz-primario-contraste)]' }, children: [] },
      'block-p10': { id: 'block-p10', type: 'ul', props: { items: 'Componentes ilimitados,10 proyectos,Soporte prioritario,Exportación a los ocho destinos', className: 'list-disc list-inside space-y-1 text-sm text-[color:var(--vz-primario-contraste)] mt-4 text-left' }, children: [] },
      'block-p11': { id: 'block-p11', type: 'button', props: { text: 'Elegir Pro', buttonType: 'button', className: `mt-6 w-full ${BOTON_SOBRE_MARCA}` }, children: [] },

      'block-p12': { id: 'block-p12', type: 'card', props: { className: `${TARJETA} text-center` }, children: ['block-p13', 'block-p19', 'block-p14', 'block-p15'] },
      'block-p13': { id: 'block-p13', type: 'h3', props: { text: 'Enterprise', className: 'text-2xl font-semibold' }, children: [] },
      'block-p19': { id: 'block-p19', type: 'h2', props: { text: 'A medida', className: 'text-3xl font-bold mt-4' }, children: [] },
      'block-p14': { id: 'block-p14', type: 'ul', props: { items: 'Todo lo de Pro,Proyectos ilimitados,SLA dedicado,SSO/SAML', className: `list-disc list-inside space-y-1 text-sm ${TEXTO_SUAVE} mt-4 text-left` }, children: [] },
      'block-p15': { id: 'block-p15', type: 'button', props: { text: 'Contactar', buttonType: 'button', className: `mt-6 w-full ${BOTON_SECUNDARIO}` }, children: [] },
    },
    rootIds: ['block-p1', 'block-p4'],
  },
];
