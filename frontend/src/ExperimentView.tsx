import { useState } from 'react';
import { CORPUS, orderCorpusForSession, type CorpusItem } from './experiment/types';
import { WelcomeView } from './experiment/WelcomeView';
import { TaskView } from './experiment/TaskView';
import { SusView } from './experiment/SusView';
import { DoneView } from './experiment/DoneView';
import { completeSession } from './api/sessions';

type Stage = 'welcome' | 'task' | 'sus' | 'done';

export function ExperimentView() {
  const [stage, setStage] = useState<Stage>('welcome');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [order, setOrder] = useState<CorpusItem[]>(CORPUS);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [scores, setScores] = useState<number[]>([]);

  const item = order[currentIdx];

  function onWelcomeStarted(id: string, jwt: string) {
    setSessionId(id);
    setToken(jwt);
    setOrder(orderCorpusForSession(id));
    setStage('task');
  }

  async function onSusCompleted(score: number) {
    setScores((s) => [...s, score]);
    if (currentIdx + 1 >= order.length) {
      if (sessionId && token) {
        try {
          await completeSession(token, sessionId);
        } catch {
          // La sesión ya tiene todas las mediciones guardadas; no bloquear el cierre.
        }
      }
      setStage('done');
    } else {
      setCurrentIdx((i) => i + 1);
      setStage('task');
    }
  }

  return (
    <>
      {stage === 'task' || stage === 'sus' ? (
        <p className="max-w-2xl mx-auto text-xs text-slate-400 mb-4">
          Componente {currentIdx + 1} de {order.length}
        </p>
      ) : null}

      {stage === 'welcome' && <WelcomeView onStarted={onWelcomeStarted} />}
      {stage === 'task' && sessionId && token && (
        <TaskView
          item={item}
          sessionId={sessionId}
          token={token}
          onCompleted={() => setStage('sus')}
        />
      )}
      {stage === 'sus' && sessionId && token && (
        <SusView
          item={item}
          sessionId={sessionId}
          token={token}
          onCompleted={onSusCompleted}
        />
      )}
      {stage === 'done' && <DoneView totalScores={scores} />}
    </>
  );
}
