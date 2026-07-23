namespace Visualiza.Infrastructure.Components;

// Los mocks replican el contrato de los componentes generados por GPT-4o:
// `export function App()` sin props obligatorias, con estado, eventos, validación
// y textos reales, de modo que el sandbox del frontend pueda renderizarlos tal cual
// y la experiencia sin API key sea equivalente a la del generador real.
internal static class MockSources
{
    public const string RegistrationForm = """
        export function App() {
          const [values, setValues] = useState({ name: '', email: '', password: '' });
          const [touched, setTouched] = useState({ name: false, email: false, password: false });
          const [sent, setSent] = useState(false);

          const errors = {
            name: values.name.trim() === '' ? 'El nombre es obligatorio.' : '',
            email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email) ? '' : 'Introduce un correo electrónico válido.',
            password: values.password.length >= 8 ? '' : 'La contraseña debe tener al menos 8 caracteres.',
          };
          const isValid = errors.name === '' && errors.email === '' && errors.password === '';

          function handleSubmit(e: any) {
            e.preventDefault();
            setTouched({ name: true, email: true, password: true });
            if (isValid) setSent(true);
          }

          if (sent) {
            return (
              <div className="max-w-sm mx-auto bg-white border border-slate-200 rounded-xl shadow-sm p-8 text-center space-y-3">
                <div className="w-12 h-12 mx-auto rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center text-2xl" aria-hidden="true">✓</div>
                <h2 className="text-lg font-semibold text-slate-900">Cuenta creada</h2>
                <p className="text-sm text-slate-500">Hemos enviado un correo de confirmación a <span className="font-medium text-slate-700">{values.email}</span>.</p>
                <button
                  type="button"
                  onClick={() => { setSent(false); setValues({ name: '', email: '', password: '' }); setTouched({ name: false, email: false, password: false }); }}
                  className="text-sm font-medium text-indigo-600 hover:text-indigo-700 transition-colors"
                >
                  Registrar otra cuenta
                </button>
              </div>
            );
          }

          return (
            <form onSubmit={handleSubmit} noValidate className="max-w-sm mx-auto bg-white border border-slate-200 rounded-xl shadow-sm p-6 space-y-4">
              <div className="space-y-1">
                <h2 className="text-lg font-semibold text-slate-900">Crea tu cuenta</h2>
                <p className="text-sm text-slate-500">Empieza gratis, sin tarjeta de crédito.</p>
              </div>

              <label className="block">
                <span className="text-sm font-medium text-slate-700">Nombre completo</span>
                <input
                  type="text"
                  value={values.name}
                  onChange={(e: any) => setValues({ ...values, name: e.target.value })}
                  onBlur={() => setTouched({ ...touched, name: true })}
                  aria-invalid={touched.name && errors.name !== ''}
                  placeholder="Ana García"
                  className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:border-indigo-500 transition-shadow"
                />
                {touched.name && errors.name !== '' && <span className="mt-1 block text-xs text-red-600" role="alert">{errors.name}</span>}
              </label>

              <label className="block">
                <span className="text-sm font-medium text-slate-700">Correo electrónico</span>
                <input
                  type="email"
                  value={values.email}
                  onChange={(e: any) => setValues({ ...values, email: e.target.value })}
                  onBlur={() => setTouched({ ...touched, email: true })}
                  aria-invalid={touched.email && errors.email !== ''}
                  placeholder="ana@empresa.com"
                  className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:border-indigo-500 transition-shadow"
                />
                {touched.email && errors.email !== '' && <span className="mt-1 block text-xs text-red-600" role="alert">{errors.email}</span>}
              </label>

              <label className="block">
                <span className="text-sm font-medium text-slate-700">Contraseña</span>
                <input
                  type="password"
                  value={values.password}
                  onChange={(e: any) => setValues({ ...values, password: e.target.value })}
                  onBlur={() => setTouched({ ...touched, password: true })}
                  aria-invalid={touched.password && errors.password !== ''}
                  placeholder="••••••••"
                  className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:border-indigo-500 transition-shadow"
                />
                {touched.password && errors.password !== ''
                  ? <span className="mt-1 block text-xs text-red-600" role="alert">{errors.password}</span>
                  : <span className="mt-1 block text-xs text-slate-400">Mínimo 8 caracteres.</span>}
              </label>

              <button
                type="submit"
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2.5 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 transition-colors"
              >
                Crear cuenta
              </button>
              <p className="text-xs text-center text-slate-400">Al registrarte aceptas los términos y la política de privacidad.</p>
            </form>
          );
        }
        """;

    public const string DataTable = """
        export function App() {
          const people = [
            { id: 1, name: 'Ana García', email: 'ana.garcia@example.com', role: 'Diseño' },
            { id: 2, name: 'Luis Pérez', email: 'luis.perez@example.com', role: 'Desarrollo' },
            { id: 3, name: 'Eva Molina', email: 'eva.molina@example.com', role: 'Producto' },
            { id: 4, name: 'Marc Soler', email: 'marc.soler@example.com', role: 'Desarrollo' },
            { id: 5, name: 'Sara Ortiz', email: 'sara.ortiz@example.com', role: 'Marketing' },
          ];
          const [query, setQuery] = useState('');
          const [asc, setAsc] = useState(true);

          const visible = people
            .filter((p) => (p.name + ' ' + p.email + ' ' + p.role).toLowerCase().includes(query.toLowerCase()))
            .sort((a, b) => (asc ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name)));

          return (
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
              <div className="p-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold text-slate-900">Equipo</h2>
                  <p className="text-xs text-slate-500">{visible.length} de {people.length} personas</p>
                </div>
                <input
                  type="search"
                  value={query}
                  onChange={(e: any) => setQuery(e.target.value)}
                  placeholder="Buscar por nombre, correo o rol…"
                  aria-label="Buscar en la tabla"
                  className="w-56 border border-slate-300 rounded-lg px-3 py-2 text-sm placeholder-slate-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 transition-shadow"
                />
              </div>
              <table className="w-full text-left">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-4 py-2.5">
                      <button
                        type="button"
                        onClick={() => setAsc(!asc)}
                        className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-slate-500 hover:text-slate-800 transition-colors"
                      >
                        Nombre <span aria-hidden="true">{asc ? '▲' : '▼'}</span>
                      </button>
                    </th>
                    <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-500">Correo</th>
                    <th className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-500">Rol</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((p, i) => (
                    <tr key={p.id} className={(i % 2 ? 'bg-slate-50/60 ' : '') + 'hover:bg-indigo-50/40 transition-colors'}>
                      <td className="px-4 py-2.5 text-sm font-medium text-slate-900">{p.name}</td>
                      <td className="px-4 py-2.5 text-sm text-slate-500">{p.email}</td>
                      <td className="px-4 py-2.5">
                        <span className="inline-block text-xs font-medium bg-slate-100 text-slate-600 rounded-full px-2.5 py-0.5">{p.role}</span>
                      </td>
                    </tr>
                  ))}
                  {visible.length === 0 && (
                    <tr>
                      <td colSpan={3} className="px-4 py-8 text-center text-sm text-slate-400">
                        Sin resultados para «{query}». Prueba con otro término.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          );
        }
        """;

    public const string StatsPanel = """
        export function App() {
          const [period, setPeriod] = useState('7d');
          const data: Record<string, { label: string; value: string; delta: number }[]> = {
            '7d': [
              { label: 'Visitas', value: '12.480', delta: 8.2 },
              { label: 'Nuevos usuarios', value: '1.043', delta: 12.5 },
              { label: 'Conversión', value: '3,9 %', delta: -1.4 },
              { label: 'Ingresos', value: '8.320 €', delta: 4.7 },
            ],
            '30d': [
              { label: 'Visitas', value: '48.960', delta: 5.1 },
              { label: 'Nuevos usuarios', value: '4.312', delta: 9.8 },
              { label: 'Conversión', value: '4,2 %', delta: 0.6 },
              { label: 'Ingresos', value: '31.750 €', delta: -2.3 },
            ],
          };
          const stats = data[period];

          return (
            <section className="bg-white border border-slate-200 rounded-xl shadow-sm p-6 space-y-4" aria-label="Panel de estadísticas">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold text-slate-900">Resumen de actividad</h2>
                  <p className="text-xs text-slate-500">Comparado con el periodo anterior</p>
                </div>
                <div className="flex gap-0.5 bg-slate-100 rounded-lg p-0.5" role="group" aria-label="Periodo">
                  {['7d', '30d'].map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setPeriod(p)}
                      aria-pressed={period === p}
                      className={(period === p ? 'bg-white text-slate-900 shadow-sm ' : 'text-slate-500 hover:text-slate-700 ') +
                        'px-3 py-1.5 text-xs font-medium rounded-md transition-all'}
                    >
                      {p === '7d' ? 'Últimos 7 días' : 'Últimos 30 días'}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {stats.map((s) => (
                  <article key={s.label} className="border border-slate-100 bg-slate-50/50 rounded-lg p-4 space-y-1">
                    <p className="text-xs uppercase tracking-wide text-slate-500">{s.label}</p>
                    <p className="text-2xl font-bold text-slate-900">{s.value}</p>
                    <p className={(s.delta >= 0 ? 'text-emerald-600' : 'text-red-600') + ' text-xs font-medium'}>
                      <span aria-hidden="true">{s.delta >= 0 ? '▲' : '▼'}</span> {Math.abs(s.delta).toFixed(1).replace('.', ',')} %
                      <span className="text-slate-400 font-normal"> vs periodo anterior</span>
                    </p>
                  </article>
                ))}
              </div>
            </section>
          );
        }
        """;

    public const string NavigationMenu = """
        export function App() {
          const [active, setActive] = useState('Inicio');
          const [open, setOpen] = useState(false);
          const items = ['Inicio', 'Productos', 'Precios', 'Contacto'];

          return (
            <nav aria-label="Principal" className="bg-white border border-slate-200 rounded-xl shadow-sm px-4 py-3">
              <div className="flex items-center justify-between">
                <a href="#" className="flex items-center gap-2 font-bold text-slate-900">
                  <span className="w-7 h-7 rounded-lg bg-indigo-600 text-white text-sm flex items-center justify-center" aria-hidden="true">V</span>
                  Visualiza
                </a>
                <div className="hidden sm:flex items-center gap-1">
                  {items.map((item) => (
                    <a
                      key={item}
                      href="#"
                      aria-current={active === item ? 'page' : undefined}
                      onClick={(e: any) => { e.preventDefault(); setActive(item); }}
                      className={(active === item
                        ? 'bg-indigo-50 text-indigo-700 '
                        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 ') +
                        'px-3 py-2 rounded-lg text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500'}
                    >
                      {item}
                    </a>
                  ))}
                  <a href="#" className="ml-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
                    Empezar
                  </a>
                </div>
                <button
                  type="button"
                  onClick={() => setOpen(!open)}
                  aria-expanded={open}
                  aria-label={open ? 'Cerrar menú' : 'Abrir menú'}
                  className="sm:hidden p-2 rounded-lg text-slate-600 hover:bg-slate-100 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                >
                  <span aria-hidden="true">{open ? '✕' : '☰'}</span>
                </button>
              </div>
              {open && (
                <div className="sm:hidden mt-3 pt-3 border-t border-slate-100 space-y-1">
                  {items.map((item) => (
                    <a
                      key={item}
                      href="#"
                      aria-current={active === item ? 'page' : undefined}
                      onClick={(e: any) => { e.preventDefault(); setActive(item); setOpen(false); }}
                      className={(active === item
                        ? 'bg-indigo-50 text-indigo-700 '
                        : 'text-slate-600 hover:bg-slate-100 ') +
                        'block px-3 py-2 rounded-lg text-sm font-medium transition-colors'}
                    >
                      {item}
                    </a>
                  ))}
                </div>
              )}
            </nav>
          );
        }
        """;

    public const string ProductCard = """
        export function App() {
          const [qty, setQty] = useState(1);
          const [added, setAdded] = useState(false);
          const price = 19.99;

          function addToCart() {
            setAdded(true);
            setTimeout(() => setAdded(false), 1800);
          }

          return (
            <article className="max-w-xs bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
              <div className="h-36 bg-gradient-to-br from-indigo-400 via-purple-400 to-pink-300 relative" aria-hidden="true">
                <span className="absolute top-3 left-3 bg-white/90 text-slate-700 text-xs font-medium px-2.5 py-1 rounded-full">Novedad</span>
              </div>
              <div className="p-4 space-y-3">
                <div className="space-y-1">
                  <h3 className="font-semibold text-slate-900">Auriculares Nube X2</h3>
                  <p className="text-sm text-slate-500">Cancelación de ruido activa y 30 h de batería.</p>
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-xl font-bold text-slate-900">{(price * qty).toFixed(2).replace('.', ',')} €</span>
                  <span className="text-xs text-slate-400 line-through">{(29.99 * qty).toFixed(2).replace('.', ',')} €</span>
                  <span className="text-xs font-medium text-emerald-600">-33 %</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex items-center border border-slate-300 rounded-lg" role="group" aria-label="Cantidad">
                    <button
                      type="button"
                      onClick={() => setQty(Math.max(1, qty - 1))}
                      disabled={qty <= 1}
                      aria-label="Reducir cantidad"
                      className="px-3 py-2 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:hover:bg-transparent rounded-l-lg transition-colors"
                    >
                      −
                    </button>
                    <span className="px-3 text-sm font-medium text-slate-900 tabular-nums" aria-live="polite">{qty}</span>
                    <button
                      type="button"
                      onClick={() => setQty(Math.min(9, qty + 1))}
                      disabled={qty >= 9}
                      aria-label="Aumentar cantidad"
                      className="px-3 py-2 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:hover:bg-transparent rounded-r-lg transition-colors"
                    >
                      +
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={addToCart}
                    className={(added
                      ? 'bg-emerald-600 hover:bg-emerald-600 '
                      : 'bg-indigo-600 hover:bg-indigo-700 ') +
                      'flex-1 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2'}
                  >
                    {added ? '✓ Añadido' : 'Añadir al carrito'}
                  </button>
                </div>
                <p className="text-xs text-slate-400">Envío gratis a partir de 30 €. Devolución en 30 días.</p>
              </div>
            </article>
          );
        }
        """;
}
