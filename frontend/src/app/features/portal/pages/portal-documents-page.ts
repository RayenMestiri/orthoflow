import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { PortalApiService } from '../data-access/portal-api.service';
import type { PortalDocument } from '../models/portal.models';
@Component({
  selector: 'app-portal-documents-page',
  imports: [DatePipe],
  template: `<section class="portal-page">
    <p class="portal-kicker">Shared by your clinic</p>
    <h1 class="portal-title">Documents</h1>
    <p class="portal-lede">
      Only documents explicitly shared with your guardian account appear here. Clinical media and
      internal files remain private.
    </p>
    @if (loading()) {
      <div class="portal-empty">Loading documents…</div>
    } @else {
      <article class="portal-card">
        @for (item of documents(); track item.id) {
          <div class="portal-row">
            <div>
              <strong>{{ item.title }}</strong>
              <p>
                {{ friendly(item.category) }} · {{ item.generatedAt | date: 'mediumDate'
                }}<br /><small>{{ friendly(item.status) }}</small>
              </p>
            </div>
            <button class="portal-link" (click)="download(item)">Download PDF</button>
          </div>
        } @empty {
          <div class="portal-empty">No shared documents.</div>
        }
      </article>
    }
  </section>`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PortalDocumentsPage implements OnInit {
  private api = inject(PortalApiService);
  protected documents = signal<PortalDocument[]>([]);
  protected loading = signal(true);
  ngOnInit() {
    firstValueFrom(this.api.documents())
      .then((v) => this.documents.set(v))
      .finally(() => this.loading.set(false));
  }
  protected friendly(v: string) {
    return v
      .toLowerCase()
      .replaceAll('_', ' ')
      .replace(/^./, (m) => m.toUpperCase());
  }
  protected async download(item: PortalDocument) {
    const blob = await firstValueFrom(this.api.download(item.downloadPath));
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${item.title}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  }
}
