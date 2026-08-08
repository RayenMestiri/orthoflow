import { HttpErrorResponse } from '@angular/common/http';
import type { ApiErrorEnvelope } from '../auth/auth.models';

export interface ApiProblem {
  code: string;
  message: string;
  details?: unknown;
}

export function getApiProblem(error: unknown): ApiProblem {
  if (error instanceof HttpErrorResponse) {
    const envelope = error.error as Partial<ApiErrorEnvelope> | null;
    if (envelope?.error?.code && envelope.error.message) {
      return envelope.error;
    }
    if (error.status === 0) {
      return {
        code: 'API_UNAVAILABLE',
        message:
          'OrthoFlow could not reach the secure server. Check your connection and try again.',
      };
    }
  }
  return { code: 'UNEXPECTED_ERROR', message: 'Something went wrong. Please try again.' };
}
