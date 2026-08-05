import { useState, useRef, useEffect } from 'react';
import { useBuilderState, useBuilderDispatch } from './useBuilderStore';
import { currentCode } from './emitters';
import { getDefinition } from './defaults';
import { assist, type AssistImage, type AssistTarget } from '../api/components';
import { sanitizeTree, type SanitizedTree } from './sanitize-tree';
import { effectiveFields } from './data-model';
import { PALETTE_CONTEXT_JSON, STYLE_VOCABULARY_JSON } from './palette-context';

/** Componente listo para crearse en el proyecto, ya validado contra la paleta. */
export interface AssistantComponent extends SanitizedTree {
  name: string;
}

/** Resultado de materializar una tanda: qué se creó y dónde acabó. */
export interface BatchOutcome {
  created: number;
  /** Nombre de la librería en la que se publicaron, si el destino era una. */
  libraryName?: string;
  /** Motivo por el que no se llegó a publicar, cuando el destino era una librería. */
  libraryError?: string;
}

interface AiChatPanelProps {
  /**
   * Crea los componentes de una tanda y los lleva a su destino.
   *
   * Sin proyecto abierto no hay dónde crearlos, y el panel lo dice en vez de
   * descartarlos en silencio.
   */
  onCreateComponents?: (
    components: AssistantComponent[],
    target: AssistTarget | null,
  ) => Promise<BatchOutcome>;
  /** Librerías del backend, para que el asistente ofrezca las que existen. */
  librariesJson?: string | null;
  /** Proyecto abierto y los componentes que ya tiene. */
  projectJson?: string | null;
}

/** Tipos que la API de Claude acepta. El resto se rechaza antes de subirlo. */
const ACCEPTED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

/** Tope por imagen (5 MB), el mismo que aplica la API al contenido en base64. */
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/** Imagen adjunta pendiente de enviar. */
interface PendingImage extends AssistImage {
  name: string;
  /** Data URL completa, para la miniatura. */
  preview: string;
}

export function AiChatPanel({ onCreateComponents, librariesJson, projectJson }: AiChatPanelProps = {}) {
  const state = useBuilderState();
  const dispatch = useBuilderDispatch();
  const [input, setInput] = useState('');
  const [images, setImages] = useState<PendingImage[]>([]);
  const [attachError, setAttachError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [state.chatMessages]);

  const code = currentCode(state);
  const hasBlocks = state.rootIds.length > 0;

  async function attachFiles(files: File[]) {
    const accepted: PendingImage[] = [];
    const problems: string[] = [];

    for (const file of files) {
      if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
        problems.push(`${file.name || 'imagen'}: formato no admitido (PNG, JPEG, WEBP o GIF)`);
        continue;
      }
      if (file.size > MAX_IMAGE_BYTES) {
        problems.push(`${file.name || 'imagen'}: supera los 5 MB`);
        continue;
      }
      const preview = await readAsDataUrl(file);
      accepted.push({
        name: file.name || 'captura',
        mediaType: file.type,
        // El backend espera el base64 pelado: con el prefijo `data:` la API
        // recibiría una cadena que no es base64 y fallaría con un error opaco.
        dataBase64: preview.slice(preview.indexOf(',') + 1),
        preview,
      });
    }

    if (accepted.length > 0) setImages((prev) => [...prev, ...accepted]);
    setAttachError(problems.length > 0 ? problems.join('; ') : null);
  }

  // El lienzo es siempre la fuente de verdad: la IA recibe el árbol completo
  // (bloques, propiedades, estado y bloque seleccionado) y devuelve el árbol
  // resultante, de modo que añadir, modificar, reordenar o eliminar bloques se
  // ve directamente en el lienzo y sigue siendo editable a mano y deshacible.
  // Nunca se aplica código generado por el modelo.
  const selected = state.selectedId ? state.blocks[state.selectedId] : null;

  /*
    Lo que el árbol devuelto puede referenciar además de sus propios bloques.

    El asistente recibe el contrato del componente en el mensaje y puede escribir
    reglas sobre él, pero no lo declara: el modelo y las props de función las fija
    el usuario en su panel. Al validar hay que comprobarlo contra el contrato
    REAL y no contra lo que el modelo diga que existe.
  */
  const treeContext = {
    fieldNames: effectiveFields(state.model.fields).map((f) => f.name),
    callbackNames: state.callbacks.map((c) => c.name),
  };

  async function handleSend(text?: string) {
    const msg = (text ?? input).trim();
    const attached = images;
    // Con imágenes se puede enviar sin escribir nada: la imagen ES la petición.
    if ((!msg && attached.length === 0) || state.chatLoading) return;

    const prompt = msg || 'Analiza esta imagen y dime qué componentes contiene.';

    setInput('');
    setImages([]);
    setAttachError(null);

    // El historial son los turnos ANTERIORES: el actual viaja como mensaje.
    const historyJson = JSON.stringify(
      state.chatMessages.map((m) => ({ role: m.role, content: m.content })),
    );

    dispatch({
      type: 'ADD_CHAT_MESSAGE',
      message: {
        role: 'user',
        content: prompt,
        images: attached.length > 0 ? attached.map((i) => i.preview) : undefined,
      },
    });
    dispatch({ type: 'SET_CHAT_LOADING', loading: true });

    try {
      const res = await assist({
        message: prompt,
        treeJson: JSON.stringify({
          blocks: state.blocks,
          rootIds: state.rootIds,
          stateVars: state.stateVars,
          // El contrato viaja para que el asistente pueda escribir reglas sobre
          // él —«oculta la fila si el pedido está anulado»— en lugar de tener
          // que adivinar qué campos existen. No es suyo: no puede cambiarlo.
          model: state.model,
          callbacks: state.callbacks,
        }),
        selectedBlockId: state.selectedId,
        currentCode: hasBlocks ? code : null,
        paletteJson: PALETTE_CONTEXT_JSON,
        themeJson: JSON.stringify(state.theme),
        styleVocabularyJson: STYLE_VOCABULARY_JSON,
        images: attached.length > 0
          ? attached.map(({ mediaType, dataBase64 }) => ({ mediaType, dataBase64 }))
          : null,
        historyJson,
        librariesJson: librariesJson ?? null,
        projectJson: projectJson ?? null,
      });

      // Una tanda de varios componentes no sustituye el lienzo: cada elemento
      // pasa a ser un componente del proyecto, y solo se aplican los que
      // sobreviven a la validación contra la paleta.
      if (res.components && res.components.length > 0) {
        const valid: AssistantComponent[] = [];
        for (const item of res.components) {
          const tree = sanitizeTree(JSON.parse(item.treeJson), treeContext);
          if (tree) valid.push({ ...tree, name: item.name });
        }

        const outcome = valid.length > 0 && onCreateComponents
          ? await onCreateComponents(valid, res.target)
          : { created: 0 };
        const descartados = res.components.length - valid.length;

        const partes: string[] = [];
        if (outcome.created > 0) {
          partes.push(
            `He creado ${outcome.created} componente${outcome.created === 1 ? '' : 's'} en el proyecto: `
            + `${valid.slice(0, outcome.created).map((c) => c.name).join(', ')}.`,
          );
          // El destino se cuenta con lo que REALMENTE pasó, no con lo que se
          // pidió: decir «publicados en X» cuando el backend falló sería la
          // misma mentira que preguntar el destino y no aplicarlo.
          if (outcome.libraryName) partes.push(`Publicados en la librería «${outcome.libraryName}».`);
          if (outcome.libraryError) partes.push(`No se pudieron publicar en la librería: ${outcome.libraryError}`);
        } else if (!onCreateComponents) {
          partes.push('Abre un proyecto para poder crearlos: sin proyecto no hay dónde guardarlos.');
        } else {
          partes.push('No he podido crear ninguno: los árboles devueltos no pasaron la validación.');
        }
        if (descartados > 0) partes.push(`(${descartados} se descartaron al validar.)`);

        dispatch({
          type: 'ADD_CHAT_MESSAGE',
          message: { role: 'assistant', content: `${res.reply} ${partes.join(' ')}` },
        });
        return;
      }

      if (res.applied && res.treeJson) {
        const tree = sanitizeTree(JSON.parse(res.treeJson), treeContext);
        if (tree) {
          dispatch({
            type: 'LOAD_TREE',
            blocks: tree.blocks,
            rootIds: tree.rootIds,
            stateVars: tree.stateVars,
            // El contrato es del usuario y el asistente no lo declara: hay que
            // devolverlo tal cual. Sin esto, cualquier retoque pedido a la IA
            // borraba el modelo de datos y las props de función del componente
            // —y con ellos las reglas que los nombran— sin decir nada.
            model: state.model,
            callbacks: state.callbacks,
            componentName: state.componentName,
          });
          // El resultado se ve en el lienzo, no en el código.
          dispatch({ type: 'SET_TAB', tab: 'visual' });
          dispatch({ type: 'ADD_CHAT_MESSAGE', message: { role: 'assistant', content: res.reply, options: res.options ?? undefined } });
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
        {state.chatMessages.map((m, i) => {
          // Las respuestas rápidas solo se ofrecen en el último mensaje:
          // contestar a una pregunta de hace varios turnos daría una respuesta
          // fuera de contexto.
          const isLast = i === state.chatMessages.length - 1;
          return (
            <div key={i}>
              <div className={`px-3 py-2 rounded-xl text-[13px] leading-relaxed max-w-[85%] ${m.role === 'user' ? 'bg-blue-600 text-white ml-auto' : 'bg-slate-800 text-slate-300 mr-auto'}`}>
                {m.images && m.images.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-1.5">
                    {m.images.map((src, j) => (
                      <img key={j} src={src} alt="" className="w-16 h-16 object-cover rounded-md border border-white/20" />
                    ))}
                  </div>
                )}
                {m.content}
              </div>
              {isLast && m.options && m.options.length > 0 && !state.chatLoading && (
                <div className="flex flex-wrap gap-1.5 mt-2 mr-auto max-w-[90%]">
                  {m.options.map((option) => (
                    <button
                      key={option}
                      onClick={() => handleSend(option)}
                      className="px-2.5 py-1.5 rounded-lg border border-blue-800/70 bg-blue-950/40 text-[12px] text-blue-200
                        hover:bg-blue-900/60 hover:border-blue-600 transition-colors text-left"
                    >
                      {option}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
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

      <div
        className="p-3 border-t border-slate-800"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          void attachFiles(Array.from(e.dataTransfer.files));
        }}
      >
        {images.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {images.map((img, i) => (
              <div key={i} className="relative group/img">
                <img src={img.preview} alt={img.name} className="w-14 h-14 object-cover rounded-md border border-slate-700" />
                <button
                  onClick={() => setImages(images.filter((_, j) => j !== i))}
                  title="Quitar"
                  className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-slate-900 border border-slate-600
                    text-slate-400 hover:text-red-400 text-[10px] leading-none flex items-center justify-center"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
        {attachError && <p className="text-[10px] text-red-400 mb-2">{attachError}</p>}

        <div className="flex gap-2">
          <input
            ref={fileRef}
            type="file"
            accept={ACCEPTED_IMAGE_TYPES.join(',')}
            multiple
            className="hidden"
            onChange={(e) => {
              void attachFiles(Array.from(e.target.files ?? []));
              // Sin esto, volver a elegir el mismo fichero no dispara `change`.
              e.target.value = '';
            }}
          />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={state.chatLoading}
            title="Adjuntar una captura o boceto (también puedes pegar o arrastrar)"
            className="shrink-0 px-2.5 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-400
              hover:text-slate-200 hover:border-slate-600 disabled:opacity-40 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M18.375 12.739l-7.693 7.693a4.5 4.5 0 01-6.364-6.364l10.94-10.94A3 3 0 1119.5 7.372L8.552 18.32m.009-.01l-.01.01m5.699-9.941l-7.81 7.81a1.5 1.5 0 002.112 2.13" />
            </svg>
          </button>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            onPaste={(e) => {
              const files = Array.from(e.clipboardData.files);
              if (files.length > 0) {
                e.preventDefault();
                void attachFiles(files);
              }
            }}
            placeholder={
              images.length > 0 ? 'Describe qué hacer con la imagen (opcional)...'
                : selected ? 'Modifica este bloque...'
                : hasBlocks ? 'Añade o cambia bloques...'
                : 'Describe el componente o adjunta una imagen...'
            }
            className="flex-1 min-w-0 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
            disabled={state.chatLoading}
          />
          <button
            onClick={() => handleSend()}
            disabled={(!input.trim() && images.length === 0) || state.chatLoading}
            className="bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 text-white px-3 py-2 rounded-lg transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" /></svg>
          </button>
        </div>
      </div>
    </div>
  );
}

/** Lee un fichero como data URL. */
function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
