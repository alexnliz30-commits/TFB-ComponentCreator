/**
 * Panel del contrato de datos: qué recibe el componente de fuera.
 *
 * Vive junto al panel de estado y no dentro de él porque son cosas distintas y
 * confundirlas lleva a componentes mal diseñados: el estado es lo que el
 * componente RECUERDA mientras se usa —un modal abierto, la pestaña activa— y
 * el modelo es lo que le ENTREGAN. Un pedido no es estado del componente; es su
 * entrada.
 *
 * El valor de ejemplo de cada campo no es decorativo: dibuja el lienzo mientras
 * se diseña, hace compilar el artefacto de verificación —que no tiene props— y
 * acaba siendo el valor por defecto de la prop en el paquete. Por eso se pide
 * aquí y no se deja en blanco.
 */

import { useState } from 'react';
import {
  FIELD_TYPE_LABELS, effectiveFields, isValidFieldName, modelTypeName,
  type DataModel, type FieldType, type ModelField,
} from './data-model';
import { Field, Section, SelectField } from './panel-ui';
import { useBuilderDispatch, useBuilderState } from './useBuilderStore';

const TYPE_OPTIONS = (Object.keys(FIELD_TYPE_LABELS) as FieldType[])
  .map((value) => ({ value, label: FIELD_TYPE_LABELS[value] }));

/** Ejemplo por defecto de un campo recién creado, según su tipo. */
function defaultSample(type: FieldType): string {
  switch (type) {
    case 'number': return '100';
    case 'boolean': return 'true';
    case 'date': return '2026-01-15';
    case 'image': return 'https://placehold.co/80x80';
    default: return 'Texto de ejemplo';
  }
}

export function DataModelSection({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const state = useBuilderState();
  const dispatch = useBuilderDispatch();
  const [draft, setDraft] = useState('');

  const model = state.model;
  const write = (next: Partial<DataModel>) =>
    dispatch({ type: 'SET_MODEL', model: { ...model, ...next } });

  const taken = model.fields.some((f) => f.name === draft.trim());
  const canAdd = draft.trim().length > 0 && isValidFieldName(draft.trim()) && !taken;

  function addField() {
    if (!canAdd) return;
    write({
      fields: [...model.fields, { name: draft.trim(), type: 'text', sample: defaultSample('text') }],
    });
    setDraft('');
  }

  function updateField(index: number, patch: Partial<ModelField>) {
    write({ fields: model.fields.map((f, i) => (i === index ? { ...f, ...patch } : f)) });
  }

  const usable = effectiveFields(model.fields).length;

  return (
    <Section
      title="Datos que recibe"
      badge={usable > 0 ? `${usable}` : undefined}
      open={open}
      onToggle={onToggle}
    >
      <p className="text-[10px] text-slate-500 leading-snug">
        Declara los campos de un elemento. Un bloque marcado como repetidor se
        dibuja una vez por elemento, y sus textos pueden mostrar un campo.
      </p>

      <Field
        label="Nombre del elemento (singular)"
        value={model.name}
        onChange={(name) => write({ name })}
        placeholder="p. ej. Pedido"
      />
      {model.name.trim() && (
        <p className="text-[10px] text-slate-500">
          Se emitirá como <code className="text-slate-400">{modelTypeName(model)}[]</code> en la
          prop <code className="text-slate-400">items</code>.
        </p>
      )}

      {model.fields.map((field, i) => (
        <div key={i} className="rounded-md border border-slate-700 p-2 space-y-1.5">
          <div className="flex items-center gap-1.5">
            <span className="flex-1 text-[11px] font-mono text-slate-200">{field.name}</span>
            <button
              onClick={() => write({ fields: model.fields.filter((_, j) => j !== i) })}
              aria-label={`Quitar ${field.name}`}
              className="w-5 h-5 rounded text-[11px] text-slate-500 hover:text-red-400 hover:bg-slate-700"
            >
              ✕
            </button>
          </div>
          <SelectField
            label="Tipo"
            value={field.type}
            options={TYPE_OPTIONS}
            onChange={(type) =>
              updateField(i, { type: type as FieldType, sample: defaultSample(type as FieldType) })}
          />
          <Field
            label="Valor de ejemplo"
            value={field.sample}
            onChange={(sample) => updateField(i, { sample })}
          />
          {!isValidFieldName(field.name) && (
            <p className="text-[10px] text-red-400">Nombre no válido; este campo se ignora.</p>
          )}
        </div>
      ))}

      <div className="flex gap-1.5 items-end pt-1">
        <div className="flex-1">
          <Field
            label="Nuevo campo"
            value={draft}
            onChange={setDraft}
            onSubmit={addField}
            placeholder="p. ej. cliente"
            invalid={draft.length > 0 && !canAdd}
          />
        </div>
        <button
          onClick={addField}
          disabled={!canAdd}
          className="px-2.5 py-1.5 rounded-md bg-blue-600 text-white text-xs font-medium hover:bg-blue-700 disabled:opacity-30"
        >
          Añadir
        </button>
      </div>
      {taken && <p className="text-[10px] text-red-400">Ya existe un campo con ese nombre.</p>}

      {usable > 0 && (
        <SelectField
          label="Filas de ejemplo en el lienzo"
          value={String(model.sampleRows)}
          options={['1', '2', '3', '5', '8'].map((n) => ({ value: n, label: n }))}
          onChange={(n) => write({ sampleRows: Number(n) || 3 })}
        />
      )}
    </Section>
  );
}
