/**
 * Editor de los estilos globales de la librería.
 *
 * Lo que se toca aquí afecta a TODOS los componentes del proyecto, porque los
 * bloques se pintan por rol (`--vz-primario`, `--vz-borde`…) en vez de con
 * colores literales. La personalización de un componente concreto sigue viviendo
 * en su propio `className` y en su hoja de estilos, que ganan a los roles.
 */

import { useBuilderState, useBuilderDispatch } from './useBuilderStore';
import {
  DEFAULT_THEME, THEME_PRESETS,
  type Theme, type ThemeColors, type ThemeShape, type ThemeTypography,
} from './theme';

const COLOR_FIELDS: { key: keyof ThemeColors; label: string; hint: string }[] = [
  { key: 'primario', label: 'Primario', hint: 'Acciones principales, foco y elementos activos' },
  { key: 'primarioContraste', label: 'Sobre primario', hint: 'Texto e iconos encima del color primario' },
  { key: 'superficie', label: 'Superficie', hint: 'Fondo de tarjetas, paneles y campos' },
  { key: 'superficieAlt', label: 'Superficie alt.', hint: 'Cabeceras de tabla y zonas destacadas' },
  { key: 'texto', label: 'Texto', hint: 'Texto principal' },
  { key: 'textoSuave', label: 'Texto suave', hint: 'Ayudas, etiquetas y texto secundario' },
  { key: 'borde', label: 'Borde', hint: 'Líneas, separadores y contorno de campos' },
  { key: 'exito', label: 'Éxito', hint: 'Confirmaciones' },
  { key: 'aviso', label: 'Aviso', hint: 'Advertencias' },
  { key: 'error', label: 'Error', hint: 'Errores y validaciones fallidas' },
];

const FONT_STACKS: { label: string; value: string }[] = [
  { label: 'Sistema', value: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif' },
  { label: 'Serif', value: 'Georgia, "Times New Roman", serif' },
  { label: 'Monoespaciada', value: 'ui-monospace, SFMono-Regular, Menlo, monospace' },
  { label: 'Geométrica', value: '"Avenir Next", "Century Gothic", system-ui, sans-serif' },
];

const RADIUS_OPTIONS: { label: string; value: string }[] = [
  { label: 'Recto', value: '0px' },
  { label: 'Suave', value: '0.25rem' },
  { label: 'Medio', value: '0.5rem' },
  { label: 'Amplio', value: '0.75rem' },
  { label: 'Redondo', value: '1rem' },
];

const SHADOW_OPTIONS: { label: string; value: string }[] = [
  { label: 'Ninguna', value: 'none' },
  { label: 'Sutil', value: '0 1px 2px 0 rgb(0 0 0 / 0.05)' },
  { label: 'Media', value: '0 4px 6px -1px rgb(0 0 0 / 0.1)' },
  { label: 'Marcada', value: '0 10px 15px -3px rgb(0 0 0 / 0.1)' },
];

const BORDER_OPTIONS: { label: string; value: string }[] = [
  { label: 'Fina', value: '1px' },
  { label: 'Media', value: '2px' },
  { label: 'Gruesa', value: '3px' },
];

/**
 * Editor del tema, sin saber de dónde sale ni a dónde va.
 *
 * Existe separado porque el mismo tema se edita desde dos sitios: el constructor
 * (donde vive en el store y se aplica al instante) y el catálogo de librerías
 * (donde pertenece a la librería y se guarda contra el backend). Teniéndolo una
 * sola vez, los dos ofrecen exactamente los mismos roles y los mismos preajustes;
 * duplicado, se habrían separado a la primera de cambio.
 */
export function ThemeEditor({ theme, onChange, children }: {
  theme: Theme;
  onChange: (next: Theme) => void;
  /** Añadidos del contexto: la hoja global y el guardado en el catálogo. */
  children?: React.ReactNode;
}) {
  const apply = onChange;
  const setColors = (patch: Partial<ThemeColors>) =>
    apply({ ...theme, colors: { ...theme.colors, ...patch } });
  const setTypography = (patch: Partial<ThemeTypography>) =>
    apply({ ...theme, typography: { ...theme.typography, ...patch } });
  const setShape = (patch: Partial<ThemeShape>) =>
    apply({ ...theme, shape: { ...theme.shape, ...patch } });

  return (
    <div className="px-4 py-3 space-y-5 text-slate-300">
      <p className="text-[11px] text-slate-500 leading-relaxed">
        Estos estilos los comparten todos los componentes de la librería. Para
        cambiar solo uno, usa su panel de propiedades o su hoja de estilos.
      </p>

      <Section title="Punto de partida">
        <div className="flex flex-wrap gap-1.5">
          {THEME_PRESETS.map((preset) => (
            <button
              key={preset.id}
              onClick={() => apply(preset.theme)}
              title={preset.label}
              className="flex items-center gap-1.5 px-2 py-1 rounded-md border border-slate-700 hover:border-slate-500 text-[11px] transition-colors"
            >
              <span
                className="w-3 h-3 rounded-full border border-slate-600"
                style={{ background: preset.theme.colors.primario }}
              />
              {preset.label}
            </button>
          ))}
        </div>
      </Section>

      <Section title="Colores">
        <div className="space-y-1.5">
          {COLOR_FIELDS.map((field) => (
            <div key={field.key} className="flex items-center gap-2" title={field.hint}>
              <input
                type="color"
                value={theme.colors[field.key]}
                onChange={(e) => setColors({ [field.key]: e.target.value } as Partial<ThemeColors>)}
                aria-label={field.label}
                className="w-7 h-7 rounded border border-slate-700 bg-transparent cursor-pointer shrink-0"
              />
              <span className="text-[11px] flex-1 truncate">{field.label}</span>
              <input
                type="text"
                value={theme.colors[field.key]}
                onChange={(e) => setColors({ [field.key]: e.target.value } as Partial<ThemeColors>)}
                aria-label={`${field.label} en hexadecimal`}
                className="w-20 bg-slate-800 border border-slate-700 rounded px-1.5 py-0.5 text-[10px] font-mono focus:ring-1 focus:ring-blue-500 outline-none"
              />
            </div>
          ))}
        </div>
      </Section>

      <Section title="Tipografía">
        <Field label="Familia">
          <select
            value={theme.typography.familia}
            onChange={(e) => setTypography({ familia: e.target.value })}
            className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-[11px] focus:ring-1 focus:ring-blue-500 outline-none"
          >
            {FONT_STACKS.map((f) => <option key={f.label} value={f.value}>{f.label}</option>)}
            {/* Una familia escrita a mano no está en la lista: se conserva. */}
            {!FONT_STACKS.some((f) => f.value === theme.typography.familia) && (
              <option value={theme.typography.familia}>Personalizada</option>
            )}
          </select>
        </Field>
        <Field label="Tamaño base">
          <div className="flex items-center gap-2">
            <input
              type="range"
              min={12}
              max={20}
              value={theme.typography.tamanoBase}
              onChange={(e) => setTypography({ tamanoBase: Number(e.target.value) })}
              aria-label="Tamaño base en píxeles"
              className="flex-1"
            />
            <span className="text-[10px] font-mono w-10 text-right">{theme.typography.tamanoBase}px</span>
          </div>
        </Field>
        <Field label="Peso de títulos">
          <Choices
            options={[
              { label: 'Normal', value: '500' },
              { label: 'Semi', value: '600' },
              { label: 'Fuerte', value: '700' },
            ]}
            value={theme.typography.pesoTitulo}
            onChange={(pesoTitulo) => setTypography({ pesoTitulo })}
          />
        </Field>
      </Section>

      <Section title="Forma y líneas">
        <Field label="Redondeo">
          <Choices options={RADIUS_OPTIONS} value={theme.shape.radio} onChange={(radio) => setShape({ radio })} />
        </Field>
        <Field label="Grosor de línea">
          <Choices options={BORDER_OPTIONS} value={theme.shape.grosorBorde} onChange={(grosorBorde) => setShape({ grosorBorde })} />
        </Field>
        <Field label="Sombra">
          <Choices options={SHADOW_OPTIONS} value={theme.shape.sombra} onChange={(sombra) => setShape({ sombra })} />
        </Field>
      </Section>

      <button
        onClick={() => apply(DEFAULT_THEME)}
        className="w-full text-[11px] text-slate-500 hover:text-slate-300 py-1.5 rounded border border-slate-800 hover:border-slate-600 transition-colors"
      >
        Restablecer el tema por defecto
      </button>

      {children}
    </div>
  );
}

/** El mismo editor, enlazado al tema del constructor. */
export function ThemePanel() {
  const state = useBuilderState();
  const dispatch = useBuilderDispatch();
  return (
    <ThemeEditor
      theme={state.theme}
      onChange={(theme) => dispatch({ type: 'SET_THEME', theme })}
    />
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h3 className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">{title}</h3>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-[11px] text-slate-400">{label}</span>
      {children}
    </label>
  );
}

function Choices({
  options,
  value,
  onChange,
}: {
  options: { label: string; value: string }[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1">
      {options.map((option) => (
        <button
          key={option.value}
          onClick={() => onChange(option.value)}
          className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors
            ${value === option.value
              ? 'bg-blue-600 text-white'
              : 'bg-slate-800 text-slate-400 hover:text-slate-200'}`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
