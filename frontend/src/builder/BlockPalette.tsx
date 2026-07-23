import { useState } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { BLOCK_DEFINITIONS, HTML_CATEGORIES, UI_CATEGORIES, type BlockDefinition } from './defaults';

interface Props {
  collapsed: boolean;
  onToggle: () => void;
}

type PaletteTab = 'html' | 'ui';

export function BlockPalette({ collapsed, onToggle }: Props) {
  const [tab, setTab] = useState<PaletteTab>('ui');
  const [openCats, setOpenCats] = useState<Record<string, boolean>>({});

  function toggleCat(key: string) {
    setOpenCats((prev) => ({ ...prev, [key]: prev[key] === false ? true : prev[key] === undefined ? false : !prev[key] }));
  }

  function isCatOpen(key: string) {
    return openCats[key] !== false;
  }

  const categories = tab === 'html' ? HTML_CATEGORIES : UI_CATEGORIES;
  const items = BLOCK_DEFINITIONS.filter((d) => d.tab === tab);

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
      <div className="flex-1 overflow-y-auto">
        {categories.map((cat) => {
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
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `palette-${def.type}`,
    data: { origin: 'palette', blockType: def.type },
  });

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={`flex items-center gap-2 px-4 py-[5px] cursor-grab text-[11px] transition-colors
        ${isDragging ? 'opacity-30 bg-blue-500/20' : 'hover:bg-slate-800/80 active:bg-slate-700'}`}
    >
      <span className="w-4 text-center text-[10px] text-slate-600 shrink-0 font-mono">{def.icon}</span>
      <span className="text-slate-400 truncate">{def.label}</span>
    </div>
  );
}
