import { useState } from 'react';
import { blocksForSession, type CorpusBlock } from './experiment/types';
import { WelcomeView } from './experiment/WelcomeView';
import { TaskView } from './experiment/TaskView';
import { SusView } from './experiment/SusView';
import { DoneView } from './experiment/DoneView';
import { completeSession } from './api/sessions';

type Stage = 'welcome' | 'task' | 'sus' | 'pause' | 'done';

/**
 * Máquina de estados de la sesión experimental.
 *
 * La sesión recorre DOS BLOQUES de cinco componentes, uno por condición, y
 * administra el cuestionario SUS una vez al terminar cada bloque. Antes se
 * pasaba tras cada componente: diez cuestionarios y cien ítems Likert por
 * participante, con un instrumento —el SUS— pensado para valorar un sistema y
 * no una pieza suelta. El motivo del cambio y su efecto sobre el contrabalanceo
 * están en `blocksForSession`.
 *
 * Entre los dos bloques hay una pausa explícita. No es cortesía: sin ella la
 * fatiga acumulada del primer bloque se arrastra al segundo y se confunde con
 * el efecto de la condición, que es justo lo que el contrabalanceo intenta
 * separar.
 */
export function ExperimentView() {
  const [stage, setStage] = useState<Stage>('welcome');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [blocks, setBlocks] = useState<CorpusBlock[]>([]);
  const [blockIdx, setBlockIdx] = useState(0);
  const [itemIdx, setItemIdx] = useState(0);
  const [scores, setScores] = useState<number[]>([]);

  const block = blocks[blockIdx];
  const item = block?.items[itemIdx];
  const totalItems = blocks.reduce((n, b) => n + b.items.length, 0);
  const itemNumber = blocks.slice(0, blockIdx).reduce((n, b) => n + b.items.length, 0) + itemIdx + 1;

  function onWelcomeStarted(id: string, jwt: string) {
    setSessionId(id);
    setToken(jwt);
    setBlocks(blocksForSession(id));
    setStage('task');
  }

  function onTaskCompleted() {
    if (itemIdx + 1 < block.items.length) {
      setItemIdx((i) => i + 1);
    } else {
      setStage('sus');
    }
  }

  async function onSusCompleted(score: number) {
    setScores((s) => [...s, score]);
    if (blockIdx + 1 < blocks.length) {
      setStage('pause');
    } else {
      if (sessionId && token) {
        try {
          await completeSession(token, sessionId);
        } catch {
          // La sesión ya tiene todas las mediciones guardadas; no bloquear el cierre.
        }
      }
      setStage('done');
    }
  }

  function onPauseFinished() {
    setBlockIdx((i) => i + 1);
    setItemIdx(0);
    setStage('task');
  }

  return (
    <>
      {stage === 'task' && block && (
        <p className="max-w-2xl mx-auto text-xs text-slate-400 mb-4">
          Conjunto {block.set} · componente {itemIdx + 1} de {block.items.length}
          <span className="text-slate-300"> · {itemNumber} de {totalItems} en total</span>
        </p>
      )}

      {stage === 'welcome' && <WelcomeView onStarted={onWelcomeStarted} />}

      {stage === 'task' && sessionId && token && item && (
        <TaskView
          item={item}
          sessionId={sessionId}
          token={token}
          onCompleted={onTaskCompleted}
        />
      )}

      {stage === 'sus' && sessionId && token && block && (
        <SusView
          block={block}
          sessionId={sessionId}
          token={token}
          onCompleted={onSusCompleted}
        />
      )}

      {stage === 'pause' && (
        <section className="max-w-2xl mx-auto bg-white p-6 rounded shadow space-y-4 text-center">
          <h2 className="text-xl font-semibold">Pausa</h2>
          <p className="text-sm text-slate-600">
            Has terminado el primer conjunto. Tómate un momento antes de continuar con el
            segundo, que tiene el mismo número de componentes y las mismas tareas.
          </p>
          <button
            type="button"
            onClick={onPauseFinished}
            className="bg-blue-600 text-white px-4 py-2 rounded"
          >
            Continuar
          </button>
        </section>
      )}

      {stage === 'done' && <DoneView totalScores={scores} />}
    </>
  );
}
