import { useEffect, useRef, useState } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useDroppable } from '@dnd-kit/core';
import { getDefinition } from './defaults';
import { buildNode, isContainer } from './schema';
import { renderNode, useRuntime, type CanvasMode } from './render-node';
import { useBuilderState, useBuilderDispatch } from './useBuilderStore';
import { setUtility, WIDTH_MATCHER, HEIGHT_MATCHER } from './style-utils';
import { SelectionToolbar } from './SelectionToolbar';

/** Prop de texto que edita el doble clic, por orden de preferencia. */
const TEXT_PROPS = ['text', 'label', 'title'] as const;

type ResizeAxis = 'x' | 'y' | 'xy';

/**
 * Pinta un bloque en el lienzo.
 *
 * El markup lo produce `schema.ts` —el mismo que alimenta al emisor— y este
 * componente solo aporta los afordances de edición: etiqueta, selección,
 * arrastre, borrado, zona de soltar, asas de redimensionado y edición de texto
 * con doble clic. En modo interactivo ese envoltorio desaparece para poder usar
 * el componente de verdad.
 */
export function BlockRenderer({ id }: { id: string }) {
  const state = useBuilderState();
  const dispatch = useBuilderDispatch();
  const runtime = useRuntime();
  const block = state.blocks[id];

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
    data: { origin: 'canvas', blockId: id },
    disabled: state.canvasMode === 'interactive',
  });

  const wrapperRef = useRef<HTMLDivElement | null>(null);
  // El primer movimiento del gesto va como UPDATE_PROPS (ancla el deshacer);
  // el resto como transitorio, para que todo el arrastre sea UNA entrada.
  const resizeRef = useRef<{ axis: ResizeAxis; startX: number; startY: number; w: number; h: number; committed: boolean } | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  // Doble clic en el lienzo vacío: el bloque de texto recién creado abre su
  // editor sin exigir un segundo doble clic.
  const pendingEdit = state.pendingEditId === id;
  useEffect(() => {
    if (!pendingEdit || !block) return;
    const prop = TEXT_PROPS.find((k) => k in block.props);
    if (prop) {
      setDraft(block.props[prop] || '');
      setEditing(true);
    }
    dispatch({ type: 'CLEAR_PENDING_EDIT' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingEdit]);

  if (!block) return null;

  const editableProp = TEXT_PROPS.find((k) => k in block.props);

  function startResize(e: React.PointerEvent, axis: ResizeAxis) {
    e.stopPropagation();
    e.preventDefault();
    const rect = wrapperRef.current?.getBoundingClientRect();
    if (!rect) return;
    resizeRef.current = { axis, startX: e.clientX, startY: e.clientY, w: rect.width, h: rect.height, committed: false };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }

  function moveResize(e: React.PointerEvent) {
    const r = resizeRef.current;
    if (!r) return;
    const w = Math.max(24, Math.round(r.w + e.clientX - r.startX));
    const h = Math.max(16, Math.round(r.h + e.clientY - r.startY));
    let cls = block.props.className || '';
    if (r.axis !== 'y') cls = setUtility(cls, '', WIDTH_MATCHER, `w-[${w}px]`);
    if (r.axis !== 'x') cls = setUtility(cls, '', HEIGHT_MATCHER, `h-[${h}px]`);
    if (cls === (block.props.className || '')) return;
    dispatch({ type: r.committed ? 'UPDATE_PROPS_TRANSIENT' : 'UPDATE_PROPS', id, props: { className: cls } });
    r.committed = true;
  }

  function endResize() {
    resizeRef.current = null;
  }

  function startTextEdit(e: React.MouseEvent) {
    // Siempre se corta la propagación: si burbujeara, el doble clic sobre un
    // bloque sin texto añadiría un párrafo suelto al lienzo.
    e.stopPropagation();
    if (!editableProp) return;
    setDraft(block.props[editableProp] || '');
    setEditing(true);
  }

  function commitTextEdit() {
    if (editableProp && draft !== (block.props[editableProp] || '')) {
      dispatch({ type: 'UPDATE_PROPS', id, props: { [editableProp]: draft } });
    }
    setEditing(false);
  }

  const mode: CanvasMode = state.canvasMode;
  const content = renderNode(buildNode(block, { vars: state.stateVars }), {
    mode,
    runtime,
    renderSlot: () => (isContainer(block.type) ? <DropZone blockId={id} /> : null),
  });

  // Interactivo: sin cromo de edición, el componente se comporta como en real.
  if (mode === 'interactive') return <>{content}</>;

  const isSelected = state.selectedId === id;
  const def = getDefinition(block.type);
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.3 : 1 };

  return (
    <div
      ref={(el) => { wrapperRef.current = el; setNodeRef(el); }}
      style={style} {...attributes} {...listeners}
      onClick={(e) => { e.stopPropagation(); dispatch({ type: 'SELECT', id }); }}
      onDoubleClick={startTextEdit}
      className={`relative group cursor-grab active:cursor-grabbing rounded transition-shadow
        ${isSelected ? 'ring-2 ring-blue-500 shadow-md shadow-blue-500/10' : 'hover:ring-1 hover:ring-blue-400/30'}`}
    >
      {!isSelected && (
        <div className="absolute -top-5 left-0.5 z-10 transition-opacity opacity-0 group-hover:opacity-100">
          <span className="text-[9px] font-medium text-blue-600 bg-blue-50 px-1 py-0.5 rounded border border-blue-200">
            {def.label}
            {block.visibleIf && <span className="ml-1 text-blue-400" title="Visibilidad condicional">◐</span>}
            {block.events && block.events.length > 0 && <span className="ml-1 text-amber-500" title="Tiene acciones">⚡</span>}
          </span>
        </div>
      )}
      {isSelected && !editing && <SelectionToolbar block={block} />}
      {content}
      {isSelected && !editing && (
        <>
          <div
            onPointerDown={(e) => startResize(e, 'x')} onPointerMove={moveResize}
            onPointerUp={endResize} onPointerCancel={endResize}
            className="absolute top-1/2 -right-1 -translate-y-1/2 w-2 h-6 bg-blue-500 border border-white rounded-sm cursor-ew-resize z-10"
            title="Ajustar ancho"
          />
          <div
            onPointerDown={(e) => startResize(e, 'y')} onPointerMove={moveResize}
            onPointerUp={endResize} onPointerCancel={endResize}
            className="absolute left-1/2 -bottom-1 -translate-x-1/2 h-2 w-6 bg-blue-500 border border-white rounded-sm cursor-ns-resize z-10"
            title="Ajustar alto"
          />
          <div
            onPointerDown={(e) => startResize(e, 'xy')} onPointerMove={moveResize}
            onPointerUp={endResize} onPointerCancel={endResize}
            className="absolute -right-1 -bottom-1 w-3 h-3 bg-blue-600 border border-white rounded-sm cursor-nwse-resize z-10"
            title="Ajustar tamaño"
          />
        </>
      )}
      {editing && (
        <div className="absolute inset-0 z-20" onPointerDown={(e) => e.stopPropagation()}>
          <textarea
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitTextEdit}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commitTextEdit(); }
              if (e.key === 'Escape') setEditing(false);
            }}
            className="w-full h-full min-h-[38px] bg-white/95 border border-blue-400 rounded p-1.5 text-sm resize-none focus:outline-none shadow-lg"
          />
        </div>
      )}
    </div>
  );
}

/** Zona de soltar de un contenedor, con sus hijos dentro. */
function DropZone({ blockId }: { blockId: string }) {
  const state = useBuilderState();
  const block = state.blocks[blockId];
  const { setNodeRef, isOver } = useDroppable({ id: `droppable-${blockId}`, data: { parentId: blockId } });

  if (!block) return null;
  const isEmpty = block.children.length === 0;

  return (
    <div
      ref={setNodeRef}
      className={`min-h-[40px] rounded-lg transition-colors
        ${isEmpty ? 'border border-dashed border-slate-300/70' : ''}
        ${isOver ? 'ring-1 ring-blue-300 ring-inset bg-blue-50/40' : ''}`}
    >
      {isEmpty ? (
        <div className="flex flex-col items-center justify-center py-6 gap-1.5">
          <span className="text-lg text-slate-200">+</span>
          <span className="text-[10px] text-slate-400">Arrastra componentes aquí</span>
        </div>
      ) : (
        block.children.map((childId) => <BlockRenderer key={childId} id={childId} />)
      )}
    </div>
  );
}
