import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  OnDestroy,
  OnInit,
  Output,
  inject,
  signal,
} from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { PortalApiService } from '../data-access/portal-api.service';
import { firstValueFrom } from 'rxjs';

@Component({
  selector: 'app-portal-pdf-modal',
  standalone: true,
  template: `
    <div class="pdf-modal-backdrop" (click)="close()">
      <div class="pdf-modal-card" (click)="$event.stopPropagation()" role="dialog" aria-modal="true" [attr.aria-label]="title">
        <header class="pdf-modal-header">
          <div class="pdf-modal-title-group">
            <span class="material-icons pdf-icon" aria-hidden="true">description</span>
            <div>
              <h3 class="pdf-modal-title">{{ title }}</h3>
              <p class="pdf-modal-subtitle">{{ subtitle || 'Document officiel partagé par votre cabinet' }}</p>
            </div>
          </div>
          <div class="pdf-modal-actions">
            @if (blobUrl()) {
              <button class="portal-btn portal-btn--secondary" type="button" (click)="download()">
                <span class="material-icons" aria-hidden="true">download</span>
                <span>Télécharger</span>
              </button>
            }
            <button class="pdf-modal-close" type="button" aria-label="Fermer" (click)="close()">
              <span class="material-icons" aria-hidden="true">close</span>
            </button>
          </div>
        </header>

        <div class="pdf-modal-body">
          @if (loading()) {
            <div class="pdf-modal-loading">
              <div class="pdf-spinner"></div>
              <p>Chargement du document en cours…</p>
            </div>
          } @else if (error()) {
            <div class="pdf-modal-error">
              <span class="material-icons error-icon">error_outline</span>
              <p>{{ error() }}</p>
              <button class="portal-btn portal-btn--primary" type="button" (click)="loadDoc()">Réessayer</button>
            </div>
          } @else if (safeUrl()) {
            <iframe class="pdf-frame" [src]="safeUrl()" [title]="title"></iframe>
          }
        </div>
      </div>
    </div>
  `,
  styles: [
    `
      .pdf-modal-backdrop {
        position: fixed;
        inset: 0;
        z-index: 1000;
        background: rgba(13, 41, 37, 0.7);
        backdrop-filter: blur(8px);
        display: grid;
        place-items: center;
        padding: clamp(12px, 3vw, 28px);
        animation: fadeIn 0.2s ease-out;
      }
      .pdf-modal-card {
        background: #fffefb;
        width: min(100%, 960px);
        height: min(92vh, 880px);
        border-radius: 20px;
        box-shadow: 0 32px 80px rgba(13, 41, 37, 0.35);
        display: flex;
        flex-direction: column;
        overflow: hidden;
        border: 1px solid rgba(220, 226, 222, 0.8);
      }
      .pdf-modal-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 16px 24px;
        background: #0d2925;
        color: #fffefb;
        border-bottom: 2px solid #c86445;
        gap: 16px;
      }
      .pdf-modal-title-group {
        display: flex;
        align-items: center;
        gap: 14px;
        min-width: 0;
      }
      .pdf-icon {
        color: #df8b70;
        font-size: 28px;
        flex-shrink: 0;
      }
      .pdf-modal-title {
        margin: 0;
        font-size: 17px;
        font-weight: 700;
        letter-spacing: -0.02em;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .pdf-modal-subtitle {
        margin: 2px 0 0;
        font-size: 12px;
        color: #dce2de;
      }
      .pdf-modal-actions {
        display: flex;
        align-items: center;
        gap: 12px;
        flex-shrink: 0;
      }
      .pdf-modal-close {
        width: 38px;
        height: 38px;
        border-radius: 50%;
        border: 0;
        background: rgba(255, 255, 255, 0.12);
        color: #fffefb;
        display: grid;
        place-items: center;
        cursor: pointer;
        transition: background 0.15s ease;
      }
      .pdf-modal-close:hover {
        background: rgba(255, 255, 255, 0.22);
      }
      .pdf-modal-body {
        flex: 1;
        background: #f6f3ec;
        position: relative;
        display: flex;
        flex-direction: column;
      }
      .pdf-frame {
        width: 100%;
        height: 100%;
        border: 0;
        background: white;
      }
      .pdf-modal-loading,
      .pdf-modal-error {
        margin: auto;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 14px;
        padding: 32px;
        text-align: center;
        color: #56635f;
      }
      .pdf-spinner {
        width: 36px;
        height: 36px;
        border: 3px solid #dce2de;
        border-top-color: #173f38;
        border-radius: 50%;
        animation: spin 0.8s linear infinite;
      }
      .error-icon {
        font-size: 40px;
        color: #c86445;
      }
      .portal-btn {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        height: 38px;
        padding: 0 16px;
        border-radius: 99px;
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.15s ease;
        border: 0;
      }
      .portal-btn--secondary {
        background: #fffefb;
        color: #0d2925;
      }
      .portal-btn--secondary:hover {
        background: #f6f3ec;
      }
      .portal-btn--primary {
        background: #173f38;
        color: #fffefb;
      }
      @keyframes spin {
        to {
          transform: rotate(360deg);
        }
      }
      @keyframes fadeIn {
        from {
          opacity: 0;
        }
        to {
          opacity: 1;
        }
      }
      @media (max-width: 600px) {
        .pdf-modal-card {
          height: 100%;
          border-radius: 0;
        }
        .pdf-modal-header {
          padding: 14px 16px;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PortalPdfModalComponent implements OnInit, OnDestroy {
  private readonly api = inject(PortalApiService);
  private readonly sanitizer = inject(DomSanitizer);

  @Input({ required: true }) downloadPath = '';
  @Input({ required: true }) title = '';
  @Input() subtitle = '';
  @Output() closed = new EventEmitter<void>();

  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly safeUrl = signal<SafeResourceUrl | null>(null);
  protected readonly blobUrl = signal<string | null>(null);

  ngOnInit() {
    void this.loadDoc();
  }

  ngOnDestroy() {
    this.cleanupBlob();
  }

  protected async loadDoc() {
    this.loading.set(true);
    this.error.set('');
    this.cleanupBlob();

    try {
      const blob = await firstValueFrom(this.api.download(this.downloadPath));
      const url = URL.createObjectURL(blob);
      this.blobUrl.set(url);
      this.safeUrl.set(this.sanitizer.bypassSecurityTrustResourceUrl(url));
    } catch {
      this.error.set('Impossible de charger le document.');
    } finally {
      this.loading.set(false);
    }
  }

  protected download() {
    const url = this.blobUrl();
    if (!url) return;
    const a = document.createElement('a');
    a.href = url;
    a.download = `${this.title || 'document'}.pdf`;
    a.click();
  }

  protected close() {
    this.cleanupBlob();
    this.closed.emit();
  }

  private cleanupBlob() {
    const url = this.blobUrl();
    if (url) {
      URL.revokeObjectURL(url);
      this.blobUrl.set(null);
      this.safeUrl.set(null);
    }
  }
}
