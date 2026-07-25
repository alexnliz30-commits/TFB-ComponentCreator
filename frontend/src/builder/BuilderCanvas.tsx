import { useMemo, type CSSProperties } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { themeStyle } from './theme';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { useBuilderState, useBuilderDispatch } from './useBuilderStore';
import { BlockRenderer } from './BlockRenderer';
import { collectImplicitVars } from './schema';
import { RuntimeProvider, useCanvasRuntime } from './render-node';

export function BuilderCanvas() {
  const state = useBuilderState();
  const dispatch = useBuilderDispatch();
  // El runtime siembra también el estado implícito de los widgets sin `bindTo`,
  // para que el modo interactivo arranque con sus valores iniciales reales.
  const allVars = useMemo(
    () => [...state.stateVars, ...collectImplicitVars(state.blocks, state.rootIds, state.stateVars)],
    [state.blocks, state.rootIds, state.stateVars],
  );
  const { runtime, reset } = useCanvasRuntime(allVars);

  const { setNodeRef, isOver } = useDroppable({
    id: 'canvas-root',
    data: { parentId: undefined },
    disabled: state.canvasMode === 'interactive',
  });

  const isEmpty = state.rootIds.length === 0;
  const interactive = state.canvasMode === 'interactive';
  // El lienzo desplaza en los dos ejes: un bloque redimensionado a más ancho que
  // el panel (o una tabla larga) quedaba recortado y sin forma de alcanzarlo.

  return (
    <RuntimeProvider runtime={runtime}>
      {interactive && (
        <div className="flex items-center justify-between px-4 py-2 bg-amber-50 border-b border-amber-200">
          <span className="text-xs text-amber-800">
            Modo interactivo: el componente se comporta como en producción. La edición está pausada.
          </span>
          <button
            onClick={reset}
            className="text-xs font-medium text-amber-700 hover:text-amber-900 underline"
          >
            Reiniciar estado
          </button>
        </div>
      )}
    <div
      ref={setNodeRef}
      data-canvas=""
      onClick={() => { if (!interactive) dispatch({ type: 'SELECT', id: null }); }}
      onDoubleClick={(e) => {
        // Doble clic sobre el fondo vacío: añade un texto y abre su editor.
        // Los bloques cortan la propagación, así que aquí solo llega el fondo.
        if (!interactive) {
          e.preventDefault();
          dispatch({ type: 'ADD_BLOCK', blockType: 'p', autoEdit: true });
        }
      }}
      title={interactive ? undefined : 'Doble clic para añadir un texto'}
      className={`flex-1 overflow-auto transition-colors min-h-0
        ${isOver ? 'bg-blue-50' : 'bg-slate-50'}
        ${isEmpty ? 'flex items-center justify-center' : 'px-6 pb-6 pt-12'}`}
      style={{
        backgroundImage: isEmpty ? 'none' : 'radial-gradient(circle, #cbd5e1 1px, transparent 1px)',
        backgroundSize: '20px 20px',
      }}
    >
      {isEmpty ? (
        <div className="text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-slate-200 flex items-center justify-center">
            <svg className="w-8 h-8 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
          </div>
          <p className="text-sm font-medium text-slate-500">Arrastra componentes aquí</p>
          <p className="text-xs text-slate-400 mt-1">o usa el chat IA para generar un componente</p>
        </div>
      ) : (
        // Las variables del tema se aplican aquí y no al lienzo entero: dentro
        // van los bloques del componente, fuera está la interfaz del editor,
        // que no debe repintarse con el tema de la librería del usuario.
        <div
          className="w-full space-y-2"
          style={{ ...themeStyle(state.theme), fontFamily: 'var(--vz-fuente)' } as CSSProperties}
        >
          <SortableContext items={state.rootIds} strategy={verticalListSortingStrategy}>
            {state.rootIds.map((id, i) => (
              <BlockRenderer key={id} id={id} index={i} />
            ))}
          </SortableContext>
        </div>
      )}
      </div>
    </RuntimeProvider>
  );
}
