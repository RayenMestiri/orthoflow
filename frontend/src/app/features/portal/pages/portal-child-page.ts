import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { PortalApiService } from '../data-access/portal-api.service';
import type { PortalChildOverview, PortalConsent, PortalFinance } from '../models/portal.models';
import { PortalDatePipe } from '../presentation/portal-date.pipe';
import { PortalTreatmentTimelineComponent } from '../presentation/portal-treatment-timeline.component';
import { PortalPdfModalComponent } from '../presentation/portal-pdf-modal.component';

@Component({
  selector: 'app-portal-child-page',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    PortalDatePipe,
    PortalTreatmentTimelineComponent,
    PortalPdfModalComponent,
  ],
  template: `
    <section class="portal-page">
      @if (loading()) {
        <div class="skeleton-stack">
          <div class="portal-skeleton skeleton-hero"></div>
          <div class="portal-skeleton skeleton-timeline"></div>
          <div class="portal-skeleton skeleton-card"></div>
        </div>
      } @else if (error()) {
        <div class="portal-error">
          <div class="error-msg">
            <span class="material-icons" aria-hidden="true">error_outline</span>
            <span>{{ error() }}</span>
          </div>
          <a routerLink="/portal/children" class="portal-btn portal-btn--secondary">Retour à la liste</a>
        </div>
      } @else if (overview(); as data) {
        <!-- Breadcrumb & Header -->
        <header class="patient-header">
          <nav class="breadcrumb" aria-label="Fil d'ariane">
            <a routerLink="/portal/children" class="breadcrumb-link">
              <span class="material-icons" aria-hidden="true">chevron_left</span>
              <span>Tous les patients</span>
            </a>
          </nav>

          <div class="patient-hero-card">
            <div class="patient-avatar">
              {{ data.child.fullName.charAt(0) }}
            </div>
            <div class="patient-info">
              <div class="patient-tags">
                <span class="tag-pill">{{ data.child.age !== null ? data.child.age + ' ans' : 'Patient' }}</span>
                <span class="tag-pill tag-pill--rel">{{ friendlyRel(data.child.relationship) }}</span>
                <span class="portal-status portal-status--{{ statusClass(data.child.treatment?.status) }}">
                  {{ friendlyStatus(data.child.treatment?.status) }}
                </span>
              </div>
              <h1 class="patient-title">{{ data.child.fullName }}</h1>
              <p class="patient-clinic">
                <span class="material-icons" aria-hidden="true">verified</span>
                <span>Dossier suivi au cabinet <strong>{{ data.clinic.name }}</strong></span>
              </p>
            </div>
          </div>
        </header>

        <div class="care-stack">
          <!-- 1. Treatment Timeline -->
          <section class="care-section" aria-labelledby="timeline-title">
            <div class="section-header">
              <h2 id="timeline-title" class="section-title">
                <span class="material-icons" aria-hidden="true">auto_graph</span>
                <span>Parcours orthodontique</span>
              </h2>
            </div>
            <app-portal-treatment-timeline [data]="data.child.treatment" />
          </section>

          <!-- 2. Latest Visit & Clinical Guidance Card -->
          <section class="care-section" aria-labelledby="visit-title">
            <div class="section-header">
              <h2 id="visit-title" class="section-title">
                <span class="material-icons" aria-hidden="true">medical_information</span>
                <span>Dernière consultation & Consignes</span>
              </h2>
            </div>

            @if (data.latestVisit; as visit) {
              <article class="visit-guidance-card">
                <div class="guidance-header">
                  <div class="guidance-icon-wrap">
                    <span class="material-icons" aria-hidden="true">history_edu</span>
                  </div>
                  <div>
                    <h3 class="guidance-type">{{ visit.visitLabel }}</h3>
                    <p class="guidance-date">Séance effectuée le {{ visit.visitAt | portalDate: data.clinic.timezone : 'fullDate' }}</p>
                  </div>
                </div>

                <div class="guidance-body">
                  <span class="guidance-label">Consignes et recommandations du praticien :</span>
                  <blockquote class="guidance-quote">
                    {{ visit.patientInstructions || 'Aucune consigne particulière n\\'a été consignée pour cette visite. Continuez le port des appareils selon le protocole convenu.' }}
                  </blockquote>

                  @if (visit.nextRecommendedVisitAt) {
                    <div class="next-rec-box">
                      <span class="material-icons" aria-hidden="true">event_repeat</span>
                      <span>Prochain contrôle conseillé autour du <strong>{{ visit.nextRecommendedVisitAt | portalDate: data.clinic.timezone : 'date' }}</strong></span>
                    </div>
                  }
                </div>
              </article>
            } @else {
              <div class="portal-empty">
                <span class="material-icons empty-icon" aria-hidden="true">receipt_long</span>
                <h3>Aucun compte-rendu de visite</h3>
                <p>Les consignes post-visite apparaîtront ici après votre prochaine consultation.</p>
              </div>
            }
          </section>

          <!-- 3. Next Appointment Card -->
          <section class="care-section" aria-labelledby="apt-section-title">
            <div class="section-header">
              <h2 id="apt-section-title" class="section-title">
                <span class="material-icons" aria-hidden="true">calendar_today</span>
                <span>Prochaine séance</span>
              </h2>
            </div>

            @if (data.child.nextAppointment; as apt) {
              <article class="apt-highlight-card">
                <div class="highlight-date-badge">
                  <span class="h-month">{{ apt.startAt | date: 'MMM' }}</span>
                  <span class="h-day">{{ apt.startAt | date: 'dd' }}</span>
                </div>
                <div class="highlight-info">
                  <span class="portal-status portal-status--active">{{ friendlyStatus(apt.status) }}</span>
                  <h3 class="h-title">{{ apt.typeLabel }}</h3>
                  <p class="h-time">
                    <span class="material-icons" aria-hidden="true">schedule</span>
                    <span>{{ apt.startAt | portalDate: data.clinic.timezone : 'time' }} — {{ apt.endAt | portalDate: data.clinic.timezone : 'time' }}</span>
                  </p>
                </div>
                <a routerLink="/portal/appointments" class="portal-btn portal-btn--secondary">
                  <span>Tous les rendez-vous</span>
                  <span class="material-icons" aria-hidden="true">arrow_forward</span>
                </a>
              </article>
            } @else {
              <div class="no-apt-box">
                <span class="material-icons" aria-hidden="true">event_available</span>
                <div>
                  <p class="no-apt-title">Aucun rendez-vous planifié pour le moment</p>
                  <p class="no-apt-sub">Contactez le secrétariat du cabinet pour convenir d'une date.</p>
                </div>
              </div>
            }
          </section>

          <!-- 4. Financial Status (if authorized) -->
          @if (data.child.canViewFinance) {
            <section class="care-section" aria-labelledby="finance-title">
              <div class="section-header">
                <h2 id="finance-title" class="section-title">
                  <span class="material-icons" aria-hidden="true">receipt_long</span>
                  <span>Situation financière & Règlements</span>
                </h2>
                <a routerLink="/portal/payments" class="portal-link-text">
                  <span>Détail des reçus</span>
                  <span class="material-icons" aria-hidden="true">chevron_right</span>
                </a>
              </div>

              <article class="finance-summary-card">
                @if (financeLoading()) {
                  <p class="portal-muted">Chargement des données financières…</p>
                } @else if (finance(); as f) {
                  <div class="finance-metrics-grid">
                    <div class="f-metric">
                      <span class="f-label">Montant convenu</span>
                      <span class="f-val">{{ f.summary.agreedAmountMinor !== null ? money(f.summary.agreedAmountMinor, f.summary.currency) : '—' }}</span>
                    </div>
                    <div class="f-metric">
                      <span class="f-label">Total réglé au cabinet</span>
                      <span class="f-val f-val--paid">{{ money(f.summary.recordedAmountMinor, f.summary.currency) }}</span>
                    </div>
                    <div class="f-metric">
                      <span class="f-label">Solde restant</span>
                      <span class="f-val f-val--rem">{{ f.summary.remainingAmountMinor !== null ? money(f.summary.remainingAmountMinor, f.summary.currency) : '—' }}</span>
                    </div>
                  </div>

                  @if (f.summary.agreedAmountMinor && f.summary.agreedAmountMinor > 0) {
                    <div class="progress-bar-wrap">
                      <div
                        class="progress-bar-fill"
                        [style.width.%]="calcProgress(f.summary.recordedAmountMinor, f.summary.agreedAmountMinor)"
                      ></div>
                    </div>
                  }
                }
              </article>
            </section>
          }

          <!-- 5. Signed Consents -->
          <section class="care-section" aria-labelledby="consents-title">
            <div class="section-header">
              <h2 id="consents-title" class="section-title">
                <span class="material-icons" aria-hidden="true">draw</span>
                <span>Consentements & Documents signés</span>
              </h2>
            </div>

            <div class="consents-grid">
              @for (item of consents(); track item.id) {
                <article class="consent-item-card">
                  <div class="cst-icon-wrap">
                    <span class="material-icons" aria-hidden="true">verified_user</span>
                  </div>
                  <div class="cst-info">
                    <h4 class="cst-title">{{ item.title }}</h4>
                    <p class="cst-meta">Signé le {{ item.signedAt | portalDate: data.clinic.timezone : 'date' }} par {{ item.signerName }}</p>
                  </div>
                  <button type="button" class="portal-btn portal-btn--secondary" (click)="openPdf(item.downloadPath, item.title, 'Certificat de consentement')">
                    <span class="material-icons" aria-hidden="true">visibility</span>
                    <span>Consulter</span>
                  </button>
                </article>
              } @empty {
                <div class="portal-empty">
                  <span class="material-icons empty-icon" aria-hidden="true">folder_open</span>
                  <p>Aucun consentement signé n'est enregistré pour ce patient.</p>
                </div>
              }
            </div>
          </section>
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
      .patient-header {
        margin-bottom: 28px;
        display: flex;
        flex-direction: column;
        gap: 14px;
      }
      .breadcrumb-link {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        color: #173f38;
        font-size: 13px;
        font-weight: 700;
        text-decoration: none;
      }
      .breadcrumb-link:hover {
        text-decoration: underline;
      }

      .patient-hero-card {
        display: flex;
        align-items: center;
        gap: 20px;
        padding: 24px 28px;
        background: #fffefb;
        border: 1px solid #dce2de;
        border-radius: 20px;
        box-shadow: 0 8px 24px rgba(13, 41, 37, 0.04);
      }
      .patient-avatar {
        width: 56px;
        height: 56px;
        border-radius: 16px;
        background: #173f38;
        color: #fffefb;
        display: grid;
        place-items: center;
        font-size: 24px;
        font-weight: 800;
        flex-shrink: 0;
      }
      .patient-info {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      .patient-tags {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
      }
      .tag-pill {
        display: inline-flex;
        align-items: center;
        padding: 3px 10px;
        border-radius: 99px;
        background: #f6f3ec;
        font-size: 12px;
        font-weight: 600;
        color: #56635f;
      }
      .tag-pill--rel {
        background: #e8efeb;
        color: #173f38;
      }
      .patient-title {
        margin: 0;
        font-size: 24px;
        font-weight: 800;
        letter-spacing: -0.03em;
        color: #0d2925;
      }
      .patient-clinic {
        margin: 0;
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 13px;
        color: #56635f;
      }
      .patient-clinic .material-icons {
        font-size: 16px;
        color: #52b788;
      }

      .care-stack {
        display: flex;
        flex-direction: column;
        gap: 28px;
      }
      .section-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 14px;
      }
      .section-title {
        margin: 0;
        font-size: 17px;
        font-weight: 700;
        color: #0d2925;
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .section-title .material-icons {
        font-size: 20px;
        color: #173f38;
      }
      .portal-link-text {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        color: #173f38;
        font-size: 13px;
        font-weight: 700;
        text-decoration: none;
      }

      /* Visit Guidance Card */
      .visit-guidance-card {
        padding: 24px;
        background: #fffefb;
        border: 1px solid #dce2de;
        border-radius: 18px;
        box-shadow: 0 6px 20px rgba(13, 41, 37, 0.03);
      }
      .guidance-header {
        display: flex;
        align-items: center;
        gap: 14px;
        margin-bottom: 16px;
      }
      .guidance-icon-wrap {
        width: 44px;
        height: 44px;
        border-radius: 12px;
        background: #e8efeb;
        color: #173f38;
        display: grid;
        place-items: center;
        flex-shrink: 0;
      }
      .guidance-type {
        margin: 0;
        font-size: 16px;
        font-weight: 700;
        color: #0d2925;
      }
      .guidance-date {
        margin: 2px 0 0;
        font-size: 12px;
        color: #56635f;
      }
      .guidance-label {
        font-size: 12px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        color: #84918d;
        display: block;
        margin-bottom: 6px;
      }
      .guidance-quote {
        margin: 0 0 16px;
        padding: 16px;
        background: #fbfbf9;
        border-left: 3px solid #173f38;
        border-radius: 0 12px 12px 0;
        font-size: 14px;
        line-height: 1.6;
        color: #17201e;
      }
      .next-rec-box {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 10px 14px;
        border-radius: 10px;
        background: #fbf5ea;
        color: #8c5b16;
        font-size: 13px;
      }
      .next-rec-box .material-icons {
        font-size: 18px;
      }

      /* Next Appointment Highlight */
      .apt-highlight-card {
        display: flex;
        align-items: center;
        gap: 20px;
        padding: 20px 24px;
        border-radius: 18px;
        background: #fffefb;
        border: 1px solid #dce2de;
        box-shadow: 0 6px 20px rgba(13, 41, 37, 0.03);
      }
      .highlight-date-badge {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        width: 68px;
        height: 72px;
        border-radius: 14px;
        background: #e8efeb;
        color: #173f38;
        flex-shrink: 0;
      }
      .h-month {
        font-size: 11px;
        font-weight: 800;
        text-transform: uppercase;
      }
      .h-day {
        font-size: 24px;
        font-weight: 800;
        line-height: 1;
      }
      .highlight-info {
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      .h-title {
        margin: 0;
        font-size: 16px;
        font-weight: 700;
        color: #0d2925;
      }
      .h-time {
        margin: 0;
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 13px;
        color: #56635f;
      }
      .no-apt-box {
        display: flex;
        align-items: center;
        gap: 14px;
        padding: 20px;
        border-radius: 16px;
        background: #fffefb;
        border: 1px dashed #c7d1cc;
      }
      .no-apt-box .material-icons {
        font-size: 28px;
        color: #84918d;
      }
      .no-apt-title {
        margin: 0;
        font-size: 14px;
        font-weight: 700;
        color: #0d2925;
      }
      .no-apt-sub {
        margin: 2px 0 0;
        font-size: 13px;
        color: #56635f;
      }

      /* Finance Card */
      .finance-summary-card {
        padding: 24px;
        border-radius: 18px;
        background: #fffefb;
        border: 1px solid #dce2de;
        box-shadow: 0 6px 20px rgba(13, 41, 37, 0.03);
      }
      .finance-metrics-grid {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 18px;
        margin-bottom: 18px;
      }
      .f-metric {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      .f-label {
        font-size: 12px;
        font-weight: 700;
        color: #84918d;
        text-transform: uppercase;
        letter-spacing: 0.04em;
      }
      .f-val {
        font-size: 20px;
        font-weight: 800;
        color: #0d2925;
      }
      .f-val--paid {
        color: #1e4620;
      }
      .f-val--rem {
        color: #c86445;
      }
      .progress-bar-wrap {
        height: 8px;
        border-radius: 99px;
        background: #e8efeb;
        overflow: hidden;
      }
      .progress-bar-fill {
        height: 100%;
        background: #173f38;
        border-radius: 99px;
        transition: width 0.4s ease;
      }

      /* Consents */
      .consents-grid {
        display: grid;
        gap: 12px;
      }
      .consent-item-card {
        display: flex;
        align-items: center;
        gap: 16px;
        padding: 16px 20px;
        background: #fffefb;
        border: 1px solid #dce2de;
        border-radius: 16px;
        box-shadow: 0 4px 12px rgba(13, 41, 37, 0.02);
      }
      .cst-icon-wrap {
        width: 38px;
        height: 38px;
        border-radius: 10px;
        background: #edf7ed;
        color: #1e4620;
        display: grid;
        place-items: center;
        flex-shrink: 0;
      }
      .cst-info {
        flex: 1;
        min-width: 0;
      }
      .cst-title {
        margin: 0;
        font-size: 14px;
        font-weight: 700;
        color: #0d2925;
      }
      .cst-meta {
        margin: 2px 0 0;
        font-size: 12px;
        color: #56635f;
      }

      /* Skeleton State */
      .skeleton-stack {
        display: flex;
        flex-direction: column;
        gap: 20px;
      }
      .skeleton-hero {
        height: 110px;
        border-radius: 20px;
      }
      .skeleton-timeline {
        height: 180px;
        border-radius: 18px;
      }
      .skeleton-card {
        height: 140px;
        border-radius: 18px;
      }

      @media (max-width: 680px) {
        .patient-hero-card {
          flex-direction: column;
          align-items: flex-start;
        }
        .finance-metrics-grid {
          grid-template-columns: 1fr;
        }
        .apt-highlight-card {
          flex-direction: column;
          align-items: stretch;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PortalChildPage implements OnInit {
  private readonly api = inject(PortalApiService);
  private readonly id = inject(ActivatedRoute).snapshot.paramMap.get('patientId')!;

  protected readonly overview = signal<PortalChildOverview | null>(null);
  protected readonly finance = signal<PortalFinance | null>(null);
  protected readonly consents = signal<PortalConsent[]>([]);
  protected readonly loading = signal(true);
  protected readonly financeLoading = signal(false);
  protected readonly error = signal('');

  protected readonly activePdf = signal<{ path: string; title: string; subtitle: string } | null>(
    null,
  );

  ngOnInit() {
    void this.load();
  }

  protected async load() {
    this.loading.set(true);
    this.error.set('');
    try {
      const data = await firstValueFrom(this.api.overview(this.id));
      this.overview.set(data);

      if (data.child.canViewFinance) {
        this.financeLoading.set(true);
        void firstValueFrom(this.api.finance(this.id))
          .then((f) => this.finance.set(f))
          .finally(() => this.financeLoading.set(false));
      }

      void firstValueFrom(this.api.consents(this.id)).then((c) => this.consents.set(c));
    } catch {
      this.error.set('Impossible de charger le dossier de soins de ce patient.');
    } finally {
      this.loading.set(false);
    }
  }

  protected openPdf(path: string, title: string, subtitle: string) {
    this.activePdf.set({ path, title, subtitle });
  }

  protected friendlyRel(rel: string): string {
    switch (rel) {
      case 'MOTHER':
        return 'Mère';
      case 'FATHER':
        return 'Père';
      case 'LEGAL_GUARDIAN':
        return 'Tuteur légal';
      case 'SELF':
        return 'Patient';
      default:
        return rel.toLowerCase();
    }
  }

  protected friendlyStatus(status?: string): string {
    if (!status) return 'Suivi actif';
    switch (status.toUpperCase()) {
      case 'IN_PROGRESS':
      case 'ACTIVE':
        return 'En cours';
      case 'COMPLETED':
        return 'Terminé';
      case 'PLANNED':
        return 'Planifié';
      default:
        return status;
    }
  }

  protected statusClass(status?: string): string {
    if (!status) return 'active';
    switch (status.toUpperCase()) {
      case 'IN_PROGRESS':
      case 'ACTIVE':
        return 'active';
      case 'COMPLETED':
        return 'active';
      case 'PLANNED':
        return 'warning';
      default:
        return 'active';
    }
  }

  protected money(minor: number, currency: string): string {
    const digits =
      new Intl.NumberFormat(undefined, { style: 'currency', currency }).resolvedOptions()
        .maximumFractionDigits ?? 2;
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(
      minor / 10 ** digits,
    );
  }

  protected calcProgress(paid: number, total: number): number {
    if (!total || total <= 0) return 0;
    return Math.min(100, Math.round((paid / total) * 100));
  }
}
