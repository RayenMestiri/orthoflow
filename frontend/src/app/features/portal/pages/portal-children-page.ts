import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { PortalApiService } from '../data-access/portal-api.service';
import type { PortalChildSummary } from '../models/portal.models';
import { PortalDatePipe } from '../presentation/portal-date.pipe';
import { PortalAuthStore } from '../data-access/portal-auth.store';

@Component({
  selector: 'app-portal-children-page',
  standalone: true,
  imports: [CommonModule, RouterLink, PortalDatePipe],
  template: `
    <section class="portal-page">
      <header class="page-header">
        <p class="portal-kicker">
          <span class="material-icons kicker-icon" aria-hidden="true">family_restroom</span>
          Dossiers de soins
        </p>
        <h1 class="portal-title">Traitements & Patients</h1>
        <p class="portal-lede">
          Suivez les plans de traitement actifs, les phases de contention et les prochaines séances pour chaque membre de votre famille.
        </p>
      </header>

      @if (loading()) {
        <div class="portal-grid">
          <div class="portal-skeleton skeleton-card"></div>
          <div class="portal-skeleton skeleton-card"></div>
        </div>
      } @else if (!children().length) {
        <div class="portal-empty">
          <span class="material-icons empty-icon" aria-hidden="true">person_off</span>
          <h3>Aucun patient associé</h3>
          <p>Aucun dossier patient n'est actuellement rattaché à votre compte. Contactez votre cabinet si vous pensez qu'il s'agit d'une erreur.</p>
        </div>
      } @else {
        <div class="portal-grid">
          @for (child of children(); track child.id) {
            <article class="child-card">
              <div class="child-card-header">
                <div class="child-avatar">
                  {{ child.fullName.charAt(0) }}
                </div>
                <div class="child-meta">
                  <h2 class="child-name">{{ child.fullName }}</h2>
                  <p class="child-sub">
                    {{ child.age !== null ? child.age + ' ans' : 'Âge non renseigné' }}
                    · {{ friendlyRel(child.relationship) }}
                  </p>
                </div>
                <span class="portal-status portal-status--{{ statusClass(child.treatment?.status) }}">
                  {{ friendlyStatus(child.treatment?.status) }}
                </span>
              </div>

              <div class="child-card-body">
                <!-- Treatment Info -->
                <div class="info-row">
                  <span class="material-icons row-icon" aria-hidden="true">auto_graph</span>
                  <div class="row-content">
                    <span class="row-label">Traitement en cours</span>
                    <strong class="row-val">{{ child.treatment?.label || 'Dossier de suivi' }}</strong>
                  </div>
                </div>

                <!-- Next Appointment -->
                <div class="info-row">
                  <span class="material-icons row-icon" aria-hidden="true">calendar_today</span>
                  <div class="row-content">
                    <span class="row-label">Prochain rendez-vous</span>
                    <strong class="row-val">
                      {{
                        child.nextAppointment
                          ? (child.nextAppointment.startAt | portalDate: auth.profile()?.clinic?.timezone : 'appointment')
                          : 'Aucun rendez-vous planifié'
                      }}
                    </strong>
                  </div>
                </div>

                <!-- Retention if active -->
                @if (child.retention) {
                  <div class="info-row info-row--retention">
                    <span class="material-icons row-icon" aria-hidden="true">security</span>
                    <div class="row-content">
                      <span class="row-label">Phase de contention</span>
                      <strong class="row-val">Appareil actif · Stabilisation</strong>
                    </div>
                  </div>
                }
              </div>

              <div class="child-card-footer">
                <a [routerLink]="['/portal/children', child.id]" class="portal-btn">
                  <span>Accéder à la fiche de soins</span>
                  <span class="material-icons" aria-hidden="true">arrow_forward</span>
                </a>
              </div>
            </article>
          }
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
      .child-card {
        display: flex;
        flex-direction: column;
        padding: 26px;
        border-radius: 20px;
        background: #fffefb;
        border: 1px solid #dce2de;
        box-shadow: 0 8px 24px rgba(13, 41, 37, 0.04);
        transition: transform 0.2s ease, box-shadow 0.2s ease;
      }
      .child-card:hover {
        transform: translateY(-2px);
        box-shadow: 0 12px 32px rgba(13, 41, 37, 0.08);
      }
      .child-card-header {
        display: flex;
        align-items: center;
        gap: 14px;
        margin-bottom: 20px;
      }
      .child-avatar {
        width: 48px;
        height: 48px;
        border-radius: 14px;
        background: #173f38;
        color: #fffefb;
        display: grid;
        place-items: center;
        font-size: 20px;
        font-weight: 800;
        flex-shrink: 0;
      }
      .child-meta {
        flex: 1;
        min-width: 0;
      }
      .child-name {
        margin: 0;
        font-size: 18px;
        font-weight: 700;
        color: #0d2925;
      }
      .child-sub {
        margin: 2px 0 0;
        font-size: 13px;
        color: #56635f;
      }

      .child-card-body {
        display: flex;
        flex-direction: column;
        gap: 14px;
        padding: 16px 0;
        border-top: 1px solid #e8efeb;
        border-bottom: 1px solid #e8efeb;
        margin-bottom: 20px;
      }
      .info-row {
        display: flex;
        align-items: flex-start;
        gap: 12px;
      }
      .row-icon {
        font-size: 18px;
        color: #173f38;
        margin-top: 2px;
      }
      .row-content {
        display: flex;
        flex-direction: column;
        gap: 2px;
      }
      .row-label {
        font-size: 11px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        color: #84918d;
      }
      .row-val {
        font-size: 14px;
        font-weight: 600;
        color: #17201e;
      }
      .info-row--retention .row-icon {
        color: #c86445;
      }

      .child-card-footer {
        margin-top: auto;
      }
      .child-card-footer .portal-btn {
        width: 100%;
      }

      .empty-icon {
        font-size: 48px;
        color: #84918d;
      }
      .skeleton-card {
        height: 260px;
        border-radius: 20px;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PortalChildrenPage implements OnInit {
  protected readonly auth = inject(PortalAuthStore);
  private readonly api = inject(PortalApiService);

  protected readonly children = signal<PortalChildSummary[]>([]);
  protected readonly loading = signal(true);

  ngOnInit() {
    void this.load();
  }

  protected async load() {
    this.loading.set(true);
    try {
      this.children.set(await firstValueFrom(this.api.children()));
    } finally {
      this.loading.set(false);
    }
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
}
