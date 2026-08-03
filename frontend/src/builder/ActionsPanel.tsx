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
  BlockAction, BlockEvent, EventName, StateVar, StateVarType, ValidationKind, ValidationRule,
} from './actions';
import {
  EVENT_LABELS, VALIDATION_KINDS_WITH_VALUE, VALIDATION_LABELS,
  isValidPattern, isValidVarName, validationMessage,
} from './actions';
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

  function setEvents(next: BlockEvent[]) {
    dispatch({ type: 'SET_BLOCK_EVENTS', id: blockId, events: next });
  }

  function addEvent(name: EventName) {
    if (events.some((e) => e.event === name)) return;
    setEvents([...events, { event: name, actions: [{ kind: 'toggle', target: vars[0]?.name ?? '' }] }]);
  }

  if (vars.length === 0) {
    return (
      <Section title="Acciones" open={open} onToggle={onToggle}>
        <p className="text-[11px] text-slate-500 leading-snug">
          Declara antes una variable en «Estado del componente». Las acciones operan sobre ellas.
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
                i === ei ? { ...e, actions: [...e.actions, { kind: 'toggle', target: vars[0].name }] } : e,
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

function ActionRow({ action, vars, onChange, onRemove }: {
  action: BlockAction;
  vars: StateVar[];
  onChange: (a: BlockAction) => void;
  onRemove: () => void;
}) {
  const target = 'target' in action ? vars.find((v) => v.name === action.target) : undefined;

  function changeKind(kind: BlockAction['kind']) {
    const name = ('target' in action ? action.target : vars[0]?.name) ?? '';
    switch (kind) {
      case 'toggle': onChange({ kind: 'toggle', target: name }); break;
      case 'set': onChange({ kind: 'set', target: name, value: '' }); break;
      case 'increment': onChange({ kind: 'increment', target: name, by: '1' }); break;
      case 'reset': onChange({ kind: 'reset' }); break;
    }
  }

  return (
    <div className="flex gap-1.5 items-end">
      <div className="flex-1 space-y-1.5">
        <SelectField
          label="Acción"
          value={action.kind}
          options={(Object.keys(ACTION_LABELS) as BlockAction['kind'][]).map((k) => ({ value: k, label: ACTION_LABELS[k] }))}
          onChange={(k) => changeKind(k as BlockAction['kind'])}
        />
        {'target' in action && (
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
  const rule = block.visibleIf;
  const bindable = BINDABLE_TYPES.has(block.type);
  // Solo se ofrecen variables del tipo que el bloque espera: enlazar un campo
  // de texto a un booleano produciría un control roto.
  const expectedType = BINDABLE_VAR_TYPE[block.type];
  const bindableVars = expectedType ? vars.filter((v) => v.type === expectedType) : vars;

  if (vars.length === 0) {
    return (
      <Section title="Comportamiento" open={open} onToggle={onToggle}>
        <p className="text-[11px] text-slate-500 leading-snug">
          Sin variables de estado no hay nada que condicionar.
        </p>
      </Section>
    );
  }

  const ruleTarget = rule ? vars.find((v) => v.name === rule.var) : undefined;

  return (
    <Section title="Comportamiento" open={open} onToggle={onToggle}>
      {bindable && (
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

      <SelectField
        label="Mostrar solo si"
        value={rule?.var || ''}
        options={vars.map((v) => ({ value: v.name, label: v.name }))}
        allowEmpty
        emptyLabel="— siempre visible —"
        onChange={(name) =>
          dispatch({
            type: 'SET_BLOCK_VISIBILITY',
            id: blockId,
            rule: name ? { var: name, op: 'is', value: 'true' } : null,
          })
        }
      />

      {rule && (
        <div className="grid grid-cols-2 gap-1.5">
          <SelectField
            label="Condición"
            value={rule.op}
            options={[{ value: 'is', label: 'es igual a' }, { value: 'not', label: 'es distinto de' }]}
            onChange={(op) =>
              dispatch({ type: 'SET_BLOCK_VISIBILITY', id: blockId, rule: { ...rule, op: op as 'is' | 'not' } })
            }
          />
          {ruleTarget?.type === 'boolean' ? (
            <SelectField
              label="Valor"
              value={rule.value}
              options={[{ value: 'true', label: 'Sí' }, { value: 'false', label: 'No' }]}
              onChange={(value) => dispatch({ type: 'SET_BLOCK_VISIBILITY', id: blockId, rule: { ...rule, value } })}
            />
          ) : (
            <Field
              label="Valor"
              value={rule.value}
              onChange={(value) => dispatch({ type: 'SET_BLOCK_VISIBILITY', id: blockId, rule: { ...rule, value } })}
            />
          )}
        </div>
      )}
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
