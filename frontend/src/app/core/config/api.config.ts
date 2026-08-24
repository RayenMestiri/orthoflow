import { InjectionToken } from '@angular/core';

export const API_BASE_URL = new InjectionToken<string>('API_BASE_URL', {
  providedIn: 'root',
  // Production serves the API behind the same HTTPS origin. Development uses
  // Angular's proxy configuration, so no environment-specific host is baked
  // into the browser bundle.
  factory: () => '/api/v1',
});
