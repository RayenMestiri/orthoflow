import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { PortalAuthStore } from '../data-access/portal-auth.store';
import { PortalApiService } from '../data-access/portal-api.service';
import type { PortalActionItem, PortalChildSummary, PortalDashboard } from '../models/portal.models';
import { PortalDatePipe } from '../presentation/portal-date.pipe';
import { PortalTreatmentTimelineComponent } from '../presentation/portal-treatment-timeline.component';
import { PortalPdfModalComponent } from '../presentation/portal-pdf-modal.component';

@Component({
  selector: 'app-portal-home-page',
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
      <!-- Loading Skeleton State -->
      @if (loading()) {
        <div class="skeleton-container">
          <div class="portal-skeleton skeleton-hero"></div>
          <div class="skeleton-grid">
            <div class="portal-skeleton skeleton-card"></div>
            <div class="portal-skeleton skeleton-card"></div>
          </div>
        </div>
      } @else if (error()) {
        <div class="portal-error">
          <div class="error-msg">
            <span class="material-icons" aria-hidden="true">error_outline</span>
            <span>{{ error() }}</span>
          </div>
          <button class="portal-btn portal-btn--secondary" type="button" (click)="load()">Réessayer</button>
        </div>
      } @else if (dashboard(); as dash) {
        <!-- Page Header -->
        <header class="home-header">
          <div class="header-titles">
            <p class="portal-kicker">
              <span class="material-icons kicker-icon" aria-hidden="true">home</span>
              Tableau de bord
            </p>
            <h1 class="portal-title">Bonjour, {{ dash.guardian.fullName.split(' ')[0] }}</h1>
            <p class="portal-lede">
              Suivez l'évolution des soins orthodontiques, vos prochains rendez-vous et vos documents partagés.
            </p>
          </div>

          <!-- Multi-Child Selector Chips -->
          @if (dash.children.length > 1) {
            <div class="child-tabs" role="tablist" aria-label="Sélection du patient">
              @for (child of dash.children; track child.id) {
                <button
                  type="button"
                  role="tab"
                  class="child-tab"
                  [class.active]="selectedChildId() === child.id"
                  (click)="selectedChildId.set(child.id)"
                  [attr.aria-selected]="selectedChildId() === child.id"
                >
                  <span class="child-tab-avatar">{{ child.fullName.charAt(0) }}</span>
                  <span class="child-tab-name">{{ child.fullName }}</span>
                </button>
              }
            </div>
          }
        </header>

        <div class="dashboard-stack">
          <!-- 1. Next Appointment Spotlight Card -->
          @if (activeChildNextAppointment(); as apt) {
            <article class="hero-appointment-card">
              <div class="apt-date-badge">
                <span class="apt-month">{{ apt.startAt | date: 'MMM' }}</span>
                <span class="apt-day">{{ apt.startAt | date: 'dd' }}</span>
                <span class="apt-year">{{ apt.startAt | date: 'yyyy' }}</span>
              </div>

              <div class="apt-details">
                <div class="apt-meta-top">
                  <span class="portal-status portal-status--active">Prochain rendez-vous</span>
                  <span class="apt-child-chip">{{ apt.childName }}</span>
                </div>
                <h2 class="apt-title">{{ apt.typeLabel }}</h2>
                <p class="apt-time-info">
                  <span class="material-icons" aria-hidden="true">schedule</span>
                  <span>{{ apt.startAt | portalDate: dash.clinic.timezone : 'time' }} — {{ apt.endAt | portalDate: dash.clinic.timezone : 'time' }}</span>
                  @if (apt.treatmentLabel) {
                    <span class="bullet">·</span>
                    <span class="apt-treatment-tag">{{ apt.treatmentLabel }}</span>
                  }
                </p>
                <div class="apt-location">
                  <span class="material-icons" aria-hidden="true">location_on</span>
                  <span>{{ dash.clinic.name }}</span>
                </div>
              </div>

              <div class="apt-actions">
                <a routerLink="/portal/appointments" class="portal-btn">
                  <span>Détails du RDV</span>
                  <span class="material-icons" aria-hidden="true">arrow_forward</span>
                </a>
              </div>
            </article>
          } @else {
            <article class="no-appointment-card">
              <div class="no-apt-icon">
                <span class="material-icons" aria-hidden="true">event_available</span>
              </div>
              <div class="no-apt-content">
                <h3>Aucun rendez-vous à venir</h3>
                <p>Vos prochains contrôles ou séances seront affichés ici dès leur programmation par le cabinet.</p>
              </div>
              @if (dash.clinic.phone) {
                <a [href]="'tel:' + dash.clinic.phone" class="portal-btn portal-btn--secondary">
                  <span class="material-icons" aria-hidden="true">phone</span>
                  <span>Appeler le cabinet</span>
                </a>
              }
            </article>
          }

          <!-- 2. Action Center ("À faire / Suivi") -->
          @if (dash.actionItems.length) {
            <section class="action-center" aria-labelledby="action-center-title">
              <div class="section-title-row">
                <h3 id="action-center-title" class="section-heading">
                  <span class="material-icons heading-icon" aria-hidden="true">notifications_active</span>
                  <span>À retenir & Actions</span>
                </h3>
                <span class="action-count-badge">{{ dash.actionItems.length }}</span>
              </div>

              <div class="action-items-grid">
                @for (item of dash.actionItems; track item.id) {
                  <article class="action-card" [class.action-card--high]="item.priority === 'HIGH'">
                    <div class="action-icon-wrap" [class.action-icon-wrap--cst]="item.type === 'CONSENT'" [class.action-icon-wrap--apt]="item.type === 'APPOINTMENT'">
                      <span class="material-icons" aria-hidden="true">
                        {{ item.type === 'CONSENT' ? 'draw' : (item.type === 'APPOINTMENT' ? 'calendar_today' : 'health_and_safety') }}
                      </span>
                    </div>

                    <div class="action-content">
                      <div class="action-header">
                        <h4 class="action-title">{{ item.title }}</h4>
                        @if (item.date) {
                          <span class="action-date">{{ item.date | date: 'dd MMM yyyy' }}</span>
                        }
                      </div>
                      <p class="action-subtitle">{{ item.subtitle }}</p>
                    </div>

                    <div class="action-cta">
                      @if (item.type === 'CONSENT') {
                        <button type="button" class="portal-btn portal-btn--secondary action-btn" (click)="openPdf(item.actionUrl, item.title, item.subtitle)">
                          <span class="material-icons" aria-hidden="true">visibility</span>
                          <span>Voir PDF</span>
                        </button>
                      } @else {
                        <a [routerLink]="item.actionUrl" class="portal-btn portal-btn--secondary action-btn">
                          <span>{{ item.actionLabel }}</span>
                          <span class="material-icons" aria-hidden="true">chevron_right</span>
                        </a>
                      }
                    </div>
                  </article>
                }
              </div>
            </section>
          }

          <!-- 3. Treatment Timeline Progress -->
          @if (selectedChild(); as child) {
            <section class="treatment-section" aria-labelledby="treatment-heading">
              <div class="section-title-row">
                <h3 id="treatment-heading" class="section-heading">
                  <span class="material-icons heading-icon" aria-hidden="true">auto_graph</span>
                  <span>Parcours de soins · {{ child.fullName }}</span>
                </h3>
                <a [routerLink]="['/portal/children', child.id]" class="portal-link-text">
                  <span>Voir la fiche complète</span>
                  <span class="material-icons" aria-hidden="true">arrow_forward</span>
                </a>
              </div>

              <app-portal-treatment-timeline [data]="child.treatment" />
            </section>
          }

          <!-- 4. Quick Access Summary Cards Grid -->
          <div class="summary-grid">
            <!-- Documents Card -->
            <article class="quick-card">
              <div class="quick-card-header">
                <span class="quick-icon-wrap quick-icon-wrap--docs">
                  <span class="material-icons" aria-hidden="true">folder_shared</span>
                </span>
                <span class="quick-badge">{{ dash.recentDocumentsCount }} doc(s)</span>
              </div>
              <h4 class="quick-title">Documents médicaux</h4>
              <p class="quick-desc">Consultez vos comptes-rendus, ordonnances et certificats sécurisés.</p>
              <a routerLink="/portal/documents" class="quick-link">
                <span>Accéder aux documents</span>
                <span class="material-icons" aria-hidden="true">chevron_right</span>
              </a>
            </article>

            <!-- Payments Card -->
            <article class="quick-card">
              <div class="quick-card-header">
                <span class="quick-icon-wrap quick-icon-wrap--pay">
                  <span class="material-icons" aria-hidden="true">receipt_long</span>
                </span>
                <span class="quick-badge">Reçus certifiés</span>
              </div>
              <h4 class="quick-title">Paiements & Reçus</h4>
              <p class="quick-desc">Historique transparent des règlements enregistrés au cabinet.</p>
              <a routerLink="/portal/payments" class="quick-link">
                <span>Consulter mes reçus</span>
                <span class="material-icons" aria-hidden="true">chevron_right</span>
              </a>
            </article>

            <!-- Clinic Contact Card -->
            <article class="quick-card quick-card--clinic">
              <div class="quick-card-header">
                <span class="quick-icon-wrap quick-icon-wrap--clinic">
                  <span class="material-icons" aria-hidden="true">local_hospital</span>
                </span>
                <span class="quick-badge quick-badge--verified">Cabinet conventionné</span>
              </div>
              <h4 class="quick-title">{{ dash.clinic.name }}</h4>
              <p class="quick-desc">
                @if (dash.clinic.phone) {
                  <span>Tél : <strong>{{ dash.clinic.phone }}</strong><br /></span>
                }
                @if (dash.clinic.email) {
                  <span>{{ dash.clinic.email }}</span>
                }
              </p>
              @if (dash.clinic.phone) {
                <a [href]="'tel:' + dash.clinic.phone" class="quick-link">
                  <span>Appeler le secrétariat</span>
                  <span class="material-icons" aria-hidden="true">call</span>
                </a>
              }
            </article>
          </div>
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
      .home-header {
        display: flex;
        flex-direction: column;
        gap: 16px;
        margin-bottom: 28px;
      }
      .kicker-icon {
        font-size: 16px;
      }
      .child-tabs {
        display: flex;
        align-items: center;
        gap: 10px;
        flex-wrap: wrap;
      }
      .child-tab {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 6px 14px;
        border-radius: 99px;
        border: 1px solid #dce2de;
        background: #fffefb;
        color: #56635f;
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.18s ease;
      }
      .child-tab-avatar {
        width: 22px;
        height: 22px;
        border-radius: 50%;
        background: #e8efeb;
        color: #173f38;
        display: grid;
        place-items: center;
        font-size: 11px;
        font-weight: 700;
      }
      .child-tab.active {
        background: #173f38;
        border-color: #173f38;
        color: #fffefb;
      }
      .child-tab.active .child-tab-avatar {
        background: #df8b70;
        color: #fffefb;
      }

      .dashboard-stack {
        display: flex;
        flex-direction: column;
        gap: 28px;
      }

      /* Hero Appointment Card */
      .hero-appointment-card {
        display: grid;
        grid-template-columns: auto 1fr auto;
        gap: 24px;
        align-items: center;
        padding: 26px 28px;
        border-radius: 20px;
        background: linear-gradient(135deg, #0d2925 0%, #173f38 100%);
        color: #fffefb;
        box-shadow: 0 16px 36px rgba(13, 41, 37, 0.18);
        border: 1px solid rgba(255, 255, 255, 0.1);
      }
      .apt-date-badge {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        width: 80px;
        height: 86px;
        border-radius: 16px;
        background: rgba(255, 255, 255, 0.1);
        border: 1px solid rgba(255, 255, 255, 0.2);
        color: #fffefb;
      }
      .apt-month {
        font-size: 11px;
        font-weight: 800;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: #df8b70;
      }
      .apt-day {
        font-size: 30px;
        font-weight: 800;
        line-height: 1;
        letter-spacing: -0.04em;
        margin: 2px 0;
      }
      .apt-year {
        font-size: 11px;
        font-weight: 500;
        opacity: 0.8;
      }
      .apt-details {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .apt-meta-top {
        display: flex;
        align-items: center;
        gap: 10px;
        flex-wrap: wrap;
      }
      .apt-child-chip {
        display: inline-flex;
        align-items: center;
        padding: 3px 10px;
        border-radius: 99px;
        background: rgba(255, 255, 255, 0.12);
        font-size: 12px;
        font-weight: 600;
        color: #dce2de;
      }
      .apt-title {
        margin: 0;
        font-size: 20px;
        font-weight: 700;
        letter-spacing: -0.02em;
        color: #fffefb;
      }
      .apt-time-info,
      .apt-location {
        display: flex;
        align-items: center;
        gap: 6px;
        margin: 0;
        font-size: 13px;
        color: #dce2de;
      }
      .apt-time-info .material-icons,
      .apt-location .material-icons {
        font-size: 16px;
        color: #df8b70;
      }
      .bullet {
        margin: 0 4px;
        opacity: 0.6;
      }
      .apt-treatment-tag {
        color: #df8b70;
        font-weight: 600;
      }

      /* No Appointment Card */
      .no-appointment-card {
        display: flex;
        align-items: center;
        gap: 20px;
        padding: 24px 28px;
        border-radius: 20px;
        background: #fffefb;
        border: 1px solid #dce2de;
        box-shadow: 0 8px 24px rgba(13, 41, 37, 0.04);
      }
      .no-apt-icon {
        width: 52px;
        height: 52px;
        border-radius: 14px;
        background: #e8efeb;
        color: #173f38;
        display: grid;
        place-items: center;
        flex-shrink: 0;
      }
      .no-apt-icon .material-icons {
        font-size: 28px;
      }
      .no-apt-content {
        flex: 1;
      }
      .no-apt-content h3 {
        margin: 0 0 4px;
        font-size: 16px;
        font-weight: 700;
        color: #0d2925;
      }
      .no-apt-content p {
        margin: 0;
        font-size: 13px;
        color: #56635f;
      }

      /* Action Center */
      .section-title-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 14px;
      }
      .section-heading {
        margin: 0;
        font-size: 16px;
        font-weight: 700;
        color: #0d2925;
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .heading-icon {
        font-size: 18px;
        color: #c86445;
      }
      .action-count-badge {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 22px;
        height: 22px;
        border-radius: 50%;
        background: #c86445;
        color: #fffefb;
        font-size: 12px;
        font-weight: 700;
      }
      .action-items-grid {
        display: grid;
        gap: 12px;
      }
      .action-card {
        display: grid;
        grid-template-columns: auto 1fr auto;
        gap: 16px;
        align-items: center;
        padding: 16px 20px;
        border-radius: 16px;
        background: #fffefb;
        border: 1px solid #dce2de;
        box-shadow: 0 4px 14px rgba(13, 41, 37, 0.03);
        transition: transform 0.15s ease, box-shadow 0.15s ease;
      }
      .action-card:hover {
        transform: translateY(-1px);
        box-shadow: 0 8px 20px rgba(13, 41, 37, 0.06);
      }
      .action-card--high {
        border-left: 4px solid #c86445;
      }
      .action-icon-wrap {
        width: 40px;
        height: 40px;
        border-radius: 12px;
        background: #f6f3ec;
        color: #56635f;
        display: grid;
        place-items: center;
      }
      .action-icon-wrap--cst {
        background: #fbf5ea;
        color: #8c5b16;
      }
      .action-icon-wrap--apt {
        background: #e8efeb;
        color: #173f38;
      }
      .action-content {
        min-width: 0;
      }
      .action-header {
        display: flex;
        align-items: center;
        gap: 10px;
      }
      .action-title {
        margin: 0;
        font-size: 14px;
        font-weight: 700;
        color: #0d2925;
      }
      .action-date {
        font-size: 11px;
        color: #84918d;
      }
      .action-subtitle {
        margin: 2px 0 0;
        font-size: 13px;
        color: #56635f;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .action-btn {
        min-height: 36px;
        padding: 0 12px;
        font-size: 12px;
      }

      /* Treatment Section */
      .portal-link-text {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        color: #173f38;
        font-size: 13px;
        font-weight: 700;
        text-decoration: none;
      }
      .portal-link-text:hover {
        text-decoration: underline;
      }

      /* Summary Grid */
      .summary-grid {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 18px;
      }
      .quick-card {
        padding: 22px;
        border-radius: 18px;
        background: #fffefb;
        border: 1px solid #dce2de;
        box-shadow: 0 6px 18px rgba(13, 41, 37, 0.03);
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .quick-card-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 4px;
      }
      .quick-icon-wrap {
        width: 38px;
        height: 38px;
        border-radius: 10px;
        display: grid;
        place-items: center;
      }
      .quick-icon-wrap--docs {
        background: #e8efeb;
        color: #173f38;
      }
      .quick-icon-wrap--pay {
        background: #fbf5ea;
        color: #8c5b16;
      }
      .quick-icon-wrap--clinic {
        background: #edf7ed;
        color: #1e4620;
      }
      .quick-badge {
        font-size: 11px;
        font-weight: 700;
        padding: 3px 8px;
        border-radius: 99px;
        background: #f6f3ec;
        color: #56635f;
      }
      .quick-badge--verified {
        background: #edf7ed;
        color: #1e4620;
      }
      .quick-title {
        margin: 0;
        font-size: 15px;
        font-weight: 700;
        color: #0d2925;
      }
      .quick-desc {
        margin: 0;
        font-size: 13px;
        color: #56635f;
        line-height: 1.45;
        flex: 1;
      }
      .quick-link {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        color: #173f38;
        font-size: 13px;
        font-weight: 700;
        text-decoration: none;
        margin-top: 8px;
      }
      .quick-link:hover {
        text-decoration: underline;
      }

      /* Skeleton State */
      .skeleton-container {
        display: flex;
        flex-direction: column;
        gap: 20px;
      }
      .skeleton-hero {
        height: 160px;
        border-radius: 20px;
      }
      .skeleton-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 20px;
      }
      .skeleton-card {
        height: 200px;
        border-radius: 18px;
      }

      @media (max-width: 900px) {
        .summary-grid {
          grid-template-columns: 1fr;
        }
      }

      @media (max-width: 680px) {
        .hero-appointment-card {
          grid-template-columns: 1fr;
          text-align: left;
          padding: 20px;
        }
        .apt-date-badge {
          width: auto;
          height: auto;
          flex-direction: row;
          gap: 8px;
          padding: 8px 14px;
        }
        .apt-day {
          font-size: 18px;
          margin: 0;
        }
        .action-card {
          grid-template-columns: 1fr;
          gap: 12px;
        }
        .action-cta {
          display: flex;
          justify-content: flex-start;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PortalHomePage implements OnInit {
  protected readonly auth = inject(PortalAuthStore);
  private readonly api = inject(PortalApiService);

  protected readonly dashboard = signal<PortalDashboard | null>(null);
  protected readonly selectedChildId = signal<string>('');
  protected readonly loading = signal(true);
  protected readonly error = signal('');

  protected readonly activePdf = signal<{ path: string; title: string; subtitle: string } | null>(
    null,
  );

  protected readonly selectedChild = computed<PortalChildSummary | null>(() => {
    const dash = this.dashboard();
    if (!dash || !dash.children.length) return null;
    const currentId = this.selectedChildId();
    return dash.children.find((c) => c.id === currentId) ?? dash.children[0] ?? null;
  });

  protected readonly activeChildNextAppointment = computed(() => {
    const child = this.selectedChild();
    if (child && child.nextAppointment) return child.nextAppointment;
    return this.dashboard()?.nextAppointment ?? null;
  });

  ngOnInit() {
    void this.load();
  }

  protected async load() {
    this.loading.set(true);
    this.error.set('');
    try {
      try {
        const data = await firstValueFrom(this.api.dashboard());
        this.dashboard.set(data);
        if (data.children.length && !this.selectedChildId()) {
          this.selectedChildId.set(data.children[0].id);
        }
        return;
      } catch {
        // Resilient fallback projection
        const [children, appointments, docs] = await Promise.all([
          firstValueFrom(this.api.children()).catch(() => []),
          firstValueFrom(this.api.appointments()).catch(() => []),
          firstValueFrom(this.api.documents()).catch(() => []),
        ]);
        const profile = this.auth.profile();
        const now = new Date();
        const upcoming = appointments
          .filter((a) => new Date(a.startAt) >= now && a.status !== 'CANCELLED')
          .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());
        const nextAppointment = upcoming[0] ?? null;

        const actionItems: PortalActionItem[] = [];
        if (nextAppointment) {
          actionItems.push({
            id: `apt-${nextAppointment.id}`,
            type: 'APPOINTMENT',
            priority: 'HIGH',
            title: 'Prochain rendez-vous',
            subtitle: `${nextAppointment.typeLabel} · ${nextAppointment.childName}`,
            date: nextAppointment.startAt,
            patientId: nextAppointment.patientId,
            patientName: nextAppointment.childName,
            actionLabel: 'Voir le rendez-vous',
            actionUrl: '/portal/appointments',
          });
        }
        for (const child of children) {
          if (child.retention?.nextRecommendedControlAt) {
            actionItems.push({
              id: `ret-${child.id}`,
              type: 'FOLLOW_UP',
              priority: 'NORMAL',
              title: 'Contrôle de contention',
              subtitle: `Suivi recommandé pour ${child.fullName}`,
              date: child.retention.nextRecommendedControlAt,
              patientId: child.id,
              patientName: child.fullName,
              actionLabel: 'Consulter le suivi',
              actionUrl: `/portal/children/${child.id}`,
            });
          }
        }

        const fallbackDashboard: PortalDashboard = {
          guardian: {
            id: profile?.id ?? '',
            fullName: profile?.fullName ?? 'Patient',
            email: profile?.email ?? '',
            guardianId: profile?.guardianId ?? '',
          },
          clinic: {
            id: profile?.clinic?.id ?? '',
            name: profile?.clinic?.name ?? 'OrthoFlow Clinic',
            phone: null,
            email: null,
            timezone: profile?.clinic?.timezone ?? 'UTC',
            currency: profile?.clinic?.currency ?? 'TND',
          },
          children,
          nextAppointment,
          actionItems,
          recentDocumentsCount: docs.length,
        };

        this.dashboard.set(fallbackDashboard);
        if (children.length && !this.selectedChildId()) {
          this.selectedChildId.set(children[0].id);
        }
      }
    } catch {
      this.error.set('Impossible de charger votre tableau de bord.');
    } finally {
      this.loading.set(false);
    }
  }

  protected openPdf(path: string, title: string, subtitle: string) {
    this.activePdf.set({ path, title, subtitle });
  }
}
