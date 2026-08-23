import { firstValueFrom, type Observable } from 'rxjs';

/** Opens an authenticated PDF response without exposing a provider URL. */
export async function openAuthenticatedPdf(source: Observable<Blob>): Promise<void> {
  const target = window.open('about:blank', '_blank');
  try {
    const blob = await firstValueFrom(source);
    const url = URL.createObjectURL(blob);
    if (target) target.location.href = url;
    else window.open(url, '_blank', 'noopener');
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (error) {
    target?.close();
    throw error;
  }
}
