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
      let message = envelope.error.message;
      const details = envelope.error.details as
        | { issues?: { path?: string; message?: string }[] }
        | undefined;
      if (details?.issues && Array.isArray(details.issues) && details.issues.length > 0) {
        const issuesText = details.issues
          .map((issue) =>
            issue.path && issue.path !== '(root)' ? `${issue.path}: ${issue.message}` : issue.message,
          )
          .filter(Boolean)
          .join(', ');
        if (issuesText) {
          message = `${message} (${issuesText})`;
        }
      }
      return {
        code: envelope.error.code,
        message,
        details: envelope.error.details,
      };
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
