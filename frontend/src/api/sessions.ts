import { apiFetch } from './client';
import type { ComponentType } from './components';

export type Condition = 'Ai' | 'Human';

export interface StartSessionResponse {
  sessionId: string;
  participantId: string;
  token: string;
}

export function startSession(participantCode: string): Promise<StartSessionResponse> {
  return apiFetch<StartSessionResponse>({
    path: '/api/sessions/start',
    method: 'POST',
    body: { participantCode },
  });
}

export interface RecordTaskBody {
  componentType: ComponentType;
  condition: Condition;
  durationMs: number;
  errorCount: number;
  success: boolean;
}

export function recordTask(token: string, sessionId: string, body: RecordTaskBody): Promise<void> {
  return apiFetch<void>({
    path: `/api/sessions/${sessionId}/tasks`,
    method: 'POST',
    body,
    token,
  });
}

export interface RecordSusBody {
  /**
   * Nulo cuando el cuestionario valora el conjunto de una condición, que es
   * como se administra el SUS desde el rediseño del protocolo.
   */
  componentType: ComponentType | null;
  condition: Condition;
  items: number[];
}

export interface RecordSusResponse {
  id: string;
  score: number;
}

export function recordSus(token: string, sessionId: string, body: RecordSusBody): Promise<RecordSusResponse> {
  return apiFetch<RecordSusResponse>({
    path: `/api/sessions/${sessionId}/sus`,
    method: 'POST',
    body,
    token,
  });
}

export function completeSession(token: string, sessionId: string): Promise<void> {
  return apiFetch<void>({
    path: `/api/sessions/${sessionId}/complete`,
    method: 'POST',
    token,
  });
}
