import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { PortalAuthStore } from '../data-access/portal-auth.store';
import { PortalApiService } from '../data-access/portal-api.service';
import type { PortalChildSummary } from '../models/portal.models';

@Component({
  selector: 'app-portal-profile-page',
  standalone: true,
  imports: [CommonModule],
  template: `
    <section class="portal-page">
      <header class="page-header">
        <p class="portal-kicker">
          <span class="material-icons kicker-icon" aria-hidden="true">account_circle</span>
          Paramètres du compte
        </p>
        <h1 class="portal-title">Mon Profil</h1>
        <p class="portal-lede">
          Gérez les informations relatives à votre compte patient et vos accès sécurisés à l'espace famille.
        </p>
      </header>

      <div class="profile-stack">
        <!-- 1. Executive Profile Hero Card -->
        <article class="profile-hero-card">
          <div class="profile-avatar">
            {{ auth.profile()?.fullName?.charAt(0) || 'P' }}
          </div>
          <div class="profile-main-info">
            <span class="portal-status portal-status--active">Compte Vérifié</span>
            <h2 class="profile-name">{{ auth.profile()?.fullName }}</h2>
            <p class="profile-email">
              <span class="material-icons" aria-hidden="true">mail</span>
              <span>{{ auth.profile()?.email }}</span>
            </p>
          </div>
        </article>

        <!-- 2. Linked Clinic Card -->
        @if (auth.profile()?.clinic; as clinic) {
          <article class="info-card">
            <div class="card-header">
              <span class="material-icons card-icon" aria-hidden="true">local_hospital</span>
              <div>
                <h3 class="card-title">Cabinet dentaire référent</h3>
                <p class="card-subtitle">Établissement responsable de vos soins</p>
              </div>
            </div>

            <div class="info-rows">
              <div class="info-row">
                <span class="lbl">Nom du cabinet</span>
                <strong class="val">{{ clinic.name }}</strong>
              </div>
              <div class="info-row">
                <span class="lbl">Fuseau horaire</span>
                <span class="val">{{ clinic.timezone }}</span>
              </div>
              <div class="info-row">
                <span class="lbl">Devise de facturation</span>
                <span class="val">{{ clinic.currency }}</span>
              </div>
            </div>
          </article>
        }

        <!-- 3. Linked Patients & Children Card -->
        <article class="info-card">
          <div class="card-header">
            <span class="material-icons card-icon" aria-hidden="true">family_restroom</span>
            <div>
              <h3 class="card-title">Patients & Enfants rattachés</h3>
              <p class="card-subtitle">Dossiers médicaux associés à ce compte tuteur</p>
            </div>
          </div>

          <div class="children-list">
            @for (child of children(); track child.id) {
              <div class="child-row">
                <div class="c-avatar">{{ child.fullName.charAt(0) }}</div>
                <div class="c-info">
                  <strong class="c-name">{{ child.fullName }}</strong>
                  <span class="c-rel">{{ friendlyRel(child.relationship) }}{{ child.age !== null ? ' · ' + child.age + ' ans' : '' }}</span>
                </div>
                <span class="portal-status">{{ child.canViewFinance ? 'Responsable financier' : 'Représentant' }}</span>
              </div>
            } @empty {
              <p class="portal-muted">Chargement des patients rattachés…</p>
            }
          </div>
        </article>

        <!-- 4. Privacy & Medical Confidentiality -->
        <article class="info-card info-card--privacy">
          <div class="card-header">
            <span class="material-icons card-icon card-icon--shield" aria-hidden="true">security</span>
            <div>
              <h3 class="card-title">Confidentialité & Données médicales</h3>
              <p class="card-subtitle">Protection stricte du secret médical et conformité</p>
            </div>
          </div>

          <p class="privacy-text">
            Vos données de santé et documents sont strictement protégés et hébergés conformément aux normes de sécurité des données de santé. Les données affichées dans cet espace sont certifiées et projetées directement depuis le serveur sécurisé de votre cabinet.
          </p>

          <div class="security-badges">
            <span class="sec-badge">
              <span class="material-icons" aria-hidden="true">lock</span>
              <span>Chiffrement SSL 256-bit</span>
            </span>
            <span class="sec-badge">
              <span class="material-icons" aria-hidden="true">verified_user</span>
              <span>Accès exclusif tuteur</span>
            </span>
          </div>
        </article>

        <!-- 5. Logout CTA Card -->
        <div class="logout-section">
          <button type="button" class="portal-btn portal-btn--outline logout-full-btn" (click)="logout()">
            <span class="material-icons" aria-hidden="true">logout</span>
            <span>Déconnexion de l'espace patient</span>
          </button>
        </div>
      </div>
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
      .profile-stack {
        display: flex;
        flex-direction: column;
        gap: 20px;
      }

      /* Profile Hero Card */
      .profile-hero-card {
        display: flex;
        align-items: center;
        gap: 20px;
        padding: 28px;
        border-radius: 20px;
        background: #fffefb;
        border: 1px solid #dce2de;
        box-shadow: 0 8px 24px rgba(13, 41, 37, 0.04);
      }
      .profile-avatar {
        width: 64px;
        height: 64px;
        border-radius: 20px;
        background: #0d2925;
        color: #df8b70;
        display: grid;
        place-items: center;
        font-size: 28px;
        font-weight: 800;
        flex-shrink: 0;
      }
      .profile-main-info {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .profile-name {
        margin: 0;
        font-size: 22px;
        font-weight: 800;
        letter-spacing: -0.03em;
        color: #0d2925;
      }
      .profile-email {
        margin: 0;
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 14px;
        color: #56635f;
      }
      .profile-email .material-icons {
        font-size: 18px;
        color: #173f38;
      }

      /* Info Cards */
      .info-card {
        padding: 24px;
        background: #fffefb;
        border: 1px solid #dce2de;
        border-radius: 18px;
        box-shadow: 0 4px 16px rgba(13, 41, 37, 0.02);
      }
      .card-header {
        display: flex;
        align-items: center;
        gap: 14px;
        margin-bottom: 20px;
      }
      .card-icon {
        width: 42px;
        height: 42px;
        border-radius: 12px;
        background: #e8efeb;
        color: #173f38;
        display: grid;
        place-items: center;
        font-size: 22px;
        flex-shrink: 0;
      }
      .card-icon--shield {
        background: #edf7ed;
        color: #1e4620;
      }
      .card-title {
        margin: 0;
        font-size: 16px;
        font-weight: 700;
        color: #0d2925;
      }
      .card-subtitle {
        margin: 2px 0 0;
        font-size: 12px;
        color: #56635f;
      }

      .info-rows {
        display: flex;
        flex-direction: column;
        gap: 12px;
      }
      .info-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding-bottom: 12px;
        border-bottom: 1px solid #e8efeb;
      }
      .info-row:last-child {
        border-bottom: 0;
        padding-bottom: 0;
      }
      .lbl {
        font-size: 13px;
        color: #84918d;
      }
      .val {
        font-size: 14px;
        color: #17201e;
      }

      /* Children List */
      .children-list {
        display: flex;
        flex-direction: column;
        gap: 12px;
      }
      .child-row {
        display: flex;
        align-items: center;
        gap: 14px;
        padding: 12px 16px;
        background: #fbfbf9;
        border-radius: 14px;
        border: 1px solid #e8efeb;
      }
      .c-avatar {
        width: 36px;
        height: 36px;
        border-radius: 10px;
        background: #173f38;
        color: #fffefb;
        display: grid;
        place-items: center;
        font-size: 15px;
        font-weight: 700;
        flex-shrink: 0;
      }
      .c-info {
        flex: 1;
        display: flex;
        flex-direction: column;
      }
      .c-name {
        font-size: 14px;
        color: #0d2925;
      }
      .c-rel {
        font-size: 12px;
        color: #56635f;
      }

      /* Privacy */
      .privacy-text {
        font-size: 14px;
        color: #56635f;
        line-height: 1.6;
        margin: 0 0 16px;
      }
      .security-badges {
        display: flex;
        align-items: center;
        gap: 12px;
        flex-wrap: wrap;
      }
      .sec-badge {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 6px 12px;
        border-radius: 99px;
        background: #edf7ed;
        color: #1e4620;
        font-size: 12px;
        font-weight: 600;
      }
      .sec-badge .material-icons {
        font-size: 16px;
      }

      .logout-section {
        margin-top: 10px;
      }
      .logout-full-btn {
        width: 100%;
        color: #a33d3d;
        border-color: #f0d5d0;
      }
      .logout-full-btn:hover {
        background: #fff7f5;
        border-color: #a33d3d;
      }

      @media (max-width: 600px) {
        .profile-hero-card {
          flex-direction: column;
          align-items: flex-start;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PortalProfilePage implements OnInit {
  protected readonly auth = inject(PortalAuthStore);
  private readonly api = inject(PortalApiService);
  private readonly router = inject(Router);

  protected readonly children = signal<PortalChildSummary[]>([]);

  ngOnInit() {
    void firstValueFrom(this.api.children()).then((c) => this.children.set(c));
  }

  protected async logout() {
    await this.auth.logout();
    await this.router.navigate(['/portal/login']);
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
}
