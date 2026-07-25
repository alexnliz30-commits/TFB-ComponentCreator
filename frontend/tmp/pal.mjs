// src/builder/defaults.ts
var BLOCK_DEFINITIONS = [
  // ═══════════════════════════════════════════
  // HTML TAB
  // ═══════════════════════════════════════════
  // ── Estructura ──
  { type: "div", label: "Div", icon: "\u2B1C", isContainer: true, tab: "html", category: "layout", defaultProps: { className: "p-4" } },
  { type: "section", label: "Section", icon: "\u25A3", isContainer: true, tab: "html", category: "layout", defaultProps: { className: "p-6 space-y-4" } },
  { type: "header", label: "Header", icon: "\u2594", isContainer: true, tab: "html", category: "layout", defaultProps: { className: "px-6 py-4" } },
  { type: "footer", label: "Footer", icon: "\u2581", isContainer: true, tab: "html", category: "layout", defaultProps: { className: "px-6 py-4 text-sm text-[color:var(--vz-texto-suave)]" } },
  { type: "main", label: "Main", icon: "\u25FB", isContainer: true, tab: "html", category: "layout", defaultProps: { className: "p-6" } },
  { type: "aside", label: "Aside", icon: "\u25E7", isContainer: true, tab: "html", category: "layout", defaultProps: { className: "p-4 bg-[var(--vz-superficie-alt)]" } },
  // `prose` es del plugin @tailwindcss/typography, que no está instalado: la
  // clase no tenía regla y el bloque nacía sin estilo ninguno.
  { type: "article", label: "Article", icon: "\u25A4", isContainer: true, tab: "html", category: "layout", defaultProps: { className: "space-y-3 max-w-prose" } },
  { type: "nav-html", label: "Nav", icon: "\u2630", isContainer: true, tab: "html", category: "layout", defaultProps: { className: "flex gap-4 px-4 py-3" } },
  // ── Texto ──
  { type: "h1", label: "H1", icon: "H1", isContainer: false, tab: "html", category: "texto", defaultProps: { text: "Heading 1", className: "text-4xl font-bold" } },
  { type: "h2", label: "H2", icon: "H2", isContainer: false, tab: "html", category: "texto", defaultProps: { text: "Heading 2", className: "text-3xl font-bold" } },
  { type: "h3", label: "H3", icon: "H3", isContainer: false, tab: "html", category: "texto", defaultProps: { text: "Heading 3", className: "text-2xl font-semibold" } },
  { type: "h4", label: "H4", icon: "H4", isContainer: false, tab: "html", category: "texto", defaultProps: { text: "Heading 4", className: "text-xl font-semibold" } },
  { type: "h5", label: "H5", icon: "H5", isContainer: false, tab: "html", category: "texto", defaultProps: { text: "Heading 5", className: "text-lg font-medium" } },
  { type: "h6", label: "H6", icon: "H6", isContainer: false, tab: "html", category: "texto", defaultProps: { text: "Heading 6", className: "text-base font-medium" } },
  { type: "p", label: "P\xE1rrafo", icon: "P", isContainer: false, tab: "html", category: "texto", defaultProps: { text: "Lorem ipsum dolor sit amet, consectetur adipiscing elit.", className: "text-[color:var(--vz-texto-suave)] leading-relaxed" } },
  { type: "span", label: "Span", icon: "S", isContainer: false, tab: "html", category: "texto", defaultProps: { text: "Texto inline", className: "" } },
  { type: "a", label: "Enlace", icon: "\u{1F517}", isContainer: false, tab: "html", category: "texto", defaultProps: { text: "Enlace", href: "#", className: "text-[color:var(--vz-primario)] hover:underline" } },
  { type: "strong", label: "Bold", icon: "B", isContainer: false, tab: "html", category: "texto", defaultProps: { text: "Texto en negrita", className: "font-bold" } },
  { type: "em", label: "Italic", icon: "I", isContainer: false, tab: "html", category: "texto", defaultProps: { text: "Texto en cursiva", className: "italic" } },
  { type: "code", label: "Code", icon: "<>", isContainer: false, tab: "html", category: "texto", defaultProps: { text: "const x = 1;", className: "bg-[var(--vz-superficie-alt)] px-1.5 py-0.5 rounded text-sm font-mono text-pink-600" } },
  { type: "pre", label: "Pre", icon: "{}", isContainer: false, tab: "html", category: "texto", defaultProps: { text: 'function hello() {\n  return "world";\n}', className: "bg-slate-900 text-slate-100 p-4 rounded-[var(--vz-radio)] text-sm font-mono overflow-x-auto" } },
  { type: "blockquote", label: "Cita", icon: '"', isContainer: false, tab: "html", category: "texto", defaultProps: { text: "La simplicidad es la m\xE1xima sofisticaci\xF3n.", className: "border-l-4 border-[color:var(--vz-borde)] pl-4 italic text-[color:var(--vz-texto-suave)]" } },
  { type: "hr", label: "Separador", icon: "\u2014", isContainer: false, tab: "html", category: "texto", defaultProps: { className: "border-t border-[color:var(--vz-borde)] my-4" } },
  // ── Formulario HTML ──
  { type: "form", label: "Form", icon: "\u{1F4CB}", isContainer: true, tab: "html", category: "formulario", defaultProps: { className: "space-y-4" } },
  { type: "input", label: "Input", icon: "\u25AD", isContainer: false, tab: "html", category: "formulario", defaultProps: { placeholder: "Escribe aqu\xED\u2026", inputType: "text", label: "Campo", className: "w-full border border-[color:var(--vz-borde)] rounded-[var(--vz-radio)] px-3 py-2 text-sm" } },
  { type: "textarea", label: "Textarea", icon: "\u25A5", isContainer: false, tab: "html", category: "formulario", defaultProps: { placeholder: "Escribe aqu\xED\u2026", label: "Descripci\xF3n", rows: "4", className: "w-full border border-[color:var(--vz-borde)] rounded-[var(--vz-radio)] px-3 py-2 text-sm" } },
  { type: "select", label: "Select", icon: "\u25BE", isContainer: false, tab: "html", category: "formulario", defaultProps: { label: "Selecciona", options: "Opci\xF3n 1,Opci\xF3n 2,Opci\xF3n 3", className: "w-full border border-[color:var(--vz-borde)] rounded-[var(--vz-radio)] px-3 py-2 text-sm" } },
  { type: "label", label: "Label", icon: "L", isContainer: false, tab: "html", category: "formulario", defaultProps: { text: "Etiqueta", className: "block text-sm font-medium text-[color:var(--vz-texto)]" } },
  { type: "button", label: "Button", icon: "\u25B8", isContainer: false, tab: "html", category: "formulario", defaultProps: { text: "Bot\xF3n", className: "bg-[var(--vz-primario)] text-[color:var(--vz-primario-contraste)] px-4 py-2 rounded-[var(--vz-radio)]" } },
  { type: "fieldset", label: "Fieldset", icon: "\u25A2", isContainer: true, tab: "html", category: "formulario", defaultProps: { legend: "Grupo de campos", className: "border border-[color:var(--vz-borde)] rounded-[var(--vz-radio)] p-4" } },
  // ── Tabla y listas ──
  { type: "table", label: "Tabla", icon: "\u25A6", isContainer: false, tab: "html", category: "tabla", defaultProps: { rows: "3", cols: "3", className: "w-full border-collapse" } },
  { type: "ul", label: "Lista (ul)", icon: "\u2022", isContainer: false, tab: "html", category: "tabla", defaultProps: { items: "Elemento 1,Elemento 2,Elemento 3", className: "list-disc list-inside space-y-1 text-[color:var(--vz-texto-suave)]" } },
  { type: "ol", label: "Lista (ol)", icon: "1.", isContainer: false, tab: "html", category: "tabla", defaultProps: { items: "Primero,Segundo,Tercero", className: "list-decimal list-inside space-y-1 text-[color:var(--vz-texto-suave)]" } },
  { type: "dl", label: "Def. List", icon: "DL", isContainer: false, tab: "html", category: "tabla", defaultProps: { items: "T\xE9rmino:Definici\xF3n,Clave:Valor", className: "space-y-2" } },
  // ── Media ──
  { type: "img", label: "Imagen", icon: "\u{1F5BC}", isContainer: false, tab: "html", category: "media", defaultProps: { src: "https://placehold.co/600x300/e2e8f0/64748b?text=Imagen", alt: "Imagen", className: "rounded-[var(--vz-radio)] max-w-full" } },
  { type: "video", label: "V\xEDdeo", icon: "\u25B6", isContainer: false, tab: "html", category: "media", defaultProps: { src: "", className: "rounded-[var(--vz-radio)] w-full" } },
  { type: "audio", label: "Audio", icon: "\u266A", isContainer: false, tab: "html", category: "media", defaultProps: { src: "", className: "w-full" } },
  { type: "iframe", label: "iFrame", icon: "\u29C9", isContainer: false, tab: "html", category: "media", defaultProps: { src: "about:blank", className: "w-full h-48 rounded-[var(--vz-radio)] border border-[color:var(--vz-borde)]" } },
  // ═══════════════════════════════════════════
  // UI COMPONENTS TAB
  // ═══════════════════════════════════════════
  // ── Navegación ──
  { type: "navbar", label: "Navbar", icon: "\u2630", isContainer: true, tab: "ui", category: "navegacion", defaultProps: { brand: "Marca", items: "Inicio,Productos,Contacto", className: "flex items-center justify-between bg-[var(--vz-superficie)] border-b px-6 py-3" } },
  { type: "sidebar", label: "Sidebar", icon: "\u25E7", isContainer: true, tab: "ui", category: "navegacion", defaultProps: { items: "Dashboard,Usuarios,Configuraci\xF3n,Reportes", className: "w-56 bg-slate-900 text-[color:var(--vz-primario-contraste)] min-h-[200px] p-2" } },
  { type: "breadcrumb", label: "Breadcrumb", icon: ">", isContainer: false, tab: "ui", category: "navegacion", defaultProps: { items: "Inicio,Productos,Detalle", className: "flex items-center gap-2 text-sm" } },
  { type: "tabs", label: "Tabs", icon: "\u229E", isContainer: false, tab: "ui", category: "navegacion", defaultProps: { items: "General,Ajustes,Avanzado", className: "flex border-b border-[color:var(--vz-borde)]" } },
  { type: "pagination", label: "Paginaci\xF3n", icon: "\u27E8\u27E9", isContainer: false, tab: "ui", category: "navegacion", defaultProps: { pages: "5", current: "1", className: "flex items-center gap-1" } },
  { type: "stepper", label: "Stepper", icon: "\u2460\u2461\u2462", isContainer: false, tab: "ui", category: "navegacion", defaultProps: { items: "Datos,Pago,Confirmaci\xF3n", current: "2", className: "flex items-center gap-4" } },
  { type: "menu", label: "Men\xFA", icon: "\u2261", isContainer: false, tab: "ui", category: "navegacion", defaultProps: { items: "Perfil,Configuraci\xF3n,\u2014,Cerrar sesi\xF3n", className: "bg-[var(--vz-superficie)] border border-[color:var(--vz-borde)] rounded-[var(--vz-radio)] shadow-lg py-1 w-48" } },
  // ── Visualización de datos ──
  { type: "card", label: "Card", icon: "\u{1F0CF}", isContainer: true, tab: "ui", category: "datos", defaultProps: { className: "bg-[var(--vz-superficie)] rounded-[var(--vz-radio)] shadow-sm border border-[color:var(--vz-borde)] p-5" } },
  { type: "stat", label: "Estad\xEDstica", icon: "\u{1F4CA}", isContainer: false, tab: "ui", category: "datos", defaultProps: { label: "Usuarios", value: "2,847", change: "+12.5%", className: "" } },
  { type: "avatar", label: "Avatar", icon: "\u{1F464}", isContainer: false, tab: "ui", category: "datos", defaultProps: { src: "https://placehold.co/80/6366f1/fff?text=AB", alt: "Avatar", size: "md", className: "" } },
  { type: "badge", label: "Badge", icon: "\u25CF", isContainer: false, tab: "ui", category: "datos", defaultProps: { text: "Nuevo", variant: "blue", className: "" } },
  { type: "tag", label: "Tag", icon: "\u{1F3F7}", isContainer: false, tab: "ui", category: "datos", defaultProps: { text: "React", className: "inline-flex items-center gap-1 bg-[var(--vz-superficie-alt)] text-[color:var(--vz-texto)] text-xs font-medium px-2.5 py-1 rounded-[var(--vz-radio)]" } },
  { type: "tooltip", label: "Tooltip", icon: "\u{1F4AC}", isContainer: false, tab: "ui", category: "datos", defaultProps: { text: "Hover me", tooltip: "Informaci\xF3n adicional", className: "" } },
  { type: "timeline", label: "Timeline", icon: "\u23F1", isContainer: false, tab: "ui", category: "datos", defaultProps: { items: "Creado:Hace 2h,Aprobado:Hace 1h,Enviado:Ahora", className: "" } },
  { type: "empty", label: "Empty State", icon: "\u2205", isContainer: false, tab: "ui", category: "datos", defaultProps: { title: "No hay datos", text: "A\xFAn no se han creado elementos.", className: "" } },
  { type: "list-ui", label: "List", icon: "\u2630", isContainer: false, tab: "ui", category: "datos", defaultProps: { items: "Mar\xEDa Garc\xEDa:admin@mail.com,Juan L\xF3pez:juan@mail.com,Ana Ruiz:ana@mail.com", className: "" } },
  { type: "table-ui", label: "Data Table", icon: "\u25A6", isContainer: false, tab: "ui", category: "datos", defaultProps: { headers: "Nombre,Email,Rol", rows: "Mar\xEDa Garc\xEDa:admin@mail.com:Admin,Juan L\xF3pez:juan@mail.com:Editor", className: "" } },
  { type: "calendar", label: "Calendario", icon: "\u{1F4C5}", isContainer: false, tab: "ui", category: "datos", defaultProps: { className: "" } },
  // ── Feedback ──
  { type: "alert", label: "Alert", icon: "\u26A0", isContainer: false, tab: "ui", category: "feedback", defaultProps: { text: "Operaci\xF3n completada con \xE9xito.", variant: "success", className: "" } },
  { type: "toast", label: "Toast", icon: "\u{1F514}", isContainer: false, tab: "ui", category: "feedback", defaultProps: { text: "Cambios guardados", variant: "success", className: "" } },
  { type: "progress", label: "Progress Bar", icon: "\u25B0", isContainer: false, tab: "ui", category: "feedback", defaultProps: { value: "65", label: "Progreso", className: "" } },
  { type: "spinner", label: "Spinner", icon: "\u25CC", isContainer: false, tab: "ui", category: "feedback", defaultProps: { size: "md", className: "" } },
  { type: "skeleton", label: "Skeleton", icon: "\u2592", isContainer: false, tab: "ui", category: "feedback", defaultProps: { lines: "3", className: "" } },
  { type: "result", label: "Result", icon: "\u2713", isContainer: false, tab: "ui", category: "feedback", defaultProps: { variant: "success", title: "Pago completado", text: "Tu pedido #1234 ha sido procesado.", className: "" } },
  // ── Overlay ──
  { type: "modal", label: "Modal", icon: "\u25EB", isContainer: true, tab: "ui", category: "overlay", defaultProps: { title: "T\xEDtulo del modal", className: "bg-[var(--vz-superficie)] rounded-[var(--vz-radio)] shadow-2xl p-6 max-w-md border border-[color:var(--vz-borde)]" } },
  { type: "drawer", label: "Drawer", icon: "\u25E8", isContainer: true, tab: "ui", category: "overlay", defaultProps: { title: "Panel lateral", className: "bg-[var(--vz-superficie)] shadow-xl p-6 w-80 min-h-[200px] border-l" } },
  { type: "popover", label: "Popover", icon: "\u25F2", isContainer: false, tab: "ui", category: "overlay", defaultProps: { text: "Clic aqu\xED", content: "Contenido del popover con m\xE1s informaci\xF3n.", className: "" } },
  { type: "dialog", label: "Dialog", icon: "\u22A1", isContainer: false, tab: "ui", category: "overlay", defaultProps: { title: "\xBFEst\xE1s seguro?", text: "Esta acci\xF3n no se puede deshacer.", className: "" } },
  // ── Formulario avanzado UI ──
  { type: "checkbox", label: "Checkbox", icon: "\u2611", isContainer: false, tab: "ui", category: "formulario-ui", defaultProps: { label: "Acepto los t\xE9rminos", className: "" } },
  { type: "radio", label: "Radio Group", icon: "\u25C9", isContainer: false, tab: "ui", category: "formulario-ui", defaultProps: { label: "Selecciona", options: "Opci\xF3n A,Opci\xF3n B,Opci\xF3n C", name: "grupo1", className: "" } },
  { type: "switch", label: "Switch", icon: "\u2298", isContainer: false, tab: "ui", category: "formulario-ui", defaultProps: { label: "Activar notificaciones", checked: "true", className: "" } },
  { type: "slider", label: "Slider", icon: "\u22B6", isContainer: false, tab: "ui", category: "formulario-ui", defaultProps: { min: "0", max: "100", value: "50", label: "Volumen", className: "" } },
  { type: "file-upload", label: "File Upload", icon: "\u{1F4CE}", isContainer: false, tab: "ui", category: "formulario-ui", defaultProps: { text: "Arrastra archivos o haz clic", accept: ".pdf,.jpg,.png", className: "" } },
  { type: "rating", label: "Rating", icon: "\u2B50", isContainer: false, tab: "ui", category: "formulario-ui", defaultProps: { value: "4", max: "5", className: "" } },
  { type: "search", label: "Search", icon: "\u{1F50D}", isContainer: false, tab: "ui", category: "formulario-ui", defaultProps: { placeholder: "Buscar...", className: "" } },
  { type: "date-picker", label: "Date Picker", icon: "\u{1F4C5}", isContainer: false, tab: "ui", category: "formulario-ui", defaultProps: { label: "Fecha", className: "" } },
  // ── Layout UI ──
  { type: "divider", label: "Divider", icon: "\u2014", isContainer: false, tab: "ui", category: "layout-ui", defaultProps: { text: "", className: "" } },
  { type: "spacer", label: "Spacer", icon: "\u2195", isContainer: false, tab: "ui", category: "layout-ui", defaultProps: { size: "32", className: "" } },
  { type: "grid", label: "Grid", icon: "\u229E", isContainer: true, tab: "ui", category: "layout-ui", defaultProps: { cols: "3", gap: "4", className: "" } },
  { type: "flex", label: "Flex", icon: "\u2194", isContainer: true, tab: "ui", category: "layout-ui", defaultProps: { direction: "row", gap: "4", className: "" } },
  { type: "accordion", label: "Accordion", icon: "\u25BC", isContainer: false, tab: "ui", category: "layout-ui", defaultProps: { items: "Secci\xF3n 1:Contenido de la primera secci\xF3n,Secci\xF3n 2:Contenido de la segunda secci\xF3n,Secci\xF3n 3:Contenido de la tercera secci\xF3n", className: "" } },
  { type: "collapse", label: "Collapse", icon: "\u25BE", isContainer: true, tab: "ui", category: "layout-ui", defaultProps: { title: "M\xE1s informaci\xF3n", className: "border border-[color:var(--vz-borde)] rounded-[var(--vz-radio)]" } },
  // ── Acciones ──
  { type: "button-group", label: "Button Group", icon: "\u25B8\u25B8", isContainer: false, tab: "ui", category: "acciones", defaultProps: { items: "Guardar,Cancelar,Eliminar", className: "" } },
  { type: "dropdown", label: "Dropdown", icon: "\u25BF", isContainer: false, tab: "ui", category: "acciones", defaultProps: { text: "Opciones", items: "Editar,Duplicar,Eliminar", className: "" } },
  { type: "fab", label: "FAB", icon: "+", isContainer: false, tab: "ui", category: "acciones", defaultProps: { icon: "+", className: "" } },
  { type: "icon-button", label: "Icon Button", icon: "\u25C9", isContainer: false, tab: "ui", category: "acciones", defaultProps: { icon: "\u2715", className: "" } },
  { type: "cta", label: "CTA Banner", icon: "\u{1F4E2}", isContainer: false, tab: "ui", category: "acciones", defaultProps: { title: "Empieza ahora", text: "Reg\xEDstrate gratis y accede a todas las funcionalidades.", buttonText: "Registrarse", className: "" } }
];

// src/builder/style-vocabulary.js
var SPACING = [
  "0",
  "0.5",
  "1",
  "1.5",
  "2",
  "2.5",
  "3",
  "3.5",
  "4",
  "5",
  "6",
  "7",
  "8",
  "10",
  "12",
  "14",
  "16",
  "20",
  "24",
  "32",
  "px"
];
var SIZE_SCALE = [
  ...SPACING,
  "36",
  "40",
  "44",
  "48",
  "52",
  "56",
  "60",
  "64",
  "72",
  "80",
  "96"
];
var COLOR_FAMILIES = [
  "slate",
  "gray",
  "red",
  "orange",
  "amber",
  "yellow",
  "green",
  "emerald",
  "teal",
  "cyan",
  "sky",
  "blue",
  "indigo",
  "violet",
  "purple",
  "pink",
  "rose"
];
var COLOR_SHADES = ["50", "100", "200", "300", "400", "500", "600", "700", "800", "900", "950"];
var COLOR_KEYWORDS = ["white", "black", "transparent", "current", "inherit"];
var TEXT_SIZES = ["xs", "sm", "base", "lg", "xl", "2xl", "3xl", "4xl", "5xl", "6xl", "7xl"];
var FONT_WEIGHTS = ["thin", "extralight", "light", "normal", "medium", "semibold", "bold", "extrabold", "black"];
var RADII = ["none", "sm", "md", "lg", "xl", "2xl", "3xl", "full"];
var SHADOWS = ["sm", "md", "lg", "xl", "2xl", "inner", "none"];
var FRACTIONS = ["1/2", "1/3", "2/3", "1/4", "3/4", "1/5", "2/5", "3/5", "4/5"];
var MAX_WIDTHS = ["xs", "sm", "md", "lg", "xl", "2xl", "3xl", "4xl", "5xl", "6xl", "7xl", "full", "min", "max", "fit", "prose", "none"];
var GRID_COUNTS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"];
var RESPONSIVE_VARIANTS = ["sm", "md", "lg", "xl"];
var STATE_VARIANTS = ["hover", "focus", "focus-visible", "active", "disabled"];
var cross = (prefixes, values) => prefixes.flatMap((p) => values.map((v) => v === "" ? p : `${p}-${v}`));
var colors = (prefixes) => cross(prefixes, [
  ...COLOR_KEYWORDS,
  ...COLOR_FAMILIES.flatMap((f) => COLOR_SHADES.map((s) => `${f}-${s}`))
]);
var THEME_ROLES = [
  "primario",
  "primario-contraste",
  "superficie",
  "superficie-alt",
  "texto",
  "texto-suave",
  "borde",
  "exito",
  "aviso",
  "error"
];
var themeRoleClasses = [
  ...THEME_ROLES.map((r) => `bg-[var(--vz-${r})]`),
  ...THEME_ROLES.map((r) => `text-[color:var(--vz-${r})]`),
  ...THEME_ROLES.map((r) => `border-[color:var(--vz-${r})]`),
  ...THEME_ROLES.map((r) => `ring-[color:var(--vz-${r})]`),
  ...THEME_ROLES.map((r) => `divide-[color:var(--vz-${r})]`),
  "rounded-[var(--vz-radio)]",
  "border-[length:var(--vz-grosor-borde)]",
  "shadow-[var(--vz-sombra)]",
  "font-[family-name:var(--vz-fuente)]",
  "text-[length:var(--vz-tamano-base)]"
];
var VOCABULARY_GROUPS = [
  {
    key: "display",
    label: "Display y flujo",
    variants: ["responsive"],
    classes: [
      "block",
      "inline-block",
      "inline",
      "flex",
      "inline-flex",
      "grid",
      "inline-grid",
      "hidden",
      "flow-root",
      "contents"
    ],
    ai: "block inline-block inline flex inline-flex grid hidden"
  },
  {
    key: "flex",
    label: "Flexbox",
    variants: ["responsive"],
    classes: [
      "flex-row",
      "flex-col",
      "flex-row-reverse",
      "flex-col-reverse",
      "flex-wrap",
      "flex-nowrap",
      "flex-wrap-reverse",
      "flex-1",
      "flex-auto",
      "flex-initial",
      "flex-none",
      "grow",
      "grow-0",
      "shrink",
      "shrink-0",
      ...cross(["order"], ["first", "last", "none", "1", "2", "3", "4", "5"])
    ],
    ai: "flex-row|flex-col (+ -reverse), flex-wrap, flex-1, grow, shrink-0, order-{1..5|first|last}"
  },
  {
    key: "align",
    label: "Alineaci\xF3n",
    variants: ["responsive"],
    classes: [
      ...cross(["justify"], ["start", "center", "end", "between", "around", "evenly"]),
      ...cross(["items"], ["start", "center", "end", "stretch", "baseline"]),
      ...cross(["self"], ["auto", "start", "center", "end", "stretch"]),
      ...cross(["content"], ["start", "center", "end", "between", "around", "evenly"]),
      ...cross(["place-items", "place-content"], ["start", "center", "end", "stretch"])
    ],
    ai: "justify-{start|center|end|between|around|evenly}, items-{start|center|end|stretch|baseline}, self-*, content-*"
  },
  {
    key: "gap",
    label: "Separaci\xF3n",
    variants: ["responsive"],
    classes: cross(["gap", "gap-x", "gap-y"], SPACING),
    ai: "gap-N, gap-x-N, gap-y-N con N en la escala de espaciado"
  },
  {
    key: "grid",
    label: "Rejilla",
    variants: ["responsive"],
    classes: [
      ...cross(["grid-cols"], [...GRID_COUNTS, "none"]),
      ...cross(["grid-rows"], ["1", "2", "3", "4", "5", "6", "none"]),
      ...cross(["col-span"], [...GRID_COUNTS, "full"]),
      ...cross(["row-span"], ["1", "2", "3", "4", "5", "6", "full"]),
      ...cross(["col-start", "col-end"], [...GRID_COUNTS, "auto"]),
      "grid-flow-row",
      "grid-flow-col",
      "grid-flow-dense"
    ],
    ai: "grid-cols-{1..12}, col-span-{1..12|full}, grid-rows-{1..6}, row-span-*, col-start-*"
  },
  {
    key: "padding",
    label: "Padding",
    variants: ["responsive"],
    classes: cross(["p", "px", "py", "pt", "pr", "pb", "pl"], SPACING),
    ai: "p-N px-N py-N pt-N pr-N pb-N pl-N"
  },
  {
    key: "margin",
    label: "Margin",
    variants: ["responsive"],
    classes: cross(["m", "mx", "my", "mt", "mr", "mb", "ml"], [...SPACING, "auto"]),
    ai: "m-N mx-N my-N mt-N mr-N mb-N ml-N (+ mx-auto para centrar)"
  },
  {
    key: "space",
    label: "Espacio entre hijos",
    variants: ["responsive"],
    classes: [
      ...cross(["space-y", "space-x"], SPACING),
      "space-y-reverse",
      "space-x-reverse"
    ],
    ai: "space-y-N, space-x-N (separan los hijos directos; la forma idiom\xE1tica de espaciar una pila vertical)"
  },
  {
    key: "size",
    label: "Tama\xF1o",
    variants: ["responsive"],
    classes: [
      ...cross(["w"], [...SIZE_SCALE, ...FRACTIONS, "auto", "full", "screen", "min", "max", "fit"]),
      ...cross(["h"], [...SIZE_SCALE, ...FRACTIONS, "auto", "full", "screen", "min", "max", "fit"]),
      ...cross(["min-w"], ["0", "full", "min", "max", "fit"]),
      ...cross(["min-h"], ["0", "full", "screen", "min", "max", "fit", ...SIZE_SCALE]),
      ...cross(["max-w"], MAX_WIDTHS),
      ...cross(["max-h"], ["full", "screen", "min", "max", "fit", ...SIZE_SCALE]),
      ...cross(["size"], SIZE_SCALE),
      ...cross(["aspect"], ["auto", "square", "video"])
    ],
    ai: "w-N h-N (escala, fracciones 1/2 1/3\u2026, full auto screen fit), max-w-{xs..7xl|full|prose}, min-h-N, aspect-square"
  },
  {
    key: "typography",
    label: "Tipograf\xEDa",
    variants: ["responsive"],
    classes: [
      ...cross(["text"], TEXT_SIZES),
      ...cross(["font"], FONT_WEIGHTS),
      ...cross(["text"], ["left", "center", "right", "justify"]),
      ...cross(["leading"], ["none", "tight", "snug", "normal", "relaxed", "loose", "3", "4", "5", "6", "7", "8"]),
      ...cross(["tracking"], ["tighter", "tight", "normal", "wide", "wider", "widest"]),
      "font-sans",
      "font-serif",
      "font-mono",
      "italic",
      "not-italic",
      "underline",
      "line-through",
      "no-underline",
      "overline",
      "uppercase",
      "lowercase",
      "capitalize",
      "normal-case",
      "truncate",
      "text-ellipsis",
      "text-clip",
      "break-words",
      "break-all",
      "whitespace-normal",
      "whitespace-nowrap",
      "whitespace-pre-wrap",
      "align-middle",
      "align-top",
      "align-bottom",
      "align-baseline",
      ...cross(["line-clamp"], ["1", "2", "3", "4", "5", "none"]),
      ...cross(["indent"], ["0", "4", "8"])
    ],
    ai: "text-{xs..7xl}, font-{light..extrabold}, text-{left|center|right}, leading-*, tracking-*, italic, underline, uppercase, truncate, whitespace-nowrap, line-clamp-N"
  },
  {
    key: "list",
    label: "Listas",
    variants: [],
    classes: ["list-disc", "list-decimal", "list-none", "list-inside", "list-outside"],
    ai: "list-disc list-decimal list-none list-inside"
  },
  // Los grupos de color son, con diferencia, los que más pesan en el CSS
  // resultante (20 familias × 11 tonos por prefijo), así que cada uno declara
  // solo los estados que de verdad se usan en vez de los cinco.
  {
    key: "color-text",
    label: "Color de texto",
    variants: ["state"],
    states: ["hover", "focus", "disabled"],
    classes: colors(["text"]),
    ai: "text-{familia}-{tono} \u2014 solo si el usuario pide ese color concreto; por defecto usa los roles del tema"
  },
  {
    key: "color-bg",
    label: "Color de fondo",
    variants: ["state"],
    states: ["hover", "focus", "disabled"],
    classes: colors(["bg"]),
    ai: "bg-{familia}-{tono} \u2014 misma advertencia que el color de texto"
  },
  {
    key: "color-border",
    label: "Color de borde y anillo",
    variants: ["state"],
    states: ["hover", "focus"],
    classes: colors(["border", "ring"]),
    ai: "border-{familia}-{tono}, ring-{familia}-{tono}"
  },
  {
    key: "color-misc",
    label: "Color de apoyo",
    variants: [],
    // `outline-`, `decoration-`, `caret-` y `accent-` se quedan fuera de la
    // escala completa: casi nunca se usan y cada prefijo son 190 clases.
    classes: colors(["divide", "placeholder"]),
    ai: "divide-{familia}-{tono}, placeholder-{familia}-{tono} (sin variantes de estado)"
  },
  {
    key: "opacity",
    label: "Opacidad",
    variants: ["state"],
    states: ["hover", "disabled"],
    classes: cross(["opacity"], ["0", "5", "10", "20", "25", "30", "40", "50", "60", "70", "75", "80", "90", "95", "100"]),
    ai: "opacity-{0..100} (hover:opacity-90 es la forma de dar respuesta al pasar el rat\xF3n sin fijar un color)"
  },
  {
    key: "border",
    label: "Bordes",
    variants: ["state"],
    classes: [
      "border",
      "border-0",
      "border-2",
      "border-4",
      "border-8",
      ...cross(["border-t", "border-r", "border-b", "border-l", "border-x", "border-y"], ["", "0", "2", "4", "8"]),
      "border-solid",
      "border-dashed",
      "border-dotted",
      "border-none",
      "divide-y",
      "divide-x",
      "divide-y-2",
      "divide-x-2",
      "rounded",
      ...cross(["rounded"], RADII),
      ...cross(["rounded-t", "rounded-r", "rounded-b", "rounded-l", "rounded-tl", "rounded-tr", "rounded-br", "rounded-bl"], RADII),
      "ring",
      "ring-0",
      "ring-1",
      "ring-2",
      "ring-4",
      "ring-inset",
      ...cross(["ring-offset"], ["0", "1", "2", "4"]),
      "outline",
      "outline-none",
      "outline-1",
      "outline-2",
      "outline-offset-2"
    ],
    ai: "border, border-{0|2|4|8}, border-{t|r|b|l}, border-dashed, rounded-{none..3xl|full}, ring-{0|1|2|4}, ring-inset, outline-none"
  },
  {
    key: "effects",
    label: "Sombra y efectos",
    variants: ["state"],
    classes: [
      "shadow",
      ...cross(["shadow"], SHADOWS),
      ...cross(["blur"], ["none", "sm", "md", "lg"]),
      ...cross(["backdrop-blur"], ["none", "sm", "md", "lg"]),
      ...cross(["scale"], ["95", "100", "105", "110"]),
      ...cross(["rotate"], ["0", "45", "90", "180"]),
      ...cross(["translate-x", "translate-y"], ["0", "1", "2", "4", "full"]),
      "transform",
      "transform-none"
    ],
    ai: "shadow-{sm|md|lg|xl|2xl|inner|none}, blur-*, scale-{95|105|110}, rotate-*, translate-*"
  },
  {
    key: "transition",
    label: "Transici\xF3n",
    variants: [],
    classes: [
      "transition",
      "transition-none",
      "transition-all",
      "transition-colors",
      "transition-opacity",
      "transition-shadow",
      "transition-transform",
      ...cross(["duration"], ["75", "100", "150", "200", "300", "500", "700", "1000"]),
      ...cross(["delay"], ["75", "100", "150", "200", "300", "500"]),
      "ease-linear",
      "ease-in",
      "ease-out",
      "ease-in-out",
      "animate-none",
      "animate-spin",
      "animate-ping",
      "animate-pulse",
      "animate-bounce"
    ],
    ai: "transition, transition-colors, duration-N, ease-in-out, animate-spin, animate-pulse"
  },
  {
    key: "position",
    label: "Posici\xF3n",
    variants: ["responsive"],
    classes: [
      "static",
      "relative",
      "absolute",
      "fixed",
      "sticky",
      ...cross(["top", "right", "bottom", "left", "inset", "inset-x", "inset-y"], ["0", "1", "2", "4", "6", "8", "auto", "full"]),
      ...cross(["z"], ["0", "10", "20", "30", "40", "50", "auto"]),
      "float-left",
      "float-right",
      "float-none",
      "clear-both"
    ],
    ai: "relative absolute fixed sticky, top/right/bottom/left/inset-N, z-{0..50}"
  },
  {
    key: "overflow",
    label: "Desbordamiento y objeto",
    variants: [],
    classes: [
      ...cross(["overflow", "overflow-x", "overflow-y"], ["auto", "hidden", "visible", "scroll", "clip"]),
      ...cross(["object"], ["contain", "cover", "fill", "none", "scale-down", "center", "top", "bottom"]),
      "resize",
      "resize-none",
      "resize-y"
    ],
    ai: "overflow-{auto|hidden|x-auto|y-auto}, object-{cover|contain}, resize-none"
  },
  {
    key: "interactivity",
    label: "Interacci\xF3n",
    variants: ["state"],
    classes: [
      "cursor-pointer",
      "cursor-default",
      "cursor-not-allowed",
      "cursor-text",
      "cursor-move",
      "cursor-wait",
      "select-none",
      "select-text",
      "select-all",
      "pointer-events-none",
      "pointer-events-auto",
      "appearance-none",
      "sr-only",
      "not-sr-only",
      "opacity-50",
      "opacity-100"
    ],
    ai: "cursor-pointer, cursor-not-allowed, select-none, pointer-events-none, appearance-none, sr-only"
  },
  {
    key: "table",
    label: "Tabla",
    variants: [],
    classes: [
      "table",
      "table-auto",
      "table-fixed",
      "border-collapse",
      "border-separate",
      "caption-top",
      "caption-bottom"
    ],
    ai: "table-auto, table-fixed, border-collapse"
  },
  {
    key: "theme",
    label: "Roles del tema",
    variants: ["state"],
    classes: themeRoleClasses,
    ai: `bg-[var(--vz-ROL)] \xB7 text-[color:var(--vz-ROL)] \xB7 border-[color:var(--vz-ROL)] \xB7 ring-[color:var(--vz-ROL)] \xB7 divide-[color:var(--vz-ROL)], con ROL en [${THEME_ROLES.join(", ")}]. Adem\xE1s rounded-[var(--vz-radio)]. ESTA es la forma por defecto de dar color: sigue el tema de la librer\xEDa.`
  }
];
var VOCABULARY_CLASSES = [
  ...new Set(VOCABULARY_GROUPS.flatMap((g) => g.classes))
];
var VOCABULARY_SET = new Set(VOCABULARY_CLASSES);
var SAFELIST = (() => {
  const out = /* @__PURE__ */ new Set();
  for (const group of VOCABULARY_GROUPS) {
    const states = group.states ?? STATE_VARIANTS;
    for (const cls of group.classes) {
      out.add(cls);
      if (group.variants.includes("responsive")) {
        for (const v of RESPONSIVE_VARIANTS) out.add(`${v}:${cls}`);
      }
      if (group.variants.includes("state")) {
        for (const v of states) out.add(`${v}:${cls}`);
      }
    }
  }
  return [...out];
})();
var VOCABULARY_FOR_AI = {
  nota: "Vocabulario CERRADO. El lienzo solo sabe pintar estas utilidades: una clase fuera de esta lista no tiene regla CSS y no se ver\xE1. Escribe siempre la clase completa y literal (nunca la construyas concatenando).",
  escalaEspaciado: SPACING.join(" "),
  familiasColor: COLOR_FAMILIES.join(" "),
  tonosColor: COLOR_SHADES.join(" "),
  variantesPantalla: RESPONSIVE_VARIANTS.map((v) => `${v}:`).join(" "),
  variantesEstado: STATE_VARIANTS.map((v) => `${v}:`).join(" "),
  grupos: VOCABULARY_GROUPS.map((g) => ({ grupo: g.label, utilidades: g.ai }))
};
var VARIANT_SET = /* @__PURE__ */ new Set([...RESPONSIVE_VARIANTS, ...STATE_VARIANTS]);

// src/builder/palette-context.ts
var PALETTE_CONTEXT = BLOCK_DEFINITIONS.map((d) => ({
  type: d.type,
  label: d.label,
  isContainer: d.isContainer,
  defaultProps: d.defaultProps
}));
var PALETTE_CONTEXT_JSON = JSON.stringify(PALETTE_CONTEXT);
var STYLE_VOCABULARY_JSON = JSON.stringify(VOCABULARY_FOR_AI);
export {
  PALETTE_CONTEXT,
  PALETTE_CONTEXT_JSON,
  STYLE_VOCABULARY_JSON
};
