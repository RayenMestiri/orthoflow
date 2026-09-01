import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { firstValueFrom } from 'rxjs';
import { PortalApiService } from '../data-access/portal-api.service';
import type { PortalDocument } from '../models/portal.models';
import { PortalPdfModalComponent } from '../presentation/portal-pdf-modal.component';

@Component({
  selector: 'app-portal-documents-page',
  standalone: true,
  imports: [CommonModule, PortalPdfModalComponent],
  template: `
    <section class="portal-page">
      <header class="page-header">
        <p class="portal-kicker">
          <span class="material-icons kicker-icon" aria-hidden="true">folder_shared</span>
          Espace sécurisé
        </p>
        <h1 class="portal-title">Documents partagés</h1>
        <p class="portal-lede">
          Consultez et téléchargez les documents médicaux, comptes-rendus et certificats mis à votre disposition par le cabinet.
        </p>

        <!-- Category Filters -->
        <div class="filter-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            class="tab-btn"
            [class.active]="selectedCategory() === 'ALL'"
            (click)="selectedCategory.set('ALL')"
          >
            <span>Tous les documents</span>
            <span class="count-pill">{{ documents().length }}</span>
          </button>
          <button
            type="button"
            role="tab"
            class="tab-btn"
            [class.active]="selectedCategory() === 'MEDICAL'"
            (click)="selectedCategory.set('MEDICAL')"
          >
            <span class="material-icons tab-icon" aria-hidden="true">medical_services</span>
            <span>Comptes-rendus</span>
          </button>
          <button
            type="button"
            role="tab"
            class="tab-btn"
            [class.active]="selectedCategory() === 'CONSENT'"
            (click)="selectedCategory.set('CONSENT')"
          >
            <span class="material-icons tab-icon" aria-hidden="true">draw</span>
            <span>Consentements</span>
          </button>
        </div>
      </header>

      @if (loading()) {
        <div class="skeleton-list">
          <div class="portal-skeleton skeleton-doc"></div>
          <div class="portal-skeleton skeleton-doc"></div>
          <div class="portal-skeleton skeleton-doc"></div>
        </div>
      } @else if (filteredDocuments().length) {
        <div class="documents-grid">
          @for (item of filteredDocuments(); track item.id) {
            <article class="doc-card">
              <div class="doc-icon-wrap" [class.doc-icon-wrap--cst]="item.category.includes('CONSENT')">
                <span class="material-icons" aria-hidden="true">
                  {{ item.category.includes('CONSENT') ? 'draw' : 'description' }}
                </span>
              </div>

              <div class="doc-content">
                <div class="doc-tags">
                  <span class="doc-cat-tag">{{ friendlyCat(item.category) }}</span>
                  <span class="doc-date">Partagé le {{ item.sharedAt | date: 'dd MMM yyyy' }}</span>
                </div>
                <h3 class="doc-title">{{ item.title }}</h3>
                <p class="doc-meta">Format PDF certifié · Disponible en téléchargement immédiat</p>
              </div>

              <div class="doc-actions">
                <button
                  type="button"
                  class="portal-btn portal-btn--secondary"
                  (click)="openPdf(item)"
                  title="Aperçu du document"
                >
                  <span class="material-icons" aria-hidden="true">visibility</span>
                  <span>Consulter</span>
                </button>
                <button
                  type="button"
                  class="portal-btn portal-btn--outline"
                  (click)="downloadDirect(item)"
                  title="Télécharger sur votre appareil"
                >
                  <span class="material-icons" aria-hidden="true">download</span>
                  <span class="dl-label">Télécharger</span>
                </button>
              </div>
            </article>
          }
        </div>
      } @else {
        <div class="portal-empty">
          <span class="material-icons empty-icon" aria-hidden="true">folder_open</span>
          <h3>Aucun document dans cette catégorie</h3>
          <p>Les nouveaux documents partagés par votre cabinet apparaîtront ici automatiquement.</p>
        </div>
      }

      <!-- PDF Preview Modal -->
      @if (activePdf()) {
        <app-portal-pdf-modal
          [downloadPath]="activePdf()!.path"
          [title]="activePdf()!.title"
          [subtitle]="activePdf()!.subtitle"
          (closed)="activePdf.set(null)"
        />
      }
    </section>
  `,
  styles: [
    `
      .page-header {
        margin-bottom: 28px;
      }
      .kicker-icon {
        font-size: 16px;
      }
      .filter-tabs {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
        margin-top: 10px;
      }
      .tab-btn {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 8px 16px;
        border-radius: 99px;
        border: 1px solid #dce2de;
        background: #fffefb;
        color: #56635f;
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.18s ease;
      }
      .tab-icon {
        font-size: 16px;
      }
      .tab-btn.active {
        background: #173f38;
        border-color: #173f38;
        color: #fffefb;
      }
      .count-pill {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 2px 7px;
        border-radius: 99px;
        background: #e8efeb;
        color: #173f38;
        font-size: 11px;
        font-weight: 700;
      }
      .tab-btn.active .count-pill {
        background: rgba(255, 255, 255, 0.2);
        color: #fffefb;
      }

      /* Documents Grid */
      .documents-grid {
        display: grid;
        gap: 14px;
      }
      .doc-card {
        display: grid;
        grid-template-columns: auto 1fr auto;
        gap: 20px;
        align-items: center;
        padding: 20px 24px;
        background: #fffefb;
        border: 1px solid #dce2de;
        border-radius: 18px;
        box-shadow: 0 4px 16px rgba(13, 41, 37, 0.03);
        transition: transform 0.15s ease, box-shadow 0.15s ease;
      }
      .doc-card:hover {
        transform: translateY(-1px);
        box-shadow: 0 8px 24px rgba(13, 41, 37, 0.06);
      }
      .doc-icon-wrap {
        width: 48px;
        height: 48px;
        border-radius: 14px;
        background: #e8efeb;
        color: #173f38;
        display: grid;
        place-items: center;
        flex-shrink: 0;
      }
      .doc-icon-wrap--cst {
        background: #fbf5ea;
        color: #8c5b16;
      }
      .doc-icon-wrap .material-icons {
        font-size: 24px;
      }

      .doc-content {
        display: flex;
        flex-direction: column;
        gap: 4px;
        min-width: 0;
      }
      .doc-tags {
        display: flex;
        align-items: center;
        gap: 10px;
        flex-wrap: wrap;
      }
      .doc-cat-tag {
        font-size: 11px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        color: #84918d;
      }
      .doc-date {
        font-size: 12px;
        color: #56635f;
      }
      .doc-title {
        margin: 0;
        font-size: 16px;
        font-weight: 700;
        color: #0d2925;
      }
      .doc-meta {
        margin: 0;
        font-size: 13px;
        color: #56635f;
      }

      .doc-actions {
        display: flex;
        align-items: center;
        gap: 10px;
      }

      /* Empty & Skeleton */
      .empty-icon {
        font-size: 48px;
        color: #84918d;
      }
      .skeleton-list {
        display: flex;
        flex-direction: column;
        gap: 14px;
      }
      .skeleton-doc {
        height: 90px;
        border-radius: 18px;
      }

      @media (max-width: 680px) {
        .doc-card {
          grid-template-columns: 1fr;
          gap: 16px;
        }
        .doc-actions {
          display: flex;
          justify-content: flex-start;
          width: 100%;
        }
        .doc-actions .portal-btn {
          flex: 1;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PortalDocumentsPage implements OnInit {
  private readonly api = inject(PortalApiService);

  protected readonly documents = signal<PortalDocument[]>([]);
  protected readonly loading = signal(true);
  protected readonly selectedCategory = signal<'ALL' | 'MEDICAL' | 'CONSENT'>('ALL');

  protected readonly activePdf = signal<{ path: string; title: string; subtitle: string } | null>(
    null,
  );

  protected readonly filteredDocuments = computed(() => {
    const cat = this.selectedCategory();
    const list = this.documents();
    if (cat === 'ALL') return list;
    if (cat === 'CONSENT') return list.filter((d) => d.category.toUpperCase().includes('CONSENT'));
    if (cat === 'MEDICAL') return list.filter((d) => !d.category.toUpperCase().includes('CONSENT'));
    return list;
  });

  ngOnInit() {
    void this.load();
  }

  protected async load() {
    this.loading.set(true);
    try {
      this.documents.set(await firstValueFrom(this.api.documents()));
    } finally {
      this.loading.set(false);
    }
  }

  protected openPdf(item: PortalDocument) {
    this.activePdf.set({
      path: item.downloadPath,
      title: item.title,
      subtitle: `Document généré le ${new Date(item.generatedAt).toLocaleDateString()}`,
    });
  }

  protected async downloadDirect(item: PortalDocument) {
    const blob = await firstValueFrom(this.api.download(item.downloadPath));
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${item.title}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  }

  protected friendlyCat(cat: string): string {
    if (cat.toUpperCase().includes('CONSENT')) return 'Consentement signé';
    if (cat.toUpperCase().includes('PRESCRIPTION')) return 'Ordonnance';
    if (cat.toUpperCase().includes('REPORT') || cat.toUpperCase().includes('SUMMARY'))
      return 'Compte-rendu de soins';
    return cat.toLowerCase().replaceAll('_', ' ');
  }
}
