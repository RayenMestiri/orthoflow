import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { firstValueFrom } from 'rxjs';
import { PortalAuthStore } from '../data-access/portal-auth.store';
import { PortalApiService } from '../data-access/portal-api.service';
import type { PortalAppointment } from '../models/portal.models';
import { PortalDatePipe } from '../presentation/portal-date.pipe';

@Component({
  selector: 'app-portal-appointments-page',
  standalone: true,
  imports: [CommonModule, PortalDatePipe],
  template: `
    <section class="portal-page">
      <header class="page-header">
        <p class="portal-kicker">
          <span class="material-icons kicker-icon" aria-hidden="true">calendar_month</span>
          Visites & Séances
        </p>
        <h1 class="portal-title">Rendez-vous</h1>
        <p class="portal-lede">
          Consultez les rendez-vous à venir et l'historique des consultations passées au cabinet.
        </p>

        <!-- Segmented Tab Filter -->
        <div class="segmented-control" role="tablist">
          <button
            type="button"
            role="tab"
            class="segment-btn"
            [class.active]="tab() === 'UPCOMING'"
            (click)="tab.set('UPCOMING')"
            [attr.aria-selected]="tab() === 'UPCOMING'"
          >
            <span>À venir</span>
            <span class="count-badge">{{ upcomingAppointments().length }}</span>
          </button>
          <button
            type="button"
            role="tab"
            class="segment-btn"
            [class.active]="tab() === 'PAST'"
            (click)="tab.set('PAST')"
            [attr.aria-selected]="tab() === 'PAST'"
          >
            <span>Historique</span>
            <span class="count-badge">{{ pastAppointments().length }}</span>
          </button>
        </div>
      </header>

      @if (loading()) {
        <div class="skeleton-list">
          <div class="portal-skeleton skeleton-item"></div>
          <div class="portal-skeleton skeleton-item"></div>
          <div class="portal-skeleton skeleton-item"></div>
        </div>
      } @else if (tab() === 'UPCOMING') {
        @if (upcomingAppointments().length) {
          <div class="appointments-list">
            @for (item of upcomingAppointments(); track item.id) {
              <article class="apt-card">
                <div class="apt-date-box">
                  <span class="apt-month">{{ item.startAt | date: 'MMM' }}</span>
                  <span class="apt-day">{{ item.startAt | date: 'dd' }}</span>
                  <span class="apt-weekday">{{ item.startAt | date: 'EEEE' }}</span>
                </div>

                <div class="apt-info">
                  <div class="apt-top-row">
                    <span class="child-chip">
                      <span class="material-icons" aria-hidden="true">person</span>
                      <span>{{ item.childName }}</span>
                    </span>
                    <span class="status-pill status-pill--{{ statusClass(item.status) }}">
                      {{ friendlyStatus(item.status) }}
                    </span>
                  </div>

                  <h3 class="apt-type">{{ item.typeLabel }}</h3>

                  <div class="apt-meta-details">
                    <span class="meta-item">
                      <span class="material-icons" aria-hidden="true">schedule</span>
                      <span>{{ item.startAt | portalDate: auth.profile()?.clinic?.timezone : 'time' }} — {{ item.endAt | portalDate: auth.profile()?.clinic?.timezone : 'time' }}</span>
                    </span>
                    @if (item.treatmentLabel) {
                      <span class="meta-item meta-item--treatment">
                        <span class="material-icons" aria-hidden="true">auto_graph</span>
                        <span>{{ item.treatmentLabel }}</span>
                      </span>
                    }
                  </div>
                </div>

                <div class="apt-card-actions">
                  <button type="button" class="portal-btn portal-btn--secondary" (click)="selectedAppointment.set(item)">
                    <span>Détails</span>
                    <span class="material-icons" aria-hidden="true">info</span>
                  </button>
                </div>
              </article>
            }
          </div>
        } @else {
          <div class="portal-empty">
            <span class="material-icons empty-icon" aria-hidden="true">event_available</span>
            <h3>Aucun rendez-vous à venir</h3>
            <p>Tous vos prochains rendez-vous apparaîtront ici dès leur planification.</p>
            @if (auth.profile()?.clinic; as clinic) {
              <p class="portal-muted">Pour prendre un rendez-vous, contactez directement le cabinet {{ clinic.name }}.</p>
            }
          </div>
        }
      } @else {
        <!-- Past appointments list -->
        @if (pastAppointments().length) {
          <div class="appointments-list">
            @for (item of pastAppointments(); track item.id) {
              <article class="apt-card apt-card--past">
                <div class="apt-date-box apt-date-box--past">
                  <span class="apt-month">{{ item.startAt | date: 'MMM' }}</span>
                  <span class="apt-day">{{ item.startAt | date: 'dd' }}</span>
                  <span class="apt-year">{{ item.startAt | date: 'yyyy' }}</span>
                </div>

                <div class="apt-info">
                  <div class="apt-top-row">
                    <span class="child-chip">
                      <span class="material-icons" aria-hidden="true">person</span>
                      <span>{{ item.childName }}</span>
                    </span>
                    <span class="status-pill status-pill--{{ statusClass(item.status) }}">
                      {{ friendlyStatus(item.status) }}
                    </span>
                  </div>

                  <h3 class="apt-type">{{ item.typeLabel }}</h3>

                  <div class="apt-meta-details">
                    <span class="meta-item">
                      <span class="material-icons" aria-hidden="true">history</span>
                      <span>Visite du {{ item.startAt | portalDate: auth.profile()?.clinic?.timezone : 'fullDate' }} à {{ item.startAt | portalDate: auth.profile()?.clinic?.timezone : 'time' }}</span>
                    </span>
                  </div>
                </div>

                <div class="apt-card-actions">
                  <button type="button" class="portal-btn portal-btn--secondary" (click)="selectedAppointment.set(item)">
                    <span>Fiche</span>
                    <span class="material-icons" aria-hidden="true">visibility</span>
                  </button>
                </div>
              </article>
            }
          </div>
        } @else {
          <div class="portal-empty">
            <span class="material-icons empty-icon" aria-hidden="true">history</span>
            <h3>Historique vide</h3>
            <p>Vos consultations et visites passées apparaîtront ici.</p>
          </div>
        }
      }

      <!-- Appointment Detail Modal -->
      @if (selectedAppointment(); as apt) {
        <div class="apt-modal-backdrop" (click)="selectedAppointment.set(null)">
          <div class="apt-modal" (click)="$event.stopPropagation()" role="dialog" aria-modal="true" aria-labelledby="apt-modal-title">
            <header class="apt-modal-header">
              <div class="apt-modal-title-group">
                <span class="material-icons apt-modal-icon" aria-hidden="true">calendar_month</span>
                <div>
                  <h3 id="apt-modal-title" class="apt-modal-title">Détails du rendez-vous</h3>
                  <p class="apt-modal-sub">{{ apt.childName }} · {{ auth.profile()?.clinic?.name }}</p>
                </div>
              </div>
              <button type="button" class="apt-modal-close" aria-label="Fermer" (click)="selectedAppointment.set(null)">
                <span class="material-icons" aria-hidden="true">close</span>
              </button>
            </header>

            <div class="apt-modal-body">
              <div class="modal-info-block">
                <span class="modal-label">Type de consultation</span>
                <p class="modal-value modal-value--highlight">{{ apt.typeLabel }}</p>
              </div>

              <div class="modal-grid-2">
                <div class="modal-info-block">
                  <span class="modal-label">Date</span>
                  <p class="modal-value">{{ apt.startAt | portalDate: auth.profile()?.clinic?.timezone : 'fullDate' }}</p>
                </div>
                <div class="modal-info-block">
                  <span class="modal-label">Horaire</span>
                  <p class="modal-value">{{ apt.startAt | portalDate: auth.profile()?.clinic?.timezone : 'time' }} — {{ apt.endAt | portalDate: auth.profile()?.clinic?.timezone : 'time' }}</p>
                </div>
              </div>

              <div class="modal-grid-2">
                <div class="modal-info-block">
                  <span class="modal-label">Patient</span>
                  <p class="modal-value">{{ apt.childName }}</p>
                </div>
                <div class="modal-info-block">
                  <span class="modal-label">Statut</span>
                  <p class="modal-value">
                    <span class="status-pill status-pill--{{ statusClass(apt.status) }}">
                      {{ friendlyStatus(apt.status) }}
                    </span>
                  </p>
                </div>
              </div>

              @if (apt.treatmentLabel) {
                <div class="modal-info-block">
                  <span class="modal-label">Traitement associé</span>
                  <p class="modal-value">{{ apt.treatmentLabel }}</p>
                </div>
              }

              <div class="modal-clinic-box">
                <div class="clinic-box-header">
                  <span class="material-icons" aria-hidden="true">location_on</span>
                  <strong>{{ auth.profile()?.clinic?.name }}</strong>
                </div>
                <p class="clinic-box-desc">Merci d'arriver 5 minutes avant l'heure prévue. En cas d'empêchement, veuillez prévenir le cabinet dès que possible.</p>
              </div>
            </div>

            <footer class="apt-modal-footer">
              <button type="button" class="portal-btn portal-btn--secondary" (click)="selectedAppointment.set(null)">
                <span>Fermer</span>
              </button>
            </footer>
          </div>
        </div>
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
      .segmented-control {
        display: inline-flex;
        background: #e8efeb;
        border-radius: 99px;
        padding: 4px;
        gap: 4px;
        margin-top: 8px;
      }
      .segment-btn {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 8px 18px;
        border-radius: 99px;
        border: 0;
        background: transparent;
        color: #56635f;
        font-size: 14px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.18s ease;
      }
      .segment-btn.active {
        background: #fffefb;
        color: #0d2925;
        font-weight: 700;
        box-shadow: 0 2px 8px rgba(13, 41, 37, 0.08);
      }
      .count-badge {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 2px 7px;
        border-radius: 99px;
        background: rgba(13, 41, 37, 0.08);
        font-size: 11px;
        font-weight: 700;
      }
      .segment-btn.active .count-badge {
        background: #173f38;
        color: #fffefb;
      }

      /* Appointments List */
      .appointments-list {
        display: flex;
        flex-direction: column;
        gap: 16px;
      }
      .apt-card {
        display: grid;
        grid-template-columns: auto 1fr auto;
        gap: 20px;
        align-items: center;
        padding: 22px 24px;
        background: #fffefb;
        border: 1px solid #dce2de;
        border-radius: 18px;
        box-shadow: 0 6px 20px rgba(13, 41, 37, 0.03);
        transition: transform 0.15s ease, box-shadow 0.15s ease;
      }
      .apt-card:hover {
        transform: translateY(-1px);
        box-shadow: 0 10px 28px rgba(13, 41, 37, 0.06);
      }
      .apt-card--past {
        opacity: 0.88;
        background: #fbfbf9;
      }

      .apt-date-box {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        width: 76px;
        height: 82px;
        border-radius: 16px;
        background: #e8efeb;
        color: #173f38;
        border: 1px solid rgba(23, 63, 56, 0.15);
      }
      .apt-date-box--past {
        background: #f6f3ec;
        color: #56635f;
        border-color: #dce2de;
      }
      .apt-month {
        font-size: 11px;
        font-weight: 800;
        text-transform: uppercase;
        letter-spacing: 0.08em;
      }
      .apt-day {
        font-size: 26px;
        font-weight: 800;
        line-height: 1.1;
        letter-spacing: -0.04em;
      }
      .apt-weekday,
      .apt-year {
        font-size: 10px;
        font-weight: 600;
        text-transform: capitalize;
        opacity: 0.8;
      }

      .apt-info {
        display: flex;
        flex-direction: column;
        gap: 6px;
        min-width: 0;
      }
      .apt-top-row {
        display: flex;
        align-items: center;
        gap: 10px;
      }
      .child-chip {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 3px 10px;
        border-radius: 99px;
        background: #f6f3ec;
        font-size: 12px;
        font-weight: 600;
        color: #56635f;
      }
      .child-chip .material-icons {
        font-size: 14px;
      }
      .apt-type {
        margin: 0;
        font-size: 17px;
        font-weight: 700;
        color: #0d2925;
      }
      .apt-meta-details {
        display: flex;
        align-items: center;
        gap: 16px;
        flex-wrap: wrap;
      }
      .meta-item {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        font-size: 13px;
        color: #56635f;
      }
      .meta-item .material-icons {
        font-size: 16px;
        color: #173f38;
      }
      .meta-item--treatment {
        color: #8c5b16;
      }
      .meta-item--treatment .material-icons {
        color: #8c5b16;
      }

      /* Status Pill */
      .status-pill {
        display: inline-flex;
        align-items: center;
        padding: 4px 10px;
        border-radius: 99px;
        font-size: 11px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.04em;
      }
      .status-pill--confirmed {
        background: #edf7ed;
        color: #1e4620;
      }
      .status-pill--scheduled {
        background: #e8efeb;
        color: #173f38;
      }
      .status-pill--progress {
        background: #fbf5ea;
        color: #8c5b16;
      }
      .status-pill--completed {
        background: #edf7ed;
        color: #1e4620;
      }
      .status-pill--missed,
      .status-pill--cancelled {
        background: #fff7f5;
        color: #a33d3d;
      }

      /* Empty & Skeleton States */
      .empty-icon {
        font-size: 48px;
        color: #173f38;
      }
      .skeleton-list {
        display: flex;
        flex-direction: column;
        gap: 14px;
      }
      .skeleton-item {
        height: 100px;
        border-radius: 18px;
      }

      /* Detail Modal */
      .apt-modal-backdrop {
        position: fixed;
        inset: 0;
        z-index: 1000;
        background: rgba(13, 41, 37, 0.7);
        backdrop-filter: blur(8px);
        display: grid;
        place-items: center;
        padding: 20px;
      }
      .apt-modal {
        background: #fffefb;
        width: min(100%, 540px);
        border-radius: 20px;
        box-shadow: 0 32px 80px rgba(13, 41, 37, 0.35);
        overflow: hidden;
        border: 1px solid #dce2de;
      }
      .apt-modal-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 20px 24px;
        background: #0d2925;
        color: #fffefb;
        border-bottom: 2px solid #c86445;
      }
      .apt-modal-title-group {
        display: flex;
        align-items: center;
        gap: 12px;
      }
      .apt-modal-icon {
        font-size: 26px;
        color: #df8b70;
      }
      .apt-modal-title {
        margin: 0;
        font-size: 17px;
        font-weight: 700;
      }
      .apt-modal-sub {
        margin: 2px 0 0;
        font-size: 12px;
        color: #dce2de;
      }
      .apt-modal-close {
        width: 36px;
        height: 36px;
        border-radius: 50%;
        border: 0;
        background: rgba(255, 255, 255, 0.12);
        color: #fffefb;
        display: grid;
        place-items: center;
        cursor: pointer;
      }
      .apt-modal-body {
        padding: 24px;
        display: flex;
        flex-direction: column;
        gap: 18px;
      }
      .modal-grid-2 {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 16px;
      }
      .modal-label {
        font-size: 11px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        color: #84918d;
        display: block;
        margin-bottom: 4px;
      }
      .modal-value {
        margin: 0;
        font-size: 15px;
        font-weight: 600;
        color: #17201e;
      }
      .modal-value--highlight {
        font-size: 18px;
        font-weight: 800;
        color: #0d2925;
      }
      .modal-clinic-box {
        padding: 16px;
        border-radius: 14px;
        background: #f6f3ec;
        border: 1px solid #dce2de;
      }
      .clinic-box-header {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 14px;
        color: #0d2925;
        margin-bottom: 6px;
      }
      .clinic-box-header .material-icons {
        font-size: 18px;
        color: #173f38;
      }
      .clinic-box-desc {
        margin: 0;
        font-size: 12px;
        color: #56635f;
        line-height: 1.45;
      }
      .apt-modal-footer {
        padding: 16px 24px;
        background: #fbfbf9;
        border-top: 1px solid #dce2de;
        display: flex;
        justify-content: flex-end;
      }

      @media (max-width: 640px) {
        .apt-card {
          grid-template-columns: 1fr;
          gap: 14px;
        }
        .apt-date-box {
          width: auto;
          height: auto;
          flex-direction: row;
          gap: 8px;
          padding: 8px 14px;
        }
        .apt-day {
          font-size: 18px;
        }
        .apt-card-actions {
          display: flex;
          justify-content: flex-end;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PortalAppointmentsPage implements OnInit {
  protected readonly auth = inject(PortalAuthStore);
  private readonly api = inject(PortalApiService);

  protected readonly appointments = signal<PortalAppointment[]>([]);
  protected readonly loading = signal(true);
  protected readonly tab = signal<'UPCOMING' | 'PAST'>('UPCOMING');
  protected readonly selectedAppointment = signal<PortalAppointment | null>(null);

  protected readonly upcomingAppointments = computed(() => {
    const now = new Date();
    return this.appointments()
      .filter((item) => new Date(item.startAt) >= now && item.status !== 'CANCELLED')
      .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());
  });

  protected readonly pastAppointments = computed(() => {
    const now = new Date();
    return this.appointments()
      .filter((item) => new Date(item.startAt) < now || item.status === 'CANCELLED' || item.status === 'COMPLETED')
      .sort((a, b) => new Date(b.startAt).getTime() - new Date(a.startAt).getTime());
  });

  ngOnInit() {
    void this.load();
  }

  protected async load() {
    this.loading.set(true);
    try {
      this.appointments.set(await firstValueFrom(this.api.appointments()));
    } finally {
      this.loading.set(false);
    }
  }

  protected friendlyStatus(status: string): string {
    switch (status) {
      case 'CONFIRMED':
        return 'Confirmé';
      case 'SCHEDULED':
        return 'Programmé';
      case 'VISIT_IN_PROGRESS':
        return 'En cours au cabinet';
      case 'COMPLETED':
        return 'Effectué';
      case 'MISSED':
        return 'Non honoré';
      case 'CANCELLED':
        return 'Annulé';
      default:
        return status;
    }
  }

  protected statusClass(status: string): string {
    switch (status) {
      case 'CONFIRMED':
        return 'confirmed';
      case 'SCHEDULED':
        return 'scheduled';
      case 'VISIT_IN_PROGRESS':
        return 'progress';
      case 'COMPLETED':
        return 'completed';
      case 'MISSED':
        return 'missed';
      case 'CANCELLED':
        return 'cancelled';
      default:
        return 'scheduled';
    }
  }
}
