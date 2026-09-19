import { useState } from 'react';
import { ComponentSandbox } from '../components/ComponentSandbox';

/**
 * Previsualización del componente a anchos de dispositivo reales.
 *
 * Tiene que montarse en un IFRAME del ancho elegido, y no en un lienzo
 * estrechado con CSS: los breakpoints de Tailwind (`md:`, `lg:`…) se resuelven
 * contra el viewport del documento, así que una caja de 375 px dentro de una
 * ventana de 1920 seguiría dando por buenas las reglas de escritorio y la
 * previsualización mentiría justo en lo que se le está preguntando. Dentro de un
 * iframe de 375 px el viewport ES de 375 px, y lo que se ve es lo que verá quien
 * abra el componente en un móvil.
 *
 * Es además la única superficie que enseña el plegado de los bloques colocados a
 * mano: el lienzo los posiciona con estilo inline, que no entiende de anchos.
 */
interface Dispositivo {
  key: string;
  label: string;
  hint: string;
  /** `null` = ocupar todo el ancho disponible. */
  width: number | null;
}

const DISPOSITIVOS: Dispositivo[] = [
  { key: 'movil', label: 'Móvil', hint: '375 px — por debajo de sm', width: 375 },
  { key: 'tablet', label: 'Tablet', hint: '768 px — justo en el umbral md', width: 768 },
  { key: 'escritorio', label: 'Escritorio', hint: '1280 px — a partir de xl', width: 1280 },
  { key: 'fluido', label: 'Ajustar', hint: 'Todo el ancho disponible', width: null },
];

interface Props {
  sourceCode: string;
  themeCss?: string;
  componentCss?: string;
  /** Destino del código: decide qué framework monta el sandbox. */
  target?: string;
}

export function DevicePreview({ sourceCode, themeCss, componentCss, target }: Props) {
  const [device, setDevice] = useState('fluido');
  const actual = DISPOSITIVOS.find((d) => d.key === device) ?? DISPOSITIVOS[3];

  return (
    /*
      `h-full` y no `flex-1`: quien contiene esto es un bloque corriente, no una
      caja flexible, así que `flex-1` no le decía nada y el iframe se quedaba con
      la altura de su contenido — unos 150 px de panel en una zona de 700.
    */
    <div className="h-full flex flex-col min-h-0">
      <div
        role="group"
        aria-label="Ancho de la previsualización"
        className="flex items-center gap-1 px-2 py-1.5 border-b border-slate-200 bg-white shrink-0"
      >
        {DISPOSITIVOS.map((d) => (
          <button
            key={d.key}
            onClick={() => setDevice(d.key)}
            title={d.hint}
            aria-pressed={d.key === device}
            className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors
              ${d.key === device
                ? 'bg-slate-800 text-white'
                : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'}`}
          >
            {d.label}
          </button>
        ))}
        <span className="ml-auto text-[11px] text-slate-400 tabular-nums pr-1">
          {actual.width ? `${actual.width} px` : 'ancho disponible'}
        </span>
      </div>

      {/*
        El desplazamiento horizontal es intencionado: si el panel es más
        estrecho que el dispositivo elegido, encoger el iframe para que quepa
        volvería a falsear el viewport, que es justo lo que esto evita.
      */}
      <div className="flex-1 overflow-auto bg-slate-100 min-h-0">
        <div
          className="h-full mx-auto bg-white shadow-sm"
          style={actual.width ? { width: actual.width, maxWidth: 'none' } : undefined}
        >
          <ComponentSandbox
            sourceCode={sourceCode}
            themeCss={themeCss}
            componentCss={componentCss}
            target={target}
          />
        </div>
      </div>
    </div>
  );
}
