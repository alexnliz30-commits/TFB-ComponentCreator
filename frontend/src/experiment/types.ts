import type { ComponentType } from '../api/components';
import type { Condition } from '../api/sessions';

export interface CorpusItem {
  id: string;
  type: ComponentType;
  condition: Condition;
  label: string;
  sourceCode: string;
}

const FORM_AI = `function App() {
  return (
    <form className="space-y-3 p-4 bg-white rounded">
      <label className="block">
        <span className="text-sm">Email</span>
        <input type="email" className="w-full border rounded px-2 py-1" />
      </label>
      <label className="block">
        <span className="text-sm">Password</span>
        <input type="password" className="w-full border rounded px-2 py-1" />
      </label>
      <button type="submit" className="bg-blue-600 text-white px-3 py-1 rounded">Sign up</button>
    </form>
  );
}`;

const FORM_HUMAN = `function App() {
  return (
    <form className="max-w-sm p-4 space-y-4 bg-white rounded shadow" aria-label="Registro">
      <label className="block">
        <span className="text-sm font-medium text-slate-700">Correo electrónico</span>
        <input type="email" required autoComplete="email" className="mt-1 w-full border border-slate-300 rounded px-3 py-2" />
        <span className="text-xs text-slate-500">Lo usaremos para confirmar tu cuenta.</span>
      </label>
      <label className="block">
        <span className="text-sm font-medium text-slate-700">Contraseña</span>
        <input type="password" required minLength={8} autoComplete="new-password" className="mt-1 w-full border border-slate-300 rounded px-3 py-2" />
        <span className="text-xs text-slate-500">Mínimo 8 caracteres.</span>
      </label>
      <button type="submit" className="w-full bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-2 rounded">Crear cuenta</button>
    </form>
  );
}`;

const TABLE_AI = `function App() {
  const rows = [{id:1,name:'Ana'},{id:2,name:'Luis'},{id:3,name:'Eva'}];
  return (
    <table className="w-full text-left">
      <thead><tr><th>ID</th><th>Name</th></tr></thead>
      <tbody>
        {rows.map(r => <tr key={r.id}><td>{r.id}</td><td>{r.name}</td></tr>)}
      </tbody>
    </table>
  );
}`;

const TABLE_HUMAN = `function App() {
  const rows = [{id:1,name:'Ana',email:'ana@example.com'},{id:2,name:'Luis',email:'luis@example.com'},{id:3,name:'Eva',email:'eva@example.com'}];
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left border border-slate-200">
        <thead className="bg-slate-100">
          <tr>
            <th className="px-3 py-2 text-xs font-medium uppercase text-slate-500">ID</th>
            <th className="px-3 py-2 text-xs font-medium uppercase text-slate-500">Nombre</th>
            <th className="px-3 py-2 text-xs font-medium uppercase text-slate-500">Correo</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r,i) => (
            <tr key={r.id} className={i % 2 ? 'bg-white' : 'bg-slate-50'}>
              <td className="px-3 py-2">{r.id}</td>
              <td className="px-3 py-2">{r.name}</td>
              <td className="px-3 py-2 text-slate-600">{r.email}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}`;

const STATS_AI = `function App() {
  return (
    <div className="p-4 rounded shadow">
      <div className="text-3xl font-bold">42</div>
      <div className="text-sm text-gray-500">Usuarios</div>
    </div>
  );
}`;

const STATS_HUMAN = `function App() {
  return (
    <div className="grid grid-cols-3 gap-3">
      {[{n:42,l:'Usuarios',d:'+12%'},{n:128,l:'Sesiones',d:'+4%'},{n:7,l:'Errores',d:'-30%'}].map(s => (
        <article key={s.l} className="bg-white p-4 rounded shadow">
          <div className="text-2xl font-bold text-slate-900">{s.n}</div>
          <div className="text-xs uppercase text-slate-500">{s.l}</div>
          <div className="text-xs text-emerald-600 mt-1">{s.d}</div>
        </article>
      ))}
    </div>
  );
}`;

const NAV_AI = `function App() {
  const items = [{href:'#',label:'Inicio'},{href:'#',label:'Precios'},{href:'#',label:'Contacto'}];
  return (
    <nav className="flex gap-3">
      {items.map(i => <a key={i.label} href={i.href}>{i.label}</a>)}
    </nav>
  );
}`;

const NAV_HUMAN = `function App() {
  const items = [{href:'#',label:'Inicio',current:true},{href:'#',label:'Precios'},{href:'#',label:'Contacto'}];
  return (
    <nav aria-label="Principal" className="flex items-center gap-1 bg-white px-2 py-2 rounded shadow">
      {items.map(i => (
        <a key={i.label} href={i.href}
           aria-current={i.current ? 'page' : undefined}
           className={'px-3 py-2 rounded text-sm font-medium ' + (i.current ? 'bg-blue-100 text-blue-700' : 'text-slate-700 hover:bg-slate-100')}>
          {i.label}
        </a>
      ))}
    </nav>
  );
}`;

const CARD_AI = `function App() {
  return (
    <article className="border rounded p-3">
      <h3 className="font-medium">Producto X</h3>
      <p className="text-blue-600">19.99 €</p>
    </article>
  );
}`;

const CARD_HUMAN = `function App() {
  return (
    <article className="max-w-xs bg-white rounded-lg shadow overflow-hidden">
      <div className="h-32 bg-gradient-to-br from-blue-300 to-purple-400" aria-hidden="true"></div>
      <div className="p-4 space-y-2">
        <h3 className="font-semibold text-slate-900">Producto X</h3>
        <p className="text-sm text-slate-600">Descripción corta del producto en una línea.</p>
        <div className="flex items-baseline justify-between">
          <span className="text-lg font-bold text-emerald-700">19,99 €</span>
          <button type="button" className="bg-emerald-600 hover:bg-emerald-700 text-white text-sm px-3 py-1 rounded">Añadir</button>
        </div>
      </div>
    </article>
  );
}`;

export const CORPUS: CorpusItem[] = [
  { id: 'reg-ai', type: 'RegistrationForm', condition: 'Ai', label: 'Formulario de registro (versión A)', sourceCode: FORM_AI },
  { id: 'reg-h', type: 'RegistrationForm', condition: 'Human', label: 'Formulario de registro (versión B)', sourceCode: FORM_HUMAN },
  { id: 'tbl-ai', type: 'DataTable', condition: 'Ai', label: 'Tabla de datos (versión A)', sourceCode: TABLE_AI },
  { id: 'tbl-h', type: 'DataTable', condition: 'Human', label: 'Tabla de datos (versión B)', sourceCode: TABLE_HUMAN },
  { id: 'stats-ai', type: 'StatsPanel', condition: 'Ai', label: 'Panel de estadísticas (versión A)', sourceCode: STATS_AI },
  { id: 'stats-h', type: 'StatsPanel', condition: 'Human', label: 'Panel de estadísticas (versión B)', sourceCode: STATS_HUMAN },
  { id: 'nav-ai', type: 'NavigationMenu', condition: 'Ai', label: 'Menú de navegación (versión A)', sourceCode: NAV_AI },
  { id: 'nav-h', type: 'NavigationMenu', condition: 'Human', label: 'Menú de navegación (versión B)', sourceCode: NAV_HUMAN },
  { id: 'card-ai', type: 'ProductCard', condition: 'Ai', label: 'Tarjeta de producto (versión A)', sourceCode: CARD_AI },
  { id: 'card-h', type: 'ProductCard', condition: 'Human', label: 'Tarjeta de producto (versión B)', sourceCode: CARD_HUMAN },
];

/**
 * Un bloque de la sesión: los cinco componentes de UNA condición, más la
 * etiqueta neutra con la que se le presentan al participante.
 */
export interface CorpusBlock {
  /** «A» o «B». Estable durante toda la sesión: identifica al conjunto. */
  set: 'A' | 'B';
  condition: Condition;
  items: CorpusItem[];
}

/**
 * Contrabalanceo por sesión, en dos niveles.
 *
 * Los componentes se presentan AGRUPADOS POR CONDICIÓN, en dos bloques de cinco,
 * porque el cuestionario SUS se administra una vez por bloque: valora un
 * conjunto coherente de interfaz, que es para lo que se diseñó y validó. Varios
 * de sus ítems —«necesitaría apoyo técnico», «tendría que aprender muchas
 * cosas»— resultan forzados aplicados a un componente aislado, y administrarlo
 * diez veces suma cien ítems Likert por participante, con la fatiga
 * consiguiente. Una sola valoración global tampoco sirve: dejaría una única
 * puntuación por persona y desaparecería el contraste entre condiciones, que es
 * la pregunta de investigación.
 *
 * Nivel 1 — qué bloque va primero: la mitad de las sesiones empieza por IA y la
 * otra mitad por humano, según el id de sesión. Neutraliza el efecto del orden
 * entre condiciones.
 *
 * Nivel 2 — orden de los cinco tipos dentro de cada bloque: rotación de cuadrado
 * latino derivada del mismo id, y desplazada en el segundo bloque para que un
 * tipo no ocupe la misma posición en los dos.
 *
 * El cegamiento se mantiene: las etiquetas «A» y «B» se asignan por orden de
 * presentación y no informan del origen. Lo que ANTES filtraba era presentar las
 * dos versiones del mismo tipo seguidas: el participante veía dos formularios
 * casi idénticos uno detrás de otro, y la comparación —que es justo lo que el
 * ciego trata de evitar— resultaba inevitable.
 */
export function blocksForSession(sessionId: string): CorpusBlock[] {
  const types = Array.from(new Set(CORPUS.map((c) => c.type)));
  const seed = hashCode(sessionId);
  const aiFirst = (seed >>> 3) % 2 === 0;
  const conditions: Condition[] = aiFirst ? ['Ai', 'Human'] : ['Human', 'Ai'];

  return conditions.map((condition, blockIdx) => {
    const rotation = (seed + blockIdx * 2) % types.length;
    const rotated = types.map((_, i) => types[(i + rotation) % types.length]);
    const set = blockIdx === 0 ? 'A' : 'B';
    return {
      set,
      condition,
      items: rotated.map((type) => {
        const item = CORPUS.find((c) => c.type === type && c.condition === condition)!;
        return {
          ...item,
          label: item.label.replace(/\(versión [AB]\)$/, `(conjunto ${set})`),
        };
      }),
    };
  });
}

function hashCode(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

/**
 * Los diez ítems del SUS de Brooke, redactados sobre el CONJUNTO de componentes
 * que el participante acaba de usar. La escala valora un sistema, no una pieza
 * suelta, y la redacción tiene que decir lo mismo que se está midiendo.
 *
 * Se conservan el orden y la alternancia de polaridad del instrumento original:
 * los impares son positivos y los pares negativos, y de eso depende la fórmula
 * de puntuación que aplica el dominio.
 */
export const SUS_ITEMS = [
  'Creo que utilizaría estos componentes con frecuencia.',
  'Encuentro estos componentes innecesariamente complejos.',
  'Creo que estos componentes son fáciles de usar.',
  'Creo que necesitaría apoyo técnico para utilizarlos.',
  'Las funciones de estos componentes están bien integradas.',
  'Hay demasiada inconsistencia entre estos componentes.',
  'La mayoría de las personas aprenderían a usarlos rápidamente.',
  'Estos componentes son engorrosos de utilizar.',
  'Me sentí con confianza al utilizarlos.',
  'Necesité aprender muchas cosas antes de poder utilizarlos.',
];
