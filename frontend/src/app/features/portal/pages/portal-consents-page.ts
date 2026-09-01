import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { firstValueFrom } from 'rxjs';
import { PortalApiService } from '../data-access/portal-api.service';
import type { PortalConsentItem } from '../models/portal.models';
import { PortalPdfModalComponent } from '../presentation/portal-pdf-modal.component';

@Component({
  selector: 'app-portal-consents-page',
  standalone: true,
  imports: [CommonModule, PortalPdfModalComponent],
  template: `
    <section class="portal-page">
      <header class="page-header">
        <p class="portal-kicker">
          <span class="material-icons kicker-icon" aria-hidden="true">draw</span>
          Autorisations légales
        </p>
        <h1 class="portal-title">Consentements éclairés</h1>
        <p class="portal-lede">
          Retrouvez les formulaires de consentement éclairé et autorisations de soins signés électroniquement avec votre cabinet.
        </p>

        @if (uniquePatients().length > 1) {
          <div class="patient-filter-tabs" role="tablist">
            <button
              type="button"
              class="filter-tab"
              [class.active]="selectedPatientId() === 'ALL'"
              (click)="selectedPatientId.set('ALL')"
            >
              <span>Tous les patients</span>
              <span class="count-pill">{{ consents().length }}</span>
            </button>
            @for (patient of uniquePatients(); track patient.id) {
              <button
                type="button"
                class="filter-tab"
                [class.active]="selectedPatientId() === patient.id"
                (click)="selectedPatientId.set(patient.id)"
              >
                <span>{{ patient.name }}</span>
              </button>
            }
          </div>
        }
      </header>

      @if (loading()) {
        <div class="skeleton-list">
          <div class="portal-skeleton skeleton-item"></div>
          <div class="portal-skeleton skeleton-item"></div>
        </div>
      } @else if (filteredConsents().length) {
        <div class="consents-list">
          @for (item of filteredConsents(); track item.id) {
            <article class="consent-card">
              <div class="cst-icon-badge">
                <span class="material-icons" aria-hidden="true">verified_user</span>
              </div>

              <div class="cst-details">
                <div class="cst-tags-row">
                  <span class="patient-chip">{{ item.patientName }}</span>
                  <span class="status-pill status-pill--signed">Signé & Certifié</span>
                </div>
                <h3 class="cst-title">{{ item.title }}</h3>
                <p class="cst-sub">
                  Signé par <strong>{{ item.signerName }}</strong> le {{ item.signedAt | date: 'dd MMMM yyyy à HH:mm' }}
                </p>
              </div>

              <div class="cst-actions">
                <button
                  type="button"
                  class="portal-btn portal-btn--secondary"
                  (click)="openPdf(item)"
                  title="Consulter le certificat PDF"
                >
                  <span class="material-icons" aria-hidden="true">visibility</span>
                  <span>Voir le PDF</span>
                </button>
              </div>
            </article>
          }
        </div>
      } @else {
        <div class="portal-empty">
          <span class="material-icons empty-icon" aria-hidden="true">draw</span>
          <h3>Aucun consentement enregistré</h3>
          <p>Les consentements et autorisations de soins signés avec votre praticien apparaîtront ici.</p>
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
      .patient-filter-tabs {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
        margin-top: 12px;
      }
      .filter-tab {
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
      .filter-tab.active {
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
      .filter-tab.active .count-pill {
        background: rgba(255, 255, 255, 0.2);
        color: #fffefb;
      }

      .consents-list {
        display: flex;
        flex-direction: column;
        gap: 16px;
      }
      .consent-card {
        display: grid;
        grid-template-columns: auto 1fr auto;
        gap: 20px;
        align-items: center;
        padding: 22px 24px;
        background: #fffefb;
        border: 1px solid #dce2de;
        border-radius: 18px;
        box-shadow: 0 4px 18px rgba(13, 41, 37, 0.03);
        transition: transform 0.15s ease, box-shadow 0.15s ease;
      }
      .consent-card:hover {
        transform: translateY(-1px);
        box-shadow: 0 8px 24px rgba(13, 41, 37, 0.06);
      }
      .cst-icon-badge {
        width: 48px;
        height: 48px;
        border-radius: 14px;
        background: #edf7ed;
        color: #1e4620;
        display: grid;
        place-items: center;
        flex-shrink: 0;
      }
      .cst-icon-badge .material-icons {
        font-size: 26px;
      }
      .cst-details {
        display: flex;
        flex-direction: column;
        gap: 4px;
        min-width: 0;
      }
      .cst-tags-row {
        display: flex;
        align-items: center;
        gap: 10px;
      }
      .patient-chip {
        display: inline-flex;
        align-items: center;
        padding: 2px 10px;
        border-radius: 99px;
        background: #f6f3ec;
        font-size: 12px;
        font-weight: 600;
        color: #56635f;
      }
      .status-pill--signed {
        background: #edf7ed;
        color: #1e4620;
      }
      .cst-title {
        margin: 0;
        font-size: 16px;
        font-weight: 700;
        color: #0d2925;
      }
      .cst-sub {
        margin: 0;
        font-size: 13px;
        color: #56635f;
      }

      .empty-icon {
        font-size: 48px;
        color: #84918d;
      }
      .skeleton-list {
        display: flex;
        flex-direction: column;
        gap: 14px;
      }
      .skeleton-item {
        height: 96px;
        border-radius: 18px;
      }

      @media (max-width: 680px) {
        .consent-card {
          grid-template-columns: 1fr;
          gap: 16px;
        }
        .cst-actions {
          display: flex;
          justify-content: flex-start;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PortalConsentsPage implements OnInit {
  private readonly api = inject(PortalApiService);

  protected readonly consents = signal<PortalConsentItem[]>([]);
  protected readonly loading = signal(true);
  protected readonly selectedPatientId = signal<string>('ALL');

  protected readonly activePdf = signal<{ path: string; title: string; subtitle: string } | null>(
    null,
  );

  protected readonly uniquePatients = computed(() => {
    const map = new Map<string, string>();
    for (const c of this.consents()) {
      map.set(c.patientId, c.patientName);
    }
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  });

  protected readonly filteredConsents = computed(() => {
    const id = this.selectedPatientId();
    if (id === 'ALL') return this.consents();
    return this.consents().filter((c) => c.patientId === id);
  });

  ngOnInit() {
    void this.load();
  }

  protected async load() {
    this.loading.set(true);
    try {
      try {
        this.consents.set(await firstValueFrom(this.api.allConsents()));
      } catch {
        // Fallback: list children then aggregate consents
        const children = await firstValueFrom(this.api.children()).catch(() => []);
        const list: PortalConsentItem[] = [];
        for (const child of children) {
          const childConsents = await firstValueFrom(this.api.consents(child.id)).catch(() => []);
          for (const c of childConsents) {
            list.push({
              id: c.id,
              patientId: c.patientId,
              patientName: child.fullName,
              title: c.title,
              category: c.category,
              status: c.status,
              signedAt: c.signedAt,
              signerName: c.signerName,
              downloadPath: c.downloadPath,
            });
          }
        }
        this.consents.set(list);
      }
    } finally {
      this.loading.set(false);
    }
  }

  protected openPdf(item: PortalConsentItem) {
    this.activePdf.set({
      path: item.downloadPath,
      title: item.title,
      subtitle: `Signé par ${item.signerName} pour ${item.patientName}`,
    });
  }
}
