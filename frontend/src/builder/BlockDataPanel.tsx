/**
 * Datos de UN bloque: si se repite y qué campo muestra.
 *
 * Son las dos únicas decisiones que un bloque toma sobre el modelo, y se
 * presentan juntas porque se entienden juntas: uno marca la fila como repetidor
 * y a continuación dice qué campo va en cada celda.
 *
 * Sin modelo declarado la sección explica qué falta en lugar de ofrecer
 * controles muertos. Un desplegable de campos vacío no comunica «declara el
 * modelo primero»: comunica «esto no funciona».
 */

import { effectiveFields, hasModel } from './data-model';
import { Section, SelectField } from './panel-ui';
import { useBuilderDispatch, useBuilderState } from './useBuilderStore';

/** Tipos cuyo contenido puede venir de un campo del modelo. */
const TEXT_BLOCKS = new Set(['span', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6']);

export function BlockDataSection({ blockId, open, onToggle }: {
  blockId: string;
  open: boolean;
  onToggle: () => void;
}) {
  const state = useBuilderState();
  const dispatch = useBuilderDispatch();
  const block = state.blocks[blockId];
  if (!block) return null;

  const model = state.model;
  const fields = hasModel(model) ? effectiveFields(model.fields) : [];

  const setProp = (props: Record<string, string>) =>
    dispatch({ type: 'UPDATE_PROPS', id: blockId, props });

  if (fields.length === 0) {
    return (
      <Section title="Datos del bloque" open={open} onToggle={onToggle}>
        <p className="text-[11px] text-slate-500 leading-snug">
          Este componente todavía no recibe datos. Declara el elemento y sus campos
          en <span className="text-slate-300">Datos que recibe</span> y aquí podrás
          repetir este bloque por cada uno y elegir qué campo muestra.
        </p>
      </Section>
    );
  }

  const repite = block.props.repeatOver === 'true';
  // Solo variables numéricas: la página es un índice, y ofrecer una cadena
  // produciría `"2" * 10` en el código emitido.
  const numericVars = state.stateVars.filter((v) => v.type === 'number');
  const esTexto = TEXT_BLOCKS.has(block.type);

  return (
    <Section
      title="Datos del bloque"
      badge={repite ? 'repite' : block.props.bindField || undefined}
      open={open}
      onToggle={onToggle}
    >
      <label className="flex items-start gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={repite}
          onChange={(e) => setProp({ repeatOver: e.target.checked ? 'true' : '' })}
          className="mt-0.5"
        />
        <span className="text-[11px] text-slate-300 leading-snug">
          Repetir por cada elemento
          <span className="block text-[10px] text-slate-500">
            Este bloque y todo lo que contiene se dibuja una vez por elemento de la lista.
          </span>
        </span>
      </label>

      {repite && (
        <div className="rounded-md border border-slate-700 p-2 space-y-1.5">
          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={block.props.paginate === 'true'}
              onChange={(e) => setProp({ paginate: e.target.checked ? 'true' : '' })}
              className="mt-0.5"
            />
            <span className="text-[11px] text-slate-300 leading-snug">
              Paginar
              <span className="block text-[10px] text-slate-500">
                Solo se dibuja la página actual, no toda la colección.
              </span>
            </span>
          </label>

          {block.props.paginate === 'true' && (
            <>
              <SelectField
                label="Registros por página"
                value={block.props.pageSize ?? '10'}
                options={['5', '10', '20', '25', '50'].map((n) => ({ value: n, label: n }))}
                onChange={(pageSize) => setProp({ pageSize })}
              />
              {/*
                La página vive en una variable declarada, no oculta: es lo que
                permite que el bloque de Paginación se enlace a la MISMA con
                `bindTo` y que los dos hablen del mismo número.
              */}
              <SelectField
                label="Variable de página"
                value={block.props.pageVar ?? ''}
                options={numericVars.map((v) => ({ value: v.name, label: v.name }))}
                onChange={(pageVar) => setProp({ pageVar })}
                allowEmpty
                emptyLabel="— elige una —"
              />
              {numericVars.length === 0 ? (
                <p className="text-[10px] text-amber-400 leading-snug">
                  Declara antes una variable de tipo número en «Estado del componente»:
                  es la que guarda la página actual y a la que enlazarás el bloque de Paginación.
                </p>
              ) : !block.props.pageVar && (
                <p className="text-[10px] text-amber-400 leading-snug">
                  Sin variable de página no se pagina: la colección se dibuja entera.
                </p>
              )}
            </>
          )}
        </div>
      )}

      {esTexto ? (
        <SelectField
          label="Mostrar el campo"
          value={block.props.bindField ?? ''}
          options={fields.map((f) => ({ value: f.name, label: f.name }))}
          onChange={(bindField) => setProp({ bindField })}
          allowEmpty
          emptyLabel="— texto fijo —"
        />
      ) : (
        <p className="text-[10px] text-slate-500 leading-snug">
          Para mostrar un campo, usa un bloque de texto (Span, Párrafo o un encabezado)
          dentro de este.
        </p>
      )}

      {block.props.bindField && !repite && (
        // Enlazar sin estar dentro de un repetidor es el error fácil de cometer:
        // el campo se resuelve contra un elemento que no existe y sale vacío.
        <p className="text-[10px] text-amber-400 leading-snug">
          Este bloque muestra un campo pero no está dentro de ningún repetidor.
          Marca «Repetir por cada elemento» en el bloque que lo contiene.
        </p>
      )}
    </Section>
  );
}
