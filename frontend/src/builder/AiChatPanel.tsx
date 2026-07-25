import { useState, useRef, useEffect } from 'react';
import { useBuilderState, useBuilderDispatch } from './useBuilderStore';
import { currentCode } from './emitters';
import { getDefinition } from './defaults';
import { assist } from '../api/components';
import { sanitizeTree } from './sanitize-tree';
import { PALETTE_CONTEXT_JSON } from './palette-context';

export function AiChatPanel() {
  const state = useBuilderState();
  const dispatch = useBuilderDispatch();
  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [state.chatMessages]);

  const code = currentCode(state);
  const hasBlocks = state.rootIds.length > 0;

  // El lienzo es siempre la fuente de verdad: la IA recibe el árbol completo
  // (bloques, propiedades, estado y bloque seleccionado) y devuelve el árbol
  // resultante, de modo que añadir, modificar, reordenar o eliminar bloques se
  // ve directamente en el lienzo y sigue siendo editable a mano y deshacible.
  // Nunca se aplica código generado por el modelo.
  const selected = state.selectedId ? state.blocks[state.selectedId] : null;

  async function handleSend() {
    const msg = input.trim();
    if (!msg || state.chatLoading) return;

    setInput('');
    dispatch({ type: 'ADD_CHAT_MESSAGE', message: { role: 'user', content: msg } });
    dispatch({ type: 'SET_CHAT_LOADING', loading: true });

    try {
      const res = await assist({
        message: msg,
        treeJson: JSON.stringify({
          blocks: state.blocks,
          rootIds: state.rootIds,
          stateVars: state.stateVars,
        }),
        selectedBlockId: state.selectedId,
        currentCode: hasBlocks ? code : null,
        paletteJson: PALETTE_CONTEXT_JSON,
        themeJson: JSON.stringify(state.theme),
      });

      if (res.applied && res.treeJson) {
        const tree = sanitizeTree(JSON.parse(res.treeJson));
        if (tree) {
          dispatch({
            type: 'LOAD_TREE',
            blocks: tree.blocks,
            rootIds: tree.rootIds,
            stateVars: tree.stateVars,
            componentName: state.componentName,
          });
          // El resultado se ve en el lienzo, no en el código.
          dispatch({ type: 'SET_TAB', tab: 'visual' });
          dispatch({ type: 'ADD_CHAT_MESSAGE', message: { role: 'assistant', content: res.reply } });
        } else {
          dispatch({
            type: 'ADD_CHAT_MESSAGE',
            message: {
              role: 'assistant',
              content: `${res.reply} (El árbol devuelto no pasó la validación y se descartó; el lienzo queda intacto.)`,
            },
          });
        }
      } else {
        dispatch({ type: 'ADD_CHAT_MESSAGE', message: { role: 'assistant', content: res.reply } });
      }
    } catch (err) {
      dispatch({ type: 'ADD_CHAT_MESSAGE', message: { role: 'assistant', content: `Error: ${err instanceof Error ? err.message : 'desconocido'}` } });
    } finally {
      dispatch({ type: 'SET_CHAT_LOADING', loading: false });
    }
  }

  return (
    <div className="flex flex-col h-[calc(100%-40px)]">
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2.5">
        {state.chatMessages.length === 0 && (
          <div className="text-center py-12">
            <svg className="w-8 h-8 mx-auto mb-3 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
            </svg>
            <p className="text-xs text-slate-500">
              {selected
                ? `Describe qué cambiar en «${getDefinition(selected.type).label}»`
                : hasBlocks
                  ? 'Pide añadir, editar, reordenar o eliminar bloques del componente'
                  : 'Describe el componente que quieres construir'}
            </p>
          </div>
        )}
        {state.chatMessages.map((m, i) => (
          <div key={i} className={`px-3 py-2 rounded-xl text-[13px] leading-relaxed max-w-[85%] ${m.role === 'user' ? 'bg-blue-600 text-white ml-auto' : 'bg-slate-800 text-slate-300 mr-auto'}`}>
            {m.content}
          </div>
        ))}
        {state.chatLoading && <div className="bg-slate-800 text-slate-500 px-3 py-2 rounded-xl mr-auto text-xs animate-pulse">Pensando...</div>}
        <div ref={bottomRef} />
      </div>

      {selected && (
        <div className="px-4 pb-2">
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-blue-950/40 border border-blue-900/60">
            <span className="text-xs">{getDefinition(selected.type).icon}</span>
            <span className="text-[11px] text-blue-300 truncate">
              Editando «{getDefinition(selected.type).label}»
            </span>
            <button
              onClick={() => dispatch({ type: 'SELECT', id: null })}
              title="Dejar de editar este bloque"
              className="ml-auto text-blue-500 hover:text-blue-300 text-xs shrink-0"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      <div className="p-3 border-t border-slate-800">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder={
              selected ? 'Modifica este bloque...'
                : hasBlocks ? 'Añade o cambia bloques...'
                : 'Describe el componente...'
            }
            className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
            disabled={state.chatLoading}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || state.chatLoading}
            className="bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 text-white px-3 py-2 rounded-lg transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" /></svg>
          </button>
        </div>
      </div>
    </div>
  );
}
