import { useState } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { BLOCK_DEFINITIONS, HTML_CATEGORIES, UI_CATEGORIES, type BlockDefinition } from './defaults';
import { useBuilderState, useBuilderDispatch, findParentId } from './useBuilderStore';
import { isContainer } from './schema';

interface Props {
  collapsed: boolean;
  onToggle: () => void;
}

type PaletteTab = 'html' | 'ui';

/** Normaliza para buscar sin acentos ni mayúsculas: «numero» encuentra «Número». */
function normalizar(texto: string): string {
  // El rango va en escapes y no con los caracteres literales: son marcas
  // combinantes invisibles en el editor y cualquier copia los pierde sin aviso.
  return texto.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

export function BlockPalette({ collapsed, onToggle }: Props) {
  const [tab, setTab] = useState<PaletteTab>('ui');
  const [openCats, setOpenCats] = useState<Record<string, boolean>>({});
  const [busqueda, setBusqueda] = useState('');

  function toggleCat(key: string) {
    setOpenCats((prev) => ({ ...prev, [key]: prev[key] === false ? true : prev[key] === undefined ? false : !prev[key] }));
  }

  function isCatOpen(key: string) {
    return openCats[key] !== false;
  }

  const categories = tab === 'html' ? HTML_CATEGORIES : UI_CATEGORIES;
  const q = normalizar(busqueda.trim());
  /*
    Buscando se ignora la pestaña.

    Con casi cien bloques, el problema que resuelve el buscador es «sé lo que
    quiero pero no dónde está», y eso incluye no saber si vive en UI o en HTML.
    Filtrar solo la pestaña activa dejaría a «input» sin resultados desde UI,
    que es justo el caso en que se busca.
  */
  const items = q
    ? BLOCK_DEFINITIONS.filter((d) => normalizar(d.label).includes(q) || normalizar(d.type).includes(q))
    : BLOCK_DEFINITIONS.filter((d) => d.tab === tab);

  if (collapsed) {
    return (
      <aside className="w-11 shrink-0 bg-slate-900 border-r border-slate-800 flex flex-col items-center pt-2">
        <button onClick={onToggle} className="w-7 h-7 rounded hover:bg-slate-800 flex items-center justify-center text-slate-500 hover:text-white text-xs" title="Expandir">
          ›
        </button>
      </aside>
    );
  }

  return (
    <aside className="w-64 shrink-0 bg-slate-900 text-slate-300 flex flex-col border-r border-slate-800">
      <div className="flex items-center justify-between px-2 py-1.5 border-b border-slate-800">
        <div className="flex bg-slate-800 rounded-md p-0.5 flex-1 mr-2">
          <button
            onClick={() => setTab('ui')}
            className={`flex-1 text-[10px] font-semibold py-1 rounded transition-colors ${tab === 'ui' ? 'bg-slate-700 text-white' : 'text-slate-500 hover:text-slate-300'}`}
          >
            UI
          </button>
          <button
            onClick={() => setTab('html')}
            className={`flex-1 text-[10px] font-semibold py-1 rounded transition-colors ${tab === 'html' ? 'bg-slate-700 text-white' : 'text-slate-500 hover:text-slate-300'}`}
          >
            HTML
          </button>
        </div>
        <button onClick={onToggle} className="w-6 h-6 rounded hover:bg-slate-800 flex items-center justify-center text-slate-600 hover:text-white text-[10px]">
          ‹
        </button>
      </div>
      <div className="px-2 py-1.5 border-b border-slate-800">
        <div className="relative">
          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-slate-600 pointer-events-none">⌕</span>
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Escape') setBusqueda(''); }}
            placeholder="Buscar componente…"
            aria-label="Buscar componente en la paleta"
            className="w-full bg-slate-800 rounded-md pl-6 pr-6 py-1 text-[11px] text-slate-200
              placeholder:text-slate-600 outline-none focus:ring-1 focus:ring-slate-600"
          />
          {busqueda && (
            <button
              onClick={() => setBusqueda('')}
              aria-label="Limpiar búsqueda"
              className="absolute right-1.5 top-1/2 -translate-y-1/2 w-4 h-4 rounded text-[10px]
                text-slate-500 hover:text-white hover:bg-slate-700 flex items-center justify-center"
            >
              ✕
            </button>
          )}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {/* Buscando se listan los resultados en plano: agrupar por categoría con
            un bloque por grupo añade cabeceras y quita de un vistazo lo poco que
            queda, que es lo único que importa cuando ya has escrito qué buscas. */}
        {q && (
          items.length === 0 ? (
            <p className="px-3 py-6 text-[11px] text-slate-600 text-center leading-relaxed">
              Ningún bloque coincide con «{busqueda.trim()}».
            </p>
          ) : (
            <div className="pb-0.5">
              <p className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-600">
                {items.length} resultado{items.length === 1 ? '' : 's'}
              </p>
              {items.map((def) => (
                <PaletteItem key={def.type} def={def} />
              ))}
            </div>
          )
        )}
        {!q && categories.map((cat) => {
          const catItems = items.filter((d) => d.category === cat.key);
          if (catItems.length === 0) return null;
          const open = isCatOpen(cat.key);
          return (
            <div key={cat.key}>
              <button
                onClick={() => toggleCat(cat.key)}
                className="w-full flex items-center justify-between px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-600 hover:text-slate-400 hover:bg-slate-800/40 transition-colors"
              >
                <span>{cat.label}</span>
                <span className={`transition-transform text-[8px] ${open ? 'rotate-90' : ''}`}>▶</span>
              </button>
              {open && (
                <div className="pb-0.5">
                  {catItems.map((def) => (
                    <PaletteItem key={def.type} def={def} />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </aside>
  );
}

function PaletteItem({ def }: { def: BlockDefinition }) {
  const state = useBuilderState();
  const dispatch = useBuilderDispatch();
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `palette-${def.type}`,
    data: { origin: 'palette', blockType: def.type },
  });

  /**
   * Añadir con un clic, sin arrastrar.
   *
   * Es el camino natural para seguir componiendo sobre un componente ya montado
   * (el que acaba de generar la IA, por ejemplo): con un contenedor seleccionado
   * el bloque entra dentro, y con cualquier otro bloque entra justo detrás, que
   * es donde el usuario está mirando. Sin selección, al final del lienzo.
   */
  function addByClick() {
    const selected = state.selectedId ? state.blocks[state.selectedId] : null;
    if (!selected) {
      dispatch({ type: 'ADD_BLOCK', blockType: def.type });
      return;
    }
    if (isContainer(selected.type)) {
      dispatch({ type: 'ADD_BLOCK', blockType: def.type, parentId: selected.id });
      return;
    }
    const parentId = findParentId(state.blocks, selected.id);
    const siblings = parentId ? state.blocks[parentId].children : state.rootIds;
    dispatch({
      type: 'ADD_BLOCK',
      blockType: def.type,
      parentId,
      index: siblings.indexOf(selected.id) + 1,
    });
  }

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onClick={addByClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); addByClick(); } }}
      title={`${def.label} — clic para añadir, o arrastra al lienzo`}
      className={`flex items-center gap-2 px-4 py-[5px] cursor-grab text-[11px] transition-colors
        focus:outline-none focus:bg-slate-800 focus:ring-1 focus:ring-inset focus:ring-blue-500
        ${isDragging ? 'opacity-30 bg-blue-500/20' : 'hover:bg-slate-800/80 active:bg-slate-700'}`}
    >
      <span className="w-4 text-center text-[10px] text-slate-600 shrink-0 font-mono">{def.icon}</span>
      <span className="text-slate-400 truncate">{def.label}</span>
    </div>
  );
}
