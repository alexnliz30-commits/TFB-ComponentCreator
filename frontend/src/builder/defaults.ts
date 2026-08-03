import type { BlockType } from './types';

export interface BlockDefinition {
  type: BlockType;
  label: string;
  icon: string;
  isContainer: boolean;
  tab: 'html' | 'ui';
  category: string;
  defaultProps: Record<string, string>;
}

export const HTML_CATEGORIES = [
  { key: 'layout', label: 'Estructura' },
  { key: 'texto', label: 'Texto' },
  { key: 'formulario', label: 'Formulario' },
  { key: 'tabla', label: 'Tabla y listas' },
  { key: 'media', label: 'Media' },
];

export const UI_CATEGORIES = [
  { key: 'navegacion', label: 'Navegación' },
  { key: 'datos', label: 'Visualización de datos' },
  { key: 'feedback', label: 'Feedback' },
  { key: 'overlay', label: 'Overlay' },
  { key: 'formulario-ui', label: 'Formulario avanzado' },
  { key: 'layout-ui', label: 'Layout' },
  { key: 'acciones', label: 'Acciones' },
];

export const BLOCK_DEFINITIONS: BlockDefinition[] = [
  // ═══════════════════════════════════════════
  // HTML TAB
  // ═══════════════════════════════════════════

  // ── Estructura ──
  { type: 'div', label: 'Div', icon: '⬜', isContainer: true, tab: 'html', category: 'layout', defaultProps: { className: 'p-4' } },
  { type: 'section', label: 'Section', icon: '▣', isContainer: true, tab: 'html', category: 'layout', defaultProps: { className: 'p-6 space-y-4' } },
  { type: 'header', label: 'Header', icon: '▔', isContainer: true, tab: 'html', category: 'layout', defaultProps: { className: 'px-6 py-4' } },
  { type: 'footer', label: 'Footer', icon: '▁', isContainer: true, tab: 'html', category: 'layout', defaultProps: { className: 'px-6 py-4 text-sm text-[color:var(--vz-texto-suave)]' } },
  { type: 'main', label: 'Main', icon: '◻', isContainer: true, tab: 'html', category: 'layout', defaultProps: { className: 'p-6' } },
  { type: 'aside', label: 'Aside', icon: '◧', isContainer: true, tab: 'html', category: 'layout', defaultProps: { className: 'p-4 bg-[var(--vz-superficie-alt)]' } },
  // `prose` es del plugin @tailwindcss/typography, que no está instalado: la
  // clase no tenía regla y el bloque nacía sin estilo ninguno.
  { type: 'article', label: 'Article', icon: '▤', isContainer: true, tab: 'html', category: 'layout', defaultProps: { className: 'space-y-3 max-w-prose' } },
  { type: 'nav-html', label: 'Nav', icon: '☰', isContainer: true, tab: 'html', category: 'layout', defaultProps: { className: 'flex gap-4 px-4 py-3' } },

  // ── Texto ──
  { type: 'h1', label: 'H1', icon: 'H1', isContainer: false, tab: 'html', category: 'texto', defaultProps: { text: 'Heading 1', className: 'text-4xl font-bold' } },
  { type: 'h2', label: 'H2', icon: 'H2', isContainer: false, tab: 'html', category: 'texto', defaultProps: { text: 'Heading 2', className: 'text-3xl font-bold' } },
  { type: 'h3', label: 'H3', icon: 'H3', isContainer: false, tab: 'html', category: 'texto', defaultProps: { text: 'Heading 3', className: 'text-2xl font-semibold' } },
  { type: 'h4', label: 'H4', icon: 'H4', isContainer: false, tab: 'html', category: 'texto', defaultProps: { text: 'Heading 4', className: 'text-xl font-semibold' } },
  { type: 'h5', label: 'H5', icon: 'H5', isContainer: false, tab: 'html', category: 'texto', defaultProps: { text: 'Heading 5', className: 'text-lg font-medium' } },
  { type: 'h6', label: 'H6', icon: 'H6', isContainer: false, tab: 'html', category: 'texto', defaultProps: { text: 'Heading 6', className: 'text-base font-medium' } },
  { type: 'p', label: 'Párrafo', icon: 'P', isContainer: false, tab: 'html', category: 'texto', defaultProps: { text: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit.', className: 'text-[color:var(--vz-texto-suave)] leading-relaxed' } },
  { type: 'span', label: 'Span', icon: 'S', isContainer: false, tab: 'html', category: 'texto', defaultProps: { text: 'Texto inline', className: '' } },
  { type: 'a', label: 'Enlace', icon: '🔗', isContainer: false, tab: 'html', category: 'texto', defaultProps: { text: 'Enlace', href: '#', className: 'text-[color:var(--vz-primario)] hover:underline' } },
  { type: 'strong', label: 'Bold', icon: 'B', isContainer: false, tab: 'html', category: 'texto', defaultProps: { text: 'Texto en negrita', className: 'font-bold' } },
  { type: 'em', label: 'Italic', icon: 'I', isContainer: false, tab: 'html', category: 'texto', defaultProps: { text: 'Texto en cursiva', className: 'italic' } },
  { type: 'code', label: 'Code', icon: '<>', isContainer: false, tab: 'html', category: 'texto', defaultProps: { text: 'const x = 1;', className: 'bg-[var(--vz-superficie-alt)] px-1.5 py-0.5 rounded text-sm font-mono text-pink-600' } },
  { type: 'pre', label: 'Pre', icon: '{}', isContainer: false, tab: 'html', category: 'texto', defaultProps: { text: 'function hello() {\n  return "world";\n}', className: 'bg-slate-900 text-slate-100 p-4 rounded-[var(--vz-radio)] text-sm font-mono overflow-x-auto' } },
  { type: 'blockquote', label: 'Cita', icon: '"', isContainer: false, tab: 'html', category: 'texto', defaultProps: { text: 'La simplicidad es la máxima sofisticación.', className: 'border-l-4 border-[color:var(--vz-borde)] pl-4 italic text-[color:var(--vz-texto-suave)]' } },
  { type: 'hr', label: 'Separador', icon: '—', isContainer: false, tab: 'html', category: 'texto', defaultProps: { className: 'border-t border-[color:var(--vz-borde)] my-4' } },

  // ── Formulario HTML ──
  { type: 'form', label: 'Form', icon: '📋', isContainer: true, tab: 'html', category: 'formulario', defaultProps: { className: 'space-y-4' } },
  { type: 'input', label: 'Input', icon: '▭', isContainer: false, tab: 'html', category: 'formulario', defaultProps: { placeholder: 'Escribe aquí…', inputType: 'text', label: 'Campo', className: 'w-full border border-[color:var(--vz-borde)] rounded-[var(--vz-radio)] px-3 py-2 text-sm' } },
  { type: 'textarea', label: 'Textarea', icon: '▥', isContainer: false, tab: 'html', category: 'formulario', defaultProps: { placeholder: 'Escribe aquí…', label: 'Descripción', rows: '4', className: 'w-full border border-[color:var(--vz-borde)] rounded-[var(--vz-radio)] px-3 py-2 text-sm' } },
  { type: 'select', label: 'Select', icon: '▾', isContainer: false, tab: 'html', category: 'formulario', defaultProps: { label: 'Selecciona', options: 'Opción 1,Opción 2,Opción 3', className: 'w-full border border-[color:var(--vz-borde)] rounded-[var(--vz-radio)] px-3 py-2 text-sm' } },
  { type: 'label', label: 'Label', icon: 'L', isContainer: false, tab: 'html', category: 'formulario', defaultProps: { text: 'Etiqueta', className: 'block text-sm font-medium text-[color:var(--vz-texto)]' } },
  { type: 'button', label: 'Button', icon: '▸', isContainer: false, tab: 'html', category: 'formulario', defaultProps: { text: 'Botón', buttonType: 'button', className: 'bg-[var(--vz-primario)] text-[color:var(--vz-primario-contraste)] px-4 py-2 rounded-[var(--vz-radio)]' } },
  { type: 'fieldset', label: 'Fieldset', icon: '▢', isContainer: true, tab: 'html', category: 'formulario', defaultProps: { legend: 'Grupo de campos', className: 'border border-[color:var(--vz-borde)] rounded-[var(--vz-radio)] p-4' } },

  // ── Tabla y listas ──
  { type: 'table', label: 'Tabla', icon: '▦', isContainer: false, tab: 'html', category: 'tabla', defaultProps: { rows: '3', cols: '3', className: 'w-full border-collapse' } },
  { type: 'ul', label: 'Lista (ul)', icon: '•', isContainer: false, tab: 'html', category: 'tabla', defaultProps: { items: 'Elemento 1,Elemento 2,Elemento 3', className: 'list-disc list-inside space-y-1 text-[color:var(--vz-texto-suave)]' } },
  { type: 'ol', label: 'Lista (ol)', icon: '1.', isContainer: false, tab: 'html', category: 'tabla', defaultProps: { items: 'Primero,Segundo,Tercero', className: 'list-decimal list-inside space-y-1 text-[color:var(--vz-texto-suave)]' } },
  { type: 'dl', label: 'Def. List', icon: 'DL', isContainer: false, tab: 'html', category: 'tabla', defaultProps: { items: 'Término:Definición,Clave:Valor', className: 'space-y-2' } },

  // ── Media ──
  { type: 'img', label: 'Imagen', icon: '🖼', isContainer: false, tab: 'html', category: 'media', defaultProps: { src: 'https://placehold.co/600x300/e2e8f0/64748b?text=Imagen', alt: 'Imagen', className: 'rounded-[var(--vz-radio)] max-w-full' } },
  { type: 'video', label: 'Vídeo', icon: '▶', isContainer: false, tab: 'html', category: 'media', defaultProps: { src: '', className: 'rounded-[var(--vz-radio)] w-full' } },
  { type: 'audio', label: 'Audio', icon: '♪', isContainer: false, tab: 'html', category: 'media', defaultProps: { src: '', className: 'w-full' } },
  { type: 'iframe', label: 'iFrame', icon: '⧉', isContainer: false, tab: 'html', category: 'media', defaultProps: { src: 'about:blank', className: 'w-full h-48 rounded-[var(--vz-radio)] border border-[color:var(--vz-borde)]' } },

  // ═══════════════════════════════════════════
  // UI COMPONENTS TAB
  // ═══════════════════════════════════════════

  // ── Navegación ──
  { type: 'navbar', label: 'Navbar', icon: '☰', isContainer: true, tab: 'ui', category: 'navegacion', defaultProps: { brand: 'Marca', items: 'Inicio,Productos,Contacto', className: 'flex items-center justify-between bg-[var(--vz-superficie)] border-b px-6 py-3' } },
  { type: 'sidebar', label: 'Sidebar', icon: '◧', isContainer: true, tab: 'ui', category: 'navegacion', defaultProps: { items: 'Dashboard,Usuarios,Configuración,Reportes', className: 'w-56 bg-slate-900 text-[color:var(--vz-primario-contraste)] min-h-[200px] p-2' } },
  { type: 'breadcrumb', label: 'Breadcrumb', icon: '>', isContainer: false, tab: 'ui', category: 'navegacion', defaultProps: { items: 'Inicio,Productos,Detalle', className: 'flex items-center gap-2 text-sm' } },
  { type: 'tabs', label: 'Tabs', icon: '⊞', isContainer: false, tab: 'ui', category: 'navegacion', defaultProps: { items: 'General,Ajustes,Avanzado', className: 'flex border-b border-[color:var(--vz-borde)]' } },
  { type: 'pagination', label: 'Paginación', icon: '⟨⟩', isContainer: false, tab: 'ui', category: 'navegacion', defaultProps: { pages: '5', current: '1', className: 'flex items-center gap-1' } },
  { type: 'stepper', label: 'Stepper', icon: '①②③', isContainer: false, tab: 'ui', category: 'navegacion', defaultProps: { items: 'Datos,Pago,Confirmación', current: '2', className: 'flex items-center gap-4' } },
  { type: 'menu', label: 'Menú', icon: '≡', isContainer: false, tab: 'ui', category: 'navegacion', defaultProps: { items: 'Perfil,Configuración,—,Cerrar sesión', className: 'bg-[var(--vz-superficie)] border border-[color:var(--vz-borde)] rounded-[var(--vz-radio)] shadow-lg py-1 w-48' } },

  // ── Visualización de datos ──
  { type: 'card', label: 'Card', icon: '🃏', isContainer: true, tab: 'ui', category: 'datos', defaultProps: { className: 'bg-[var(--vz-superficie)] rounded-[var(--vz-radio)] shadow-sm border border-[color:var(--vz-borde)] p-5' } },
  { type: 'stat', label: 'Estadística', icon: '📊', isContainer: false, tab: 'ui', category: 'datos', defaultProps: { label: 'Usuarios', value: '2,847', change: '+12.5%', className: '' } },
  { type: 'avatar', label: 'Avatar', icon: '👤', isContainer: false, tab: 'ui', category: 'datos', defaultProps: { src: 'https://placehold.co/80/6366f1/fff?text=AB', alt: 'Avatar', size: 'md', className: '' } },
  { type: 'badge', label: 'Badge', icon: '●', isContainer: false, tab: 'ui', category: 'datos', defaultProps: { text: 'Nuevo', variant: 'blue', className: '' } },
  { type: 'tag', label: 'Tag', icon: '🏷', isContainer: false, tab: 'ui', category: 'datos', defaultProps: { text: 'React', className: 'inline-flex items-center gap-1 bg-[var(--vz-superficie-alt)] text-[color:var(--vz-texto)] text-xs font-medium px-2.5 py-1 rounded-[var(--vz-radio)]' } },
  { type: 'tooltip', label: 'Tooltip', icon: '💬', isContainer: false, tab: 'ui', category: 'datos', defaultProps: { text: 'Hover me', tooltip: 'Información adicional', className: '' } },
  { type: 'timeline', label: 'Timeline', icon: '⏱', isContainer: false, tab: 'ui', category: 'datos', defaultProps: { items: 'Creado:Hace 2h,Aprobado:Hace 1h,Enviado:Ahora', className: '' } },
  { type: 'empty', label: 'Empty State', icon: '∅', isContainer: false, tab: 'ui', category: 'datos', defaultProps: { title: 'No hay datos', text: 'Aún no se han creado elementos.', className: '' } },
  { type: 'list-ui', label: 'List', icon: '☰', isContainer: false, tab: 'ui', category: 'datos', defaultProps: { items: 'María García:admin@mail.com,Juan López:juan@mail.com,Ana Ruiz:ana@mail.com', className: '' } },
  { type: 'table-ui', label: 'Data Table', icon: '▦', isContainer: false, tab: 'ui', category: 'datos', defaultProps: { headers: 'Nombre,Email,Rol', rows: 'María García:admin@mail.com:Admin,Juan López:juan@mail.com:Editor', className: '' } },
  { type: 'calendar', label: 'Calendario', icon: '📅', isContainer: false, tab: 'ui', category: 'datos', defaultProps: { className: '' } },

  // ── Feedback ──
  { type: 'alert', label: 'Alert', icon: '⚠', isContainer: false, tab: 'ui', category: 'feedback', defaultProps: { text: 'Operación completada con éxito.', variant: 'success', className: '' } },
  { type: 'toast', label: 'Toast', icon: '🔔', isContainer: false, tab: 'ui', category: 'feedback', defaultProps: { text: 'Cambios guardados', variant: 'success', className: '' } },
  { type: 'progress', label: 'Progress Bar', icon: '▰', isContainer: false, tab: 'ui', category: 'feedback', defaultProps: { value: '65', label: 'Progreso', className: '' } },
  { type: 'spinner', label: 'Spinner', icon: '◌', isContainer: false, tab: 'ui', category: 'feedback', defaultProps: { size: 'md', className: '' } },
  { type: 'skeleton', label: 'Skeleton', icon: '▒', isContainer: false, tab: 'ui', category: 'feedback', defaultProps: { lines: '3', className: '' } },
  { type: 'result', label: 'Result', icon: '✓', isContainer: false, tab: 'ui', category: 'feedback', defaultProps: { variant: 'success', title: 'Pago completado', text: 'Tu pedido #1234 ha sido procesado.', className: '' } },

  // ── Overlay ──
  { type: 'modal', label: 'Modal', icon: '◫', isContainer: true, tab: 'ui', category: 'overlay', defaultProps: { title: 'Título del modal', className: 'bg-[var(--vz-superficie)] rounded-[var(--vz-radio)] shadow-2xl p-6 max-w-md border border-[color:var(--vz-borde)]' } },
  { type: 'drawer', label: 'Drawer', icon: '◨', isContainer: true, tab: 'ui', category: 'overlay', defaultProps: { title: 'Panel lateral', className: 'bg-[var(--vz-superficie)] shadow-xl p-6 w-80 min-h-[200px] border-l' } },
  { type: 'popover', label: 'Popover', icon: '◲', isContainer: false, tab: 'ui', category: 'overlay', defaultProps: { text: 'Clic aquí', content: 'Contenido del popover con más información.', className: '' } },
  { type: 'dialog', label: 'Dialog', icon: '⊡', isContainer: false, tab: 'ui', category: 'overlay', defaultProps: { title: '¿Estás seguro?', text: 'Esta acción no se puede deshacer.', className: '' } },

  // ── Formulario avanzado UI ──
  { type: 'checkbox', label: 'Checkbox', icon: '☑', isContainer: false, tab: 'ui', category: 'formulario-ui', defaultProps: { label: 'Acepto los términos', className: '' } },
  { type: 'radio', label: 'Radio Group', icon: '◉', isContainer: false, tab: 'ui', category: 'formulario-ui', defaultProps: { label: 'Selecciona', options: 'Opción A,Opción B,Opción C', name: 'grupo1', className: '' } },
  { type: 'switch', label: 'Switch', icon: '⊘', isContainer: false, tab: 'ui', category: 'formulario-ui', defaultProps: { label: 'Activar notificaciones', checked: 'true', className: '' } },
  { type: 'slider', label: 'Slider', icon: '⊶', isContainer: false, tab: 'ui', category: 'formulario-ui', defaultProps: { min: '0', max: '100', value: '50', label: 'Volumen', className: '' } },
  { type: 'file-upload', label: 'File Upload', icon: '📎', isContainer: false, tab: 'ui', category: 'formulario-ui', defaultProps: { text: 'Arrastra archivos o haz clic', accept: '.pdf,.jpg,.png', className: '' } },
  { type: 'rating', label: 'Rating', icon: '⭐', isContainer: false, tab: 'ui', category: 'formulario-ui', defaultProps: { value: '4', max: '5', className: '' } },
  { type: 'search', label: 'Search', icon: '🔍', isContainer: false, tab: 'ui', category: 'formulario-ui', defaultProps: { placeholder: 'Buscar...', className: '' } },
  { type: 'date-picker', label: 'Date Picker', icon: '📅', isContainer: false, tab: 'ui', category: 'formulario-ui', defaultProps: { label: 'Fecha', className: '' } },

  // ── Layout UI ──
  { type: 'divider', label: 'Divider', icon: '—', isContainer: false, tab: 'ui', category: 'layout-ui', defaultProps: { text: '', className: '' } },
  { type: 'spacer', label: 'Spacer', icon: '↕', isContainer: false, tab: 'ui', category: 'layout-ui', defaultProps: { size: '32', className: '' } },
  { type: 'grid', label: 'Grid', icon: '⊞', isContainer: true, tab: 'ui', category: 'layout-ui', defaultProps: { cols: '3', gap: '4', className: '' } },
  { type: 'flex', label: 'Flex', icon: '↔', isContainer: true, tab: 'ui', category: 'layout-ui', defaultProps: { direction: 'row', gap: '4', className: '' } },
  { type: 'accordion', label: 'Accordion', icon: '▼', isContainer: false, tab: 'ui', category: 'layout-ui', defaultProps: { items: 'Sección 1:Contenido de la primera sección,Sección 2:Contenido de la segunda sección,Sección 3:Contenido de la tercera sección', className: '' } },
  { type: 'collapse', label: 'Collapse', icon: '▾', isContainer: true, tab: 'ui', category: 'layout-ui', defaultProps: { title: 'Más información', className: 'border border-[color:var(--vz-borde)] rounded-[var(--vz-radio)]' } },

  // ── Acciones ──
  { type: 'button-group', label: 'Button Group', icon: '▸▸', isContainer: false, tab: 'ui', category: 'acciones', defaultProps: { items: 'Guardar,Cancelar,Eliminar', className: '' } },
  { type: 'dropdown', label: 'Dropdown', icon: '▿', isContainer: false, tab: 'ui', category: 'acciones', defaultProps: { text: 'Opciones', items: 'Editar,Duplicar,Eliminar', className: '' } },
  { type: 'fab', label: 'FAB', icon: '+', isContainer: false, tab: 'ui', category: 'acciones', defaultProps: { icon: '+', className: '' } },
  { type: 'icon-button', label: 'Icon Button', icon: '◉', isContainer: false, tab: 'ui', category: 'acciones', defaultProps: { icon: '✕', className: '' } },
  { type: 'cta', label: 'CTA Banner', icon: '📢', isContainer: false, tab: 'ui', category: 'acciones', defaultProps: { title: 'Empieza ahora', text: 'Regístrate gratis y accede a todas las funcionalidades.', buttonText: 'Registrarse', className: '' } },
];

export function getDefinition(type: BlockType): BlockDefinition {
  return BLOCK_DEFINITIONS.find((d) => d.type === type) ?? BLOCK_DEFINITIONS[0];
}
