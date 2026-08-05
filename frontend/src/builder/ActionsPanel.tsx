/**
 * Paneles de comportamiento: variables de estado del componente, acciones por
 * evento y visibilidad condicional.
 *
 * Es la contraparte visual de `actions.ts`. Todo lo que se configura aquí acaba
 * en el código emitido como `useState` y manejadores, y se ejecuta tal cual en
 * el modo interactivo del lienzo.
 */

import { useState } from 'react';
import type {
  BlockAction, BlockEvent, CallbackProp, ConditionOp, EventName, StateVar, StateVarType,
  ValidationKind, ValidationRule, VisibilityRule,
} from './actions';
import {
  CONDITION_OP_LABELS, EVENT_LABELS, OPS_SIN_VALOR, VALIDATION_KINDS_WITH_VALUE,
  VALIDATION_LABELS, isValidCallbackName, isValidPattern, isValidVarName, validationMessage,
} from './actions';
import { effectiveFields } from './data-model';
import { BINDABLE_TYPES, BINDABLE_VAR_TYPE, VALIDATABLE_TYPES } from './schema';
import { Field, Section, SelectField } from './panel-ui';
import { useBuilderDispatch, useBuilderState } from './useBuilderStore';

const TYPE_LABELS: Record<StateVarType, string> = {
  boolean: 'Sí/No',
  number: 'Número',
  string: 'Texto',
};

const ACTION_LABELS: Record<BlockAction['kind'], string> = {
  toggle: 'Invertir (sí/no)',
  set: 'Asignar valor',
  increment: 'Sumar cantidad',
  reset: 'Reiniciar todo el estado',
  call: 'Avisar a la aplicación',
};

/** Valor inicial por defecto de cada tipo. */
const DEFAULT_INITIAL: Record<StateVarType, string> = { boolean: 'false', number: '0', string: '' };

// ── Variables de estado (nivel lienzo) ───────────────────────────────────────

export function StateVarsSection({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const state = useBuilderState();
  const dispatch = useBuilderDispatch();
  const [draft, setDraft] = useState('');

  const nameTaken = state.stateVars.some((v) => v.name === draft.trim());
  const canAdd = draft.trim().length > 0 && isValidVarName(draft.trim()) && !nameTaken;

  function add() {
    if (!canAdd) return;
    dispatch({
      type: 'ADD_STATE_VAR',
      variable: { name: draft.trim(), type: 'boolean', initial: 'false' },
    });
    setDraft('');
  }

  return (
    <Section
      title="Estado del componente"
      badge={state.stateVars.length > 0 ? `${state.stateVars.length}` : undefined}
      open={open}
      onToggle={onToggle}
    >
      <p className="text-[10px] text-slate-500 leading-snug">
        Variables que gobiernan el comportamiento. Se emiten como <code className="text-slate-400">useState</code> y
        puedes probarlas en el modo interactivo.
      </p>

      {state.stateVars.map((v) => (
        <StateVarRow key={v.name} variable={v} />
      ))}

      <div className="flex gap-1.5 items-end pt-1">
        <div className="flex-1">
          <Field
            label="Nueva variable"
            value={draft}
            onChange={setDraft}
            onSubmit={add}
            placeholder="p. ej. modalAbierto"
            invalid={draft.length > 0 && !canAdd}
          />
        </div>
        <button
          onClick={add}
          disabled={!canAdd}
          className="px-2.5 py-1.5 rounded-md bg-blue-600 text-white text-xs font-medium hover:bg-blue-700 disabled:opacity-30"
        >
          Añadir
        </button>
      </div>
      {draft.length > 0 && !isValidVarName(draft.trim()) && (
        <p className="text-[10px] text-red-400">
          Debe ser un identificador válido: letras, números y guion bajo, sin empezar por número.
        </p>
      )}
      {nameTaken && <p className="text-[10px] text-red-400">Ya existe una variable con ese nombre.</p>}
    </Section>
  );
}

function StateVarRow({ variable }: { variable: StateVar }) {
  const dispatch = useBuilderDispatch();

  return (
    <div className="bg-slate-800/60 rounded-md p-2 space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <code className="text-xs text-blue-300 font-mono truncate">{variable.name}</code>
        <button
          onClick={() => dispatch({ type: 'DELETE_STATE_VAR', name: variable.name })}
          title="Eliminar variable y sus referencias"
          className="text-slate-500 hover:text-red-400 text-xs shrink-0"
        >
          ✕
        </button>
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        <SelectField
          label="Tipo"
          value={variable.type}
          options={(Object.keys(TYPE_LABELS) as StateVarType[]).map((t) => ({ value: t, label: TYPE_LABELS[t] }))}
          onChange={(t) =>
            dispatch({
              type: 'UPDATE_STATE_VAR',
              name: variable.name,
              // Al cambiar de tipo, el valor inicial anterior deja de ser válido.
              patch: { type: t as StateVarType, initial: DEFAULT_INITIAL[t as StateVarType] },
            })
          }
        />
        {variable.type === 'boolean' ? (
          <SelectField
            label="Inicial"
            value={variable.initial}
            options={[{ value: 'false', label: 'No' }, { value: 'true', label: 'Sí' }]}
            onChange={(initial) => dispatch({ type: 'UPDATE_STATE_VAR', name: variable.name, patch: { initial } })}
          />
        ) : (
          <Field
            label="Inicial"
            value={variable.initial}
            onChange={(initial) => dispatch({ type: 'UPDATE_STATE_VAR', name: variable.name, patch: { initial } })}
          />
        )}
      </div>
    </div>
  );
}

// ── Props de función (nivel lienzo) ──────────────────────────────────────────

/**
 * Lo que el componente le pide a la aplicación que lo integra.
 *
 * Vive junto al estado y al modelo porque es la tercera pieza del mismo
 * contrato, y se declara antes de usarse por el mismo motivo que una variable:
 * una acción solo puede elegir entre lo que existe, y así el nombre que viaja al
 * código emitido lo ha escrito una persona y no un mecanismo de inferencia.
 */
export function CallbacksSection({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const state = useBuilderState();
  const dispatch = useBuilderDispatch();
  const [draft, setDraft] = useState('');

  const nombre = draft.trim();
  const repetido = state.callbacks.some((c) => c.name === nombre);
  const puedeAñadir = nombre.length > 0 && isValidCallbackName(nombre) && !repetido;

  function setCallbacks(callbacks: CallbackProp[]) {
    dispatch({ type: 'SET_CALLBACKS', callbacks });
  }

  function añadir() {
    if (!puedeAñadir) return;
    setCallbacks([...state.callbacks, { name: nombre, passesItem: false }]);
    setDraft('');
  }

  return (
    <Section
      title="Avisos a la aplicación"
      badge={state.callbacks.length > 0 ? `${state.callbacks.length}` : undefined}
      open={open}
      onToggle={onToggle}
    >
      <p className="text-[10px] text-slate-500 leading-snug">
        Lo que el componente <span className="text-slate-400">no</span> puede decidir por sí mismo:
        borrar un registro, navegar, confirmar. Se emiten como props de función opcionales, así que
        quien integre el componente decide qué hacer — y si no las pasa, no pasa nada.
      </p>

      {state.callbacks.map((cb, i) => (
        <div key={cb.name} className="bg-slate-800/60 rounded-md p-2 space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <code className="text-xs text-emerald-300 font-mono truncate">{cb.name}</code>
            <button
              onClick={() => setCallbacks(state.callbacks.filter((_, j) => j !== i))}
              title="Eliminar el aviso y las acciones que lo llamaban"
              className="text-slate-500 hover:text-red-400 text-xs shrink-0"
            >
              ✕
            </button>
          </div>
          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={cb.passesItem}
              onChange={(e) =>
                setCallbacks(state.callbacks.map((c, j) =>
                  j === i ? { ...c, passesItem: e.target.checked } : c,
                ))
              }
              className="mt-0.5"
            />
            <span className="text-[11px] text-slate-300 leading-snug">
              Enviar el elemento actual
              <span className="block text-[10px] text-slate-500">
                Dentro de un repetidor, quien recibe el aviso sabe de qué elemento se trata.
              </span>
            </span>
          </label>
        </div>
      ))}

      <div className="flex gap-1.5 items-end pt-1">
        <div className="flex-1">
          <Field
            label="Nuevo aviso"
            value={draft}
            onChange={setDraft}
            onSubmit={añadir}
            placeholder="p. ej. onSeleccionar"
            invalid={draft.length > 0 && !puedeAñadir}
          />
        </div>
        <button
          onClick={añadir}
          disabled={!puedeAñadir}
          className="px-2.5 py-1.5 rounded-md bg-blue-600 text-white text-xs font-medium hover:bg-blue-700 disabled:opacity-30"
        >
          Añadir
        </button>
      </div>
      {draft.length > 0 && !isValidCallbackName(nombre) && (
        <p className="text-[10px] text-red-400">
          Debe empezar por <code>on</code> seguido de mayúscula: <code>onSeleccionar</code>, <code>onBorrar</code>.
          Es la convención que hace que quien lea el contrato reconozca un aviso a simple vista.
        </p>
      )}
      {repetido && <p className="text-[10px] text-red-400">Ya existe un aviso con ese nombre.</p>}
    </Section>
  );
}

// ── Editor de condiciones, compartido ────────────────────────────────────────

/**
 * Una condición sobre el estado o sobre el dato actual.
 *
 * Es el mismo editor para la visibilidad y para el estilo condicional a
 * propósito: son la misma condición con dos respuestas distintas, y dos
 * editores parecidos pero no iguales acaban divergiendo en los operadores que
 * ofrecen — que es justo lo que no puede pasar cuando el intérprete es único.
 */
function ConditionEditor({ rule, onChange }: {
  rule: VisibilityRule;
  onChange: (r: VisibilityRule) => void;
}) {
  const state = useBuilderState();
  const vars = state.stateVars;
  const fields = effectiveFields(state.model.fields);

  // Clave combinada para un único desplegable: obligar a elegir primero «estado
  // o dato» y luego el nombre añade un paso a lo que es una sola decisión.
  const clave = rule.field ? `field:${rule.field}` : `var:${rule.var}`;
  const target = rule.field ? undefined : vars.find((v) => v.name === rule.var);
  const campo = rule.field ? fields.find((f) => f.name === rule.field) : undefined;
  const esBooleano = target?.type === 'boolean' || campo?.type === 'boolean';

  return (
    <div className="space-y-1.5">
      <SelectField
        label="Se cumple si"
        value={clave}
        options={[
          ...vars.map((v) => ({ value: `var:${v.name}`, label: `${v.name} (estado)` })),
          ...fields.map((f) => ({ value: `field:${f.name}`, label: `${f.name} (dato)` })),
        ]}
        onChange={(k) => {
          const [tipo, nombre] = [k.slice(0, k.indexOf(':')), k.slice(k.indexOf(':') + 1)];
          onChange(tipo === 'field'
            ? { var: '', field: nombre, op: rule.op, value: rule.value }
            : { var: nombre, op: rule.op, value: rule.value });
        }}
      />
      <div className="grid grid-cols-2 gap-1.5">
        <SelectField
          label="Condición"
          value={rule.op}
          options={(Object.keys(CONDITION_OP_LABELS) as ConditionOp[])
            // A un sí/no solo le aplican la igualdad y la desigualdad: «mayor
            // que No» no significa nada y ofrecerlo sería invitar a escribirlo.
            .filter((op) => !esBooleano || op === 'is' || op === 'not')
            .map((op) => ({ value: op, label: CONDITION_OP_LABELS[op] }))}
          onChange={(op) => onChange({ ...rule, op: op as ConditionOp })}
        />
        {!OPS_SIN_VALOR.has(rule.op) && (
          esBooleano ? (
            <SelectField
              label="Valor"
              value={rule.value}
              options={[{ value: 'true', label: 'Sí' }, { value: 'false', label: 'No' }]}
              onChange={(value) => onChange({ ...rule, value })}
            />
          ) : (
            <Field label="Valor" value={rule.value} onChange={(value) => onChange({ ...rule, value })} />
          )
        )}
      </div>
      {rule.field && (
        <p className="text-[10px] text-slate-500 leading-snug">
          Se evalúa <span className="text-slate-400">por cada elemento</span>: solo tiene efecto dentro
          de un bloque marcado como repetidor.
        </p>
      )}
    </div>
  );
}

// ── Acciones del bloque seleccionado ─────────────────────────────────────────

export function BlockActionsSection({ blockId, open, onToggle }: {
  blockId: string;
  open: boolean;
  onToggle: () => void;
}) {
  const state = useBuilderState();
  const dispatch = useBuilderDispatch();
  const block = state.blocks[blockId];
  if (!block) return null;

  const events = block.events ?? [];
  const vars = state.stateVars;
  const callbacks = state.callbacks;

  function setEvents(next: BlockEvent[]) {
    dispatch({ type: 'SET_BLOCK_EVENTS', id: blockId, events: next });
  }

  /** Acción con la que nace un evento recién añadido, según lo que haya declarado. */
  function accionInicial(): BlockAction {
    return vars.length > 0
      ? { kind: 'toggle', target: vars[0].name }
      : { kind: 'call', target: callbacks[0].name };
  }

  function addEvent(name: EventName) {
    if (events.some((e) => e.event === name)) return;
    setEvents([...events, { event: name, actions: [accionInicial()] }]);
  }

  // Sin variables NI avisos no hay nada que un evento pueda hacer. Con avisos
  // basta: un botón que solo dice «me han pulsado» es un componente legítimo, y
  // exigirle además estado propio obligaba a declarar una variable de mentira.
  if (vars.length === 0 && callbacks.length === 0) {
    return (
      <Section title="Acciones" open={open} onToggle={onToggle}>
        <p className="text-[11px] text-slate-500 leading-snug">
          Declara antes una variable en «Estado del componente», o un aviso en
          «Avisos a la aplicación». Las acciones operan sobre una de las dos cosas.
        </p>
      </Section>
    );
  }

  return (
    <Section
      title="Acciones"
      badge={events.length > 0 ? `${events.length}` : undefined}
      open={open}
      onToggle={onToggle}
    >
      {events.map((event, ei) => (
        <div key={event.event} className="bg-slate-800/60 rounded-md p-2 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-300">{EVENT_LABELS[event.event]}</span>
            <button
              onClick={() => setEvents(events.filter((_, i) => i !== ei))}
              className="text-slate-500 hover:text-red-400 text-xs"
            >
              ✕
            </button>
          </div>

          {event.actions.map((action, ai) => (
            <ActionRow
              key={ai}
              action={action}
              vars={vars}
              callbacks={callbacks}
              onChange={(next) =>
                setEvents(events.map((e, i) =>
                  i === ei ? { ...e, actions: e.actions.map((a, j) => (j === ai ? next : a)) } : e,
                ))
              }
              onRemove={() =>
                setEvents(events.map((e, i) =>
                  i === ei ? { ...e, actions: e.actions.filter((_, j) => j !== ai) } : e,
                ).filter((e) => e.actions.length > 0))
              }
            />
          ))}

          <button
            onClick={() =>
              setEvents(events.map((e, i) =>
                i === ei ? { ...e, actions: [...e.actions, accionInicial()] } : e,
              ))
            }
            className="text-[11px] text-blue-400 hover:text-blue-300"
          >
            + Añadir acción
          </button>
        </div>
      ))}

      <div className="flex flex-wrap gap-1.5 pt-1">
        {(Object.keys(EVENT_LABELS) as EventName[])
          .filter((name) => !events.some((e) => e.event === name))
          .map((name) => (
            <button
              key={name}
              onClick={() => addEvent(name)}
              className="px-2 py-1 rounded-md bg-slate-800 text-slate-400 hover:text-slate-200 text-[11px]"
            >
              + {EVENT_LABELS[name]}
            </button>
          ))}
      </div>
    </Section>
  );
}

function ActionRow({ action, vars, callbacks, onChange, onRemove }: {
  action: BlockAction;
  vars: StateVar[];
  callbacks: CallbackProp[];
  onChange: (a: BlockAction) => void;
  onRemove: () => void;
}) {
  const target = action.kind !== 'call' && 'target' in action
    ? vars.find((v) => v.name === action.target)
    : undefined;

  /** Los tipos que se pueden elegir dependen de lo que haya declarado. */
  const disponibles = (Object.keys(ACTION_LABELS) as BlockAction['kind'][]).filter((k) =>
    k === 'call' ? callbacks.length > 0 : vars.length > 0,
  );

  function changeKind(kind: BlockAction['kind']) {
    // El destino no se arrastra entre espacios de nombres: al pasar de una
    // acción de estado a un aviso, el nombre de la variable no nombra ningún
    // aviso, así que se empieza por el primero de su propia lista.
    const varName = (action.kind !== 'call' && 'target' in action ? action.target : vars[0]?.name) ?? '';
    switch (kind) {
      case 'toggle': onChange({ kind: 'toggle', target: varName }); break;
      case 'set': onChange({ kind: 'set', target: varName, value: '' }); break;
      case 'increment': onChange({ kind: 'increment', target: varName, by: '1' }); break;
      case 'reset': onChange({ kind: 'reset' }); break;
      case 'call': onChange({ kind: 'call', target: callbacks[0]?.name ?? '' }); break;
    }
  }

  return (
    <div className="flex gap-1.5 items-end">
      <div className="flex-1 space-y-1.5">
        <SelectField
          label="Acción"
          value={action.kind}
          options={disponibles.map((k) => ({ value: k, label: ACTION_LABELS[k] }))}
          onChange={(k) => changeKind(k as BlockAction['kind'])}
        />
        {action.kind === 'call' ? (
          <>
            <SelectField
              label="Aviso"
              value={action.target}
              options={callbacks.map((c) => ({ value: c.name, label: c.name }))}
              onChange={(target) => onChange({ kind: 'call', target })}
            />
            <p className="text-[10px] text-slate-500 leading-snug">
              En el lienzo no hace nada: no hay aplicación anfitriona a la que avisar.
              El efecto lo decide quien integre el componente.
            </p>
          </>
        ) : 'target' in action && (
          <SelectField
            label="Variable"
            value={action.target}
            options={vars.map((v) => ({ value: v.name, label: v.name }))}
            onChange={(target) => onChange({ ...action, target })}
          />
        )}
        {action.kind === 'set' && (
          target?.type === 'boolean' ? (
            <SelectField
              label="Valor"
              value={action.value}
              options={[{ value: 'true', label: 'Sí' }, { value: 'false', label: 'No' }]}
              onChange={(value) => onChange({ ...action, value })}
            />
          ) : (
            <Field label="Valor" value={action.value} onChange={(value) => onChange({ ...action, value })} />
          )
        )}
        {action.kind === 'increment' && (
          <Field label="Cantidad" value={action.by} onChange={(by) => onChange({ ...action, by })} />
        )}
      </div>
      <button onClick={onRemove} className="text-slate-500 hover:text-red-400 text-xs pb-1.5">✕</button>
    </div>
  );
}

// ── Visibilidad condicional y enlace de bloques con estado ───────────────────

export function VisibilitySection({ blockId, open, onToggle }: {
  blockId: string;
  open: boolean;
  onToggle: () => void;
}) {
  const state = useBuilderState();
  const dispatch = useBuilderDispatch();
  const block = state.blocks[blockId];
  if (!block) return null;

  const vars = state.stateVars;
  const fields = effectiveFields(state.model.fields);
  const rule = block.visibleIf;
  const styleRules = block.styleRules ?? [];
  const bindable = BINDABLE_TYPES.has(block.type);
  // Solo se ofrecen variables del tipo que el bloque espera: enlazar un campo
  // de texto a un booleano produciría un control roto.
  const expectedType = BINDABLE_VAR_TYPE[block.type];
  const bindableVars = expectedType ? vars.filter((v) => v.type === expectedType) : vars;

  /** Primera condición razonable, para que activar una regla no pida rellenar nada. */
  function condicionInicial(): VisibilityRule {
    return vars.length > 0
      ? { var: vars[0].name, op: 'is', value: vars[0].type === 'boolean' ? 'true' : '' }
      : { var: '', field: fields[0].name, op: 'filled', value: '' };
  }

  if (vars.length === 0 && fields.length === 0) {
    return (
      <Section title="Comportamiento" open={open} onToggle={onToggle}>
        <p className="text-[11px] text-slate-500 leading-snug">
          Aquí decides cuándo se ve un bloque y cuándo cambia de aspecto. Para eso hace falta
          algo que mirar: declara una variable en «Estado del componente» o unos campos en
          «Datos que recibe».
        </p>
      </Section>
    );
  }

  const badge = [rule ? 'condición' : null, styleRules.length > 0 ? `${styleRules.length} estilo` : null]
    .filter(Boolean).join(' · ') || undefined;

  return (
    <Section title="Comportamiento" badge={badge} open={open} onToggle={onToggle}>
      {bindable && vars.length > 0 && (
        <>
          <SelectField
            label="Enlazar con variable"
            value={block.props.bindTo || ''}
            options={bindableVars.map((v) => ({ value: v.name, label: v.name }))}
            allowEmpty
            emptyLabel="— estado propio —"
            onChange={(bindTo) => dispatch({ type: 'UPDATE_PROPS', id: blockId, props: { bindTo } })}
          />
          <p className="text-[10px] text-slate-500 leading-snug">
            Sin enlazar, el bloque usa una variable interna propia. Al enlazarlo, la variable
            elegida gobierna cuál es el elemento activo y puede compartirse entre bloques.
          </p>
          <div className="h-px bg-slate-800 my-1" />
        </>
      )}

      <label className="flex items-start gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={Boolean(rule)}
          onChange={(e) =>
            dispatch({
              type: 'SET_BLOCK_VISIBILITY',
              id: blockId,
              rule: e.target.checked ? condicionInicial() : null,
            })
          }
          className="mt-0.5"
        />
        <span className="text-[11px] text-slate-300 leading-snug">
          Mostrar solo a veces
          <span className="block text-[10px] text-slate-500">
            El bloque desaparece cuando la condición no se cumple.
          </span>
        </span>
      </label>

      {rule && (
        <div className="rounded-md border border-slate-700 p-2">
          <ConditionEditor
            rule={rule}
            onChange={(next) => dispatch({ type: 'SET_BLOCK_VISIBILITY', id: blockId, rule: next })}
          />
        </div>
      )}

      <div className="h-px bg-slate-800 my-1" />

      <p className="text-[10px] text-slate-500 leading-snug">
        <span className="text-slate-400">Cambiar el aspecto según el dato.</span> «Si el stock está
        a cero, píntalo en rojo». Las clases se <span className="text-slate-400">añaden</span> a las
        que ya tiene, así que escribe solo lo que cambia.
      </p>

      {styleRules.map((r, i) => (
        <div key={i} className="rounded-md border border-slate-700 p-2 space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-semibold text-slate-300">Regla {i + 1}</span>
            <button
              onClick={() =>
                dispatch({
                  type: 'SET_BLOCK_STYLE_RULES',
                  id: blockId,
                  rules: styleRules.filter((_, j) => j !== i),
                })
              }
              className="text-slate-500 hover:text-red-400 text-xs shrink-0"
            >
              ✕
            </button>
          </div>
          <ConditionEditor
            rule={r.when}
            onChange={(when) =>
              dispatch({
                type: 'SET_BLOCK_STYLE_RULES',
                id: blockId,
                rules: styleRules.map((x, j) => (j === i ? { ...x, when } : x)),
              })
            }
          />
          <Field
            label="Entonces añade las clases"
            value={r.className}
            placeholder="p. ej. bg-red-50 text-red-700"
            onChange={(className) =>
              dispatch({
                type: 'SET_BLOCK_STYLE_RULES',
                id: blockId,
                rules: styleRules.map((x, j) => (j === i ? { ...x, className } : x)),
              })
            }
          />
        </div>
      ))}

      <button
        onClick={() =>
          dispatch({
            type: 'SET_BLOCK_STYLE_RULES',
            id: blockId,
            rules: [...styleRules, { when: condicionInicial(), className: '' }],
          })
        }
        className="text-[11px] text-blue-400 hover:text-blue-300"
      >
        + Añadir regla de estilo
      </button>
    </Section>
  );
}

// ── Validación del bloque seleccionado ───────────────────────────────────────

/** Reglas ofrecidas según el campo: a un checkbox solo le aplica «obligatorio». */
const KINDS_BY_TYPE: Record<string, ValidationKind[]> = {
  input: ['required', 'minLength', 'maxLength', 'pattern', 'email', 'min', 'max'],
  textarea: ['required', 'minLength', 'maxLength', 'pattern'],
  select: ['required'],
  checkbox: ['required'],
  'date-picker': ['required'],
};

export function ValidationsSection({ blockId, open, onToggle }: {
  blockId: string;
  open: boolean;
  onToggle: () => void;
}) {
  const state = useBuilderState();
  const dispatch = useBuilderDispatch();
  const block = state.blocks[blockId];
  if (!block || !VALIDATABLE_TYPES.has(block.type)) return null;

  const rules = block.validations ?? [];
  const kinds = KINDS_BY_TYPE[block.type] ?? [];
  const available = kinds.filter((k) => !rules.some((r) => r.kind === k));

  function setRules(next: ValidationRule[]) {
    dispatch({ type: 'SET_BLOCK_VALIDATIONS', id: blockId, validations: next });
  }

  return (
    <Section
      title="Validación"
      badge={rules.length > 0 ? `${rules.length}` : undefined}
      open={open}
      onToggle={onToggle}
    >
      <p className="text-[10px] text-slate-500 leading-snug">
        El campo se valida al salir de él y al enviar el formulario; el mensaje
        aparece debajo del control y desaparece al corregirlo.
      </p>

      {rules.map((rule, i) => (
        <ValidationRow
          key={`${rule.kind}-${i}`}
          rule={rule}
          onChange={(next) => setRules(rules.map((r, j) => (j === i ? next : r)))}
          onRemove={() => setRules(rules.filter((_, j) => j !== i))}
        />
      ))}

      {available.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-1">
          {available.map((kind) => (
            <button
              key={kind}
              onClick={() => setRules([...rules, { kind }])}
              className="px-2 py-1 rounded-md bg-slate-800 text-slate-400 hover:text-slate-200 text-[11px]"
            >
              + {VALIDATION_LABELS[kind]}
            </button>
          ))}
        </div>
      )}
    </Section>
  );
}

function ValidationRow({ rule, onChange, onRemove }: {
  rule: ValidationRule;
  onChange: (r: ValidationRule) => void;
  onRemove: () => void;
}) {
  const needsValue = VALIDATION_KINDS_WITH_VALUE.has(rule.kind);
  const badPattern = rule.kind === 'pattern' && !!rule.value && !isValidPattern(rule.value);

  return (
    <div className="bg-slate-800/60 rounded-md p-2 space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold text-slate-300">{VALIDATION_LABELS[rule.kind]}</span>
        <button onClick={onRemove} className="text-slate-500 hover:text-red-400 text-xs shrink-0">✕</button>
      </div>
      {needsValue && (
        <Field
          label={rule.kind === 'pattern' ? 'Expresión regular' : 'Valor'}
          value={rule.value ?? ''}
          onChange={(value) => onChange({ ...rule, value })}
          invalid={badPattern || (rule.kind !== 'pattern' && !!rule.value && !Number.isFinite(Number(rule.value)))}
        />
      )}
      {badPattern && <p className="text-[10px] text-red-400">El patrón no compila como expresión regular.</p>}
      <Field
        label="Mensaje de error"
        value={rule.message ?? ''}
        onChange={(message) => onChange({ ...rule, message })}
        placeholder={validationMessage({ ...rule, message: undefined })}
      />
    </div>
  );
}
