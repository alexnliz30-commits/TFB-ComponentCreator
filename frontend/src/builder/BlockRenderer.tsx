import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useSortable, SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useDroppable, useDndContext } from '@dnd-kit/core';
import { useDropHint } from './drop-hint';
import { getDefinition } from './defaults';
import { buildNode, isContainer } from './schema';
import { renderNode, useRuntime, type CanvasMode } from './render-node';
import { useBuilderState, useBuilderDispatch } from './useBuilderStore';
import { setUtility, WIDTH_MATCHER, HEIGHT_MATCHER } from './style-utils';
import { SelectionToolbar } from './SelectionToolbar';

/** Prop de texto que edita el doble clic, por orden de preferencia. */
const TEXT_PROPS = ['text', 'label', 'title'] as const;

type ResizeAxis = 'x' | 'y' | 'xy';

interface ResizeGesture {
  axis: ResizeAxis;
  startX: number;
  startY: number;
  w: number;
  h: number;
  /** El primer movimiento ya ancló el punto de deshacer. */
  committed: boolean;
}

/**
 * Elemento que produce el esquema, dentro del envoltorio de edición.
 *
 * El envoltorio es un `div` de nivel de bloque: ocupa todo el ancho disponible
 * del lienzo aunque el elemento de dentro mida 120 px. Los afordances (etiqueta,
 * barra, asas, editor) son todos absolutos, así que el primer hijo en flujo
 * normal es el contenido real.
 */
function contentElement(wrapper: HTMLElement | null): HTMLElement | null {
  if (!wrapper) return null;
  for (const child of Array.from(wrapper.children)) {
    if (child instanceof HTMLElement && getComputedStyle(child).position !== 'absolute') {
      return child;
    }
  }
  return wrapper;
}

/** Caja del contenido en coordenadas del envoltorio. */
interface ContentBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface BlockRendererProps {
  id: string;
  /** Contenedor que lo alberga; `undefined` = raíz del lienzo. */
  parentId?: string;
  /** Posición dentro de su lista, para saber dónde insertar al soltar encima. */
  index: number;
}

/**
 * Pinta un bloque en el lienzo.
 *
 * El markup lo produce `schema.ts` —el mismo que alimenta al emisor— y este
 * componente solo aporta los afordances de edición: etiqueta, selección,
 * arrastre, borrado, zona de soltar, asas de redimensionado y edición de texto
 * con doble clic. En modo interactivo ese envoltorio desaparece para poder usar
 * el componente de verdad.
 */
export function BlockRenderer({ id, parentId, index }: BlockRendererProps) {
  const state = useBuilderState();
  const dispatch = useBuilderDispatch();
  const runtime = useRuntime();
  const block = state.blocks[id];

  const dropSide = useDropHint(id);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
    // `parentId` e `index` viajan con el arrastre: sin ellos, soltar sobre un
    // bloque que vive dentro de un contenedor lo sacaba al final de la raíz.
    data: { origin: 'canvas', blockId: id, parentId, index },
    disabled: state.canvasMode === 'interactive',
  });

  const wrapperRef = useRef<HTMLDivElement | null>(null);
  // El primer movimiento del gesto va como UPDATE_PROPS (ancla el deshacer);
  // el resto como transitorio, para que todo el arrastre sea UNA entrada.
  const resizeRef = useRef<ResizeGesture | null>(null);
  const [resizeLabel, setResizeLabel] = useState<string | null>(null);
  const [contentBox, setContentBox] = useState<ContentBox | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  const isSelected = state.selectedId === id;

  /**
   * Sigue la caja del elemento real para colocar encima las asas.
   *
   * Sin esto las asas se anclan al envoltorio, que ocupa todo el ancho del
   * lienzo: para un botón de 90 px el tirador de ancho aparecía a más de mil
   * píxeles de distancia, apuntando a un borde que no era el suyo. El
   * `ResizeObserver` mantiene el asa pegada al borde mientras se arrastra.
   */
  useLayoutEffect(() => {
    if (!isSelected || state.canvasMode === 'interactive') {
      setContentBox(null);
      return;
    }
    const wrapper = wrapperRef.current;
    const element = contentElement(wrapper);
    if (!wrapper || !element) return;

    const measure = () => {
      const outer = wrapper.getBoundingClientRect();
      const inner = element.getBoundingClientRect();
      setContentBox({
        left: inner.left - outer.left,
        top: inner.top - outer.top,
        width: inner.width,
        height: inner.height,
      });
    };
    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(element);
    observer.observe(wrapper);
    return () => observer.disconnect();
  }, [isSelected, state.canvasMode, block?.props.className, editing]);

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
    const rect = contentElement(wrapperRef.current)?.getBoundingClientRect();
    if (!rect) return;
    resizeRef.current = { axis, startX: e.clientX, startY: e.clientY, w: rect.width, h: rect.height, committed: false };
    setResizeLabel(sizeLabel(axis, Math.round(rect.width), Math.round(rect.height)));
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }

  function moveResize(e: React.PointerEvent) {
    const gesture = resizeRef.current;
    if (!gesture) return;
    const w = Math.max(24, Math.round(gesture.w + e.clientX - gesture.startX));
    const h = Math.max(16, Math.round(gesture.h + e.clientY - gesture.startY));
    setResizeLabel(sizeLabel(gesture.axis, w, h));

    let cls = block.props.className || '';
    if (gesture.axis !== 'y') cls = setUtility(cls, '', WIDTH_MATCHER, `w-[${w}px]`);
    if (gesture.axis !== 'x') cls = setUtility(cls, '', HEIGHT_MATCHER, `h-[${h}px]`);
    if (cls === (block.props.className || '')) return;
    dispatch({ type: gesture.committed ? 'UPDATE_PROPS_TRANSIENT' : 'UPDATE_PROPS', id, props: { className: cls } });
    gesture.committed = true;
  }

  function endResize() {
    resizeRef.current = null;
    setResizeLabel(null);
  }

  /**
   * Doble clic en un asa: vuelve al tamaño automático quitando el tamaño fijo de
   * ese eje. Sin esto, un arrastre accidental solo se podía deshacer desde el
   * panel de propiedades.
   */
  function clearSize(e: React.MouseEvent, axis: ResizeAxis) {
    e.stopPropagation();
    let cls = block.props.className || '';
    if (axis !== 'y') cls = setUtility(cls, '', WIDTH_MATCHER, '');
    if (axis !== 'x') cls = setUtility(cls, '', HEIGHT_MATCHER, '');
    if (cls !== (block.props.className || '')) {
      dispatch({ type: 'UPDATE_PROPS', id, props: { className: cls } });
    }
  }

  /** Props comunes de las tres asas, para no repetir el cableado del gesto. */
  function handleProps(axis: ResizeAxis) {
    return {
      onPointerDown: (e: React.PointerEvent) => startResize(e, axis),
      onPointerMove: moveResize,
      onPointerUp: endResize,
      onPointerCancel: endResize,
      onDoubleClick: (e: React.MouseEvent) => clearSize(e, axis),
    };
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
      {/*
        `pointer-events-none`: la etiqueta se dibuja 20 px por encima del bloque,
        así que se solapa con el bloque anterior. Sin esto capturaba sus clics
        —incluso con `opacity-0`, que no desactiva los eventos— y pulsar cerca
        del borde inferior de un bloque no hacía nada. Es puramente informativa.
      */}
      {!isSelected && (
        <div className="absolute -top-5 left-0.5 z-10 transition-opacity opacity-0 group-hover:opacity-100 pointer-events-none">
          <span className="text-[9px] font-medium text-blue-600 bg-blue-50 px-1 py-0.5 rounded border border-blue-200">
            {def.label}
            {block.visibleIf && <span className="ml-1 text-blue-400" title="Visibilidad condicional">◐</span>}
            {block.events && block.events.length > 0 && <span className="ml-1 text-amber-500" title="Tiene acciones">⚡</span>}
          </span>
        </div>
      )}
      {/* Línea de inserción: dice si lo soltado entra delante o detrás. */}
      {dropSide && !isDragging && (
        <div
          className={`absolute left-0 right-0 h-0.5 bg-blue-500 rounded-full z-20 pointer-events-none
            ${dropSide === 'before' ? '-top-1' : '-bottom-1'}`}
        />
      )}
      {isSelected && !editing && <SelectionToolbar block={block} />}
      {content}
      {isSelected && !editing && contentBox && (
        <>
          <div
            {...handleProps('x')}
            style={{
              left: contentBox.left + contentBox.width - 4,
              top: contentBox.top + contentBox.height / 2 - 12,
            }}
            className="absolute w-2 h-6 bg-blue-500 border border-white rounded-sm cursor-ew-resize z-10"
            title="Ajustar ancho (doble clic: automático)"
          />
          <div
            {...handleProps('y')}
            style={{
              left: contentBox.left + contentBox.width / 2 - 12,
              top: contentBox.top + contentBox.height - 4,
            }}
            className="absolute h-2 w-6 bg-blue-500 border border-white rounded-sm cursor-ns-resize z-10"
            title="Ajustar alto (doble clic: automático)"
          />
          <div
            {...handleProps('xy')}
            style={{
              left: contentBox.left + contentBox.width - 6,
              top: contentBox.top + contentBox.height - 6,
            }}
            className="absolute w-3 h-3 bg-blue-600 border border-white rounded-sm cursor-nwse-resize z-10"
            title="Ajustar tamaño (doble clic: automático)"
          />
          {resizeLabel && (
            <span
              style={{ left: contentBox.left + contentBox.width + 8, top: contentBox.top }}
              className="absolute z-20 px-1.5 py-0.5 rounded bg-blue-600 text-white text-[10px] font-medium tabular-nums pointer-events-none whitespace-nowrap"
            >
              {resizeLabel}
            </span>
          )}
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

/** Texto del indicador de tamaño, solo con los ejes que el asa cambia. */
function sizeLabel(axis: ResizeAxis, w: number, h: number): string {
  if (axis === 'x') return `${w} px`;
  if (axis === 'y') return `${h} px`;
  return `${w} × ${h}`;
}

/**
 * Zona de soltar de un contenedor, con sus hijos dentro.
 *
 * Los hijos llevan su propio `SortableContext`: dnd-kit ordena dentro de un
 * contexto, y sin uno por contenedor los bloques anidados no se podían reordenar
 * entre ellos.
 */
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
        <>
          <SortableContext items={block.children} strategy={verticalListSortingStrategy}>
            {block.children.map((childId, i) => (
              <BlockRenderer key={childId} id={childId} parentId={blockId} index={i} />
            ))}
          </SortableContext>
          <ContainerTail blockId={blockId} />
        </>
      )}
    </div>
  );
}

/**
 * Franja al final de un contenedor que ya tiene hijos.
 *
 * En cuanto entraba el primer bloque, los hijos tapaban por completo la zona de
 * soltar y el cartel «Arrastra componentes aquí» desaparecía: el contenedor
 * parecía lleno y no había forma evidente de añadir un segundo. Esta franja
 * mantiene siempre un destino visible para «añadir al final», y solo se anuncia
 * mientras hay algo en vuelo para no ensuciar el lienzo en reposo.
 */
function ContainerTail({ blockId }: { blockId: string }) {
  const { active } = useDndContext();
  const { setNodeRef, isOver } = useDroppable({
    id: `tail-${blockId}`,
    data: { parentId: blockId },
  });

  const dragging = Boolean(active);

  return (
    <div
      ref={setNodeRef}
      className={`flex items-center justify-center rounded transition-all
        ${dragging ? 'h-7 mt-1 border border-dashed' : 'h-2'}
        ${isOver ? 'border-blue-400 bg-blue-50/60' : 'border-slate-300/70'}`}
    >
      {dragging && (
        <span className={`text-[10px] ${isOver ? 'text-blue-600' : 'text-slate-400'}`}>
          Soltar aquí dentro
        </span>
      )}
    </div>
  );
}
