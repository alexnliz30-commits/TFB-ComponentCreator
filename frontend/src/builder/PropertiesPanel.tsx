import { useState } from 'react';
import { useBuilderState, useBuilderDispatch } from './useBuilderStore';
import { getDefinition } from './defaults';
import { BlockActionsSection, StateVarsSection, VisibilitySection } from './ActionsPanel';
import { Field, Section, SelectField } from './panel-ui';
import {
  BREAKPOINTS, BROWSERS, STYLE_SECTIONS,
  getDeviceVisibility, getUtility, parseBrowsers, serializeBrowsers, setDeviceVisibility, setUtility,
  type Breakpoint, type BrowserKey,
} from './style-utils';

/** Claves de contenido con control select y opciones fijas. */
const SELECT_PROPS: Record<string, { label: string; options: { value: string; label: string }[] }> = {
  level: { label: 'Nivel de título', options: ['1', '2', '3', '4', '5', '6'].map((l) => ({ value: l, label: `h${l}` })) },
  inputType: { label: 'Tipo de input', options: ['text', 'email', 'password', 'number', 'tel', 'url', 'date'].map((t) => ({ value: t, label: t })) },
  variant: { label: 'Variante', options: ['info', 'success', 'warning', 'error', 'blue', 'green', 'red', 'amber', 'slate'].map((v) => ({ value: v, label: v })) },
  size: { label: 'Tamaño', options: ['sm', 'md', 'lg'].map((v) => ({ value: v, label: v })) },
  direction: { label: 'Dirección', options: [{ value: 'row', label: 'Horizontal' }, { value: 'col', label: 'Vertical' }] },
};

/** Etiquetas en castellano para los campos de contenido de texto libre. */
const TEXT_PROP_LABELS: Record<string, string> = {
  text: 'Texto',
  label: 'Etiqueta',
  placeholder: 'Placeholder',
  title: 'Título',
  items: 'Elementos (separados por coma)',
  options: 'Opciones (separadas por coma)',
  href: 'Enlace (href)',
  src: 'URL del recurso',
  alt: 'Texto alternativo',
  name: 'Nombre de grupo',
  legend: 'Leyenda',
  brand: 'Marca',
  buttonText: 'Texto del botón',
  tooltip: 'Texto del tooltip',
  content: 'Contenido',
  change: 'Variación (+/-)',
  headers: 'Cabeceras (separadas por coma)',
  value: 'Valor',
  min: 'Mínimo',
  max: 'Máximo',
  rows: 'Filas',
  cols: 'Columnas',
  pages: 'Nº de páginas',
  current: 'Página/paso actual',
  lines: 'Líneas',
  icon: 'Icono',
  accept: 'Tipos aceptados',
  gap: 'Separación',
  checked: 'Activado (true/false)',
};

export function PropertiesPanel() {
  const state = useBuilderState();
  const dispatch = useBuilderDispatch();
  const [breakpoint, setBreakpoint] = useState<Breakpoint>('');
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({ contenido: true, layout: true });

  // El estado del componente es de lienzo, no de bloque: se ofrece siempre,
  // incluso sin selección, porque es lo primero que hay que declarar para poder
  // configurar cualquier acción.
  if (!state.selectedId) {
    return (
      <div className="p-4 space-y-4 pb-8">
        <StateVarsSection open={!!openSections.estado} onToggle={() => toggleSection('estado')} />
        <p className="text-xs text-slate-500 text-center px-2">
          Selecciona un bloque para editar sus propiedades.
        </p>
      </div>
    );
  }

  const block = state.blocks[state.selectedId];
  if (!block) return null;

  const def = getDefinition(block.type);
  const className = block.props.className || '';

  function update(key: string, value: string) {
    dispatch({ type: 'UPDATE_PROPS', id: block.id, props: { [key]: value } });
  }

  function updateClass(newClassName: string) {
    update('className', newClassName);
  }

  function toggleSection(key: string) {
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  const visibility = getDeviceVisibility(className);
  const browsers = parseBrowsers(block.props.browsers);

  // `bindTo` y `browsers` tienen sus propios controles en otras secciones.
  const contentKeys = Object.keys(block.props).filter(
    (k) => k !== 'className' && k !== 'browsers' && k !== 'bindTo',
  );

  return (
    <div className="p-4 space-y-4 pb-8">
      <div className="flex items-center gap-2">
        <span className="text-base">{def.icon}</span>
        <div>
          <h3 className="text-sm font-semibold text-slate-200 leading-none">{def.label}</h3>
          <p className="text-[10px] text-slate-500 mt-0.5">{block.type}</p>
        </div>
      </div>

      <StateVarsSection open={!!openSections.estado} onToggle={() => toggleSection('estado')} />

      <BlockActionsSection
        blockId={block.id}
        open={!!openSections.acciones}
        onToggle={() => toggleSection('acciones')}
      />

      <VisibilitySection
        blockId={block.id}
        open={!!openSections.comportamiento}
        onToggle={() => toggleSection('comportamiento')}
      />

      {/* ── Contenido ── */}
      <Section title="Contenido" open={!!openSections.contenido} onToggle={() => toggleSection('contenido')}>
        {contentKeys.length === 0 && <p className="text-[11px] text-slate-500">Este bloque no tiene propiedades de contenido.</p>}
        {contentKeys.map((key) => {
          const select = SELECT_PROPS[key];
          if (select) {
            return (
              <SelectField
                key={key}
                label={select.label}
                value={block.props[key]}
                options={select.options}
                onChange={(v) => update(key, v)}
              />
            );
          }
          const long = (block.props[key] || '').length > 40 || key === 'items' || key === 'options' || key === 'rows';
          return (
            <Field
              key={key}
              label={TEXT_PROP_LABELS[key] ?? key}
              value={block.props[key]}
              onChange={(v) => update(key, v)}
              textarea={long}
            />
          );
        })}
      </Section>

      {/* ── Selector de breakpoint para las propiedades de estilo ── */}
      <div className="bg-slate-800/70 rounded-lg p-2.5 space-y-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Editar estilos para</span>
        <div className="flex gap-1">
          {BREAKPOINTS.map((bp) => (
            <button
              key={bp.key || 'base'}
              onClick={() => setBreakpoint(bp.key)}
              title={bp.hint}
              className={`flex-1 px-1 py-1 rounded text-[10px] font-medium transition-colors
                ${breakpoint === bp.key ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}
            >
              {bp.label}
            </button>
          ))}
        </div>
        <p className="text-[10px] text-slate-500 leading-snug">
          {BREAKPOINTS.find((b) => b.key === breakpoint)?.hint}. Tailwind es mobile-first: lo definido en un
          breakpoint aplica también a los superiores.
        </p>
      </div>

      {/* ── Secciones de estilo ── */}
      {STYLE_SECTIONS.map((section) => (
        <Section
          key={section.key}
          title={section.label}
          open={!!openSections[section.key]}
          onToggle={() => toggleSection(section.key)}
        >
          {section.groups.map((group) => (
            <SelectField
              key={group.key}
              label={group.label}
              value={getUtility(className, breakpoint, group.matcher)}
              options={group.options}
              allowEmpty
              onChange={(v) => updateClass(setUtility(className, breakpoint, group.matcher, v))}
            />
          ))}
        </Section>
      ))}

      {/* ── Visibilidad por dispositivo ── */}
      <Section title="Visibilidad por dispositivo" open={!!openSections.visibility} onToggle={() => toggleSection('visibility')}>
        <p className="text-[10px] text-slate-500 leading-snug mb-1">
          Controla en qué dispositivos se muestra el bloque (clases hidden / md: / lg:).
        </p>
        {([
          ['mobile', 'Móvil (< 768 px)'],
          ['tablet', 'Tablet (≥ 768 px)'],
          ['desktop', 'Escritorio (≥ 1024 px)'],
        ] as const).map(([key, label]) => (
          <label key={key} className="flex items-center justify-between gap-2 text-xs text-slate-300 py-0.5 cursor-pointer">
            {label}
            <input
              type="checkbox"
              checked={visibility[key]}
              onChange={(e) => updateClass(setDeviceVisibility(className, { ...visibility, [key]: e.target.checked }))}
              className="w-3.5 h-3.5 accent-blue-500"
            />
          </label>
        ))}
      </Section>

      {/* ── Navegadores compatibles ── */}
      <Section title="Navegadores" open={!!openSections.browsers} onToggle={() => toggleSection('browsers')}>
        <p className="text-[10px] text-slate-500 leading-snug mb-1">
          Declara en qué navegadores debe mostrarse el bloque. Se exporta como atributo
          <code className="text-slate-400"> data-browsers</code> para que la aplicación anfitriona lo aplique en runtime.
        </p>
        <div className="grid grid-cols-2 gap-1.5">
          {BROWSERS.map((browser) => {
            const active = browsers.includes(browser.key);
            return (
              <button
                key={browser.key}
                onClick={() => {
                  const next: BrowserKey[] = active
                    ? browsers.filter((b) => b !== browser.key)
                    : [...browsers, browser.key];
                  if (next.length === 0) return; // al menos un navegador
                  update('browsers', serializeBrowsers(next));
                }}
                className={`px-2 py-1.5 rounded-md text-[11px] font-medium transition-colors
                  ${active ? 'bg-blue-600/20 text-blue-300 ring-1 ring-blue-500/50' : 'bg-slate-800 text-slate-500 hover:text-slate-300'}`}
              >
                {active ? '✓ ' : ''}{browser.label}
              </button>
            );
          })}
        </div>
      </Section>

      {/* ── Escape hatch: clases Tailwind directas ── */}
      <Section title="Clases Tailwind (avanzado)" open={!!openSections.advanced} onToggle={() => toggleSection('advanced')}>
        <Field label="className" value={className} onChange={updateClass} textarea />
      </Section>
    </div>
  );
}

