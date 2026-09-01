import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { PortalAuthStore } from '../data-access/portal-auth.store';

@Component({
  selector: 'app-portal-activate-page',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  template: `
    <main class="activate-layout">
      <div class="activate-container">
        <!-- Brand Header -->
        <header class="activate-brand">
          <div class="brand-mark">
            <svg class="brand-svg" viewBox="0 0 36 36" aria-hidden="true">
              <path
                class="brand-svg__shape"
                d="M8.8 8.7c3.4-3.5 15-3.5 18.4 0 3 3.1 1.4 8.1-.8 11.7-1.8 3-2 8.8-5 8.8-2.1 0-1.4-5.8-3.4-5.8s-1.3 5.8-3.4 5.8c-3 0-3.2-5.8-5-8.8-2.2-3.6-3.8-8.6-.8-11.7Z"
              />
              <path class="brand-svg__line" d="M11.5 15.5h13" />
            </svg>
          </div>
          <div class="brand-text">
            <span class="brand-title">Ortho<span class="brand-highlight">Flow</span></span>
            <span class="brand-subtitle">Espace Patient &amp; Famille</span>
          </div>
        </header>

        <!-- Activation Card -->
        <article class="activate-card">
          <header class="card-header">
            <span class="portal-kicker">
              <span class="material-icons kicker-icon" aria-hidden="true">lock</span>
              Activation de compte
            </span>
            <h1 class="card-title">Créez votre mot de passe</h1>
            <p class="card-desc">
              Bienvenue sur votre espace patient. Choisissez un mot de passe sécurisé pour activer l'accès à vos dossiers de soins et documents médicaux.
            </p>
          </header>

          @if (error()) {
            <div class="alert-box" role="alert">
              <span class="material-icons alert-icon" aria-hidden="true">error_outline</span>
              <div class="alert-content">
                <strong>Invitation non valide ou expirée</strong>
                <p>{{ error() }}</p>
              </div>
            </div>
          }

          <form [formGroup]="form" (ngSubmit)="submit()" class="activate-form" novalidate>
            <div class="form-group">
              <label for="pwd" class="form-label">Nouveau mot de passe</label>
              <div class="input-wrap">
                <span class="material-icons input-icon" aria-hidden="true">key</span>
                <input
                  id="pwd"
                  [type]="showPassword() ? 'text' : 'password'"
                  formControlName="password"
                  autocomplete="new-password"
                  placeholder="10 caractères minimum"
                  class="form-input"
                />
                <button
                  type="button"
                  class="pwd-toggle-btn"
                  (click)="showPassword.set(!showPassword())"
                  [attr.aria-label]="showPassword() ? 'Masquer' : 'Afficher'"
                >
                  <span class="material-icons">{{ showPassword() ? 'visibility_off' : 'visibility' }}</span>
                </button>
              </div>
              <span class="form-hint">Le mot de passe doit comporter au moins 10 caractères.</span>
            </div>

            <div class="form-group">
              <label for="cpwd" class="form-label">Confirmer le mot de passe</label>
              <div class="input-wrap">
                <span class="material-icons input-icon" aria-hidden="true">check_circle_outline</span>
                <input
                  id="cpwd"
                  [type]="showPassword() ? 'text' : 'password'"
                  formControlName="confirm"
                  autocomplete="new-password"
                  placeholder="Répétez le mot de passe"
                  class="form-input"
                />
              </div>
            </div>

            <button
              type="submit"
              class="submit-btn"
              [disabled]="form.invalid || loading()"
            >
              @if (loading()) {
                <span class="material-icons spin-icon" aria-hidden="true">sync</span>
                <span>Activation en cours…</span>
              } @else {
                <span class="material-icons" aria-hidden="true">verified_user</span>
                <span>Activer mon espace sécurisé</span>
              }
            </button>
          </form>

          <footer class="card-footer">
            <p class="security-note">
              <span class="material-icons" aria-hidden="true">security</span>
              <span>Vos données sont strictement protégées et chiffrées selon les normes de santé.</span>
            </p>
            <div class="footer-links">
              <a routerLink="/portal/login" class="back-link">Déjà un compte ? Se connecter</a>
            </div>
          </footer>
        </article>
      </div>
    </main>
  `,
  styles: [
    `
      :host {
        display: block;
        min-height: 100vh;
        background: #0d2925;
        color: #fffefb;
      }
      .activate-layout {
        min-height: 100vh;
        display: grid;
        place-items: center;
        padding: clamp(20px, 4vw, 40px) 16px;
      }
      .activate-container {
        width: min(100%, 480px);
        display: flex;
        flex-direction: column;
        gap: 24px;
      }

      /* Brand */
      .activate-brand {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 14px;
      }
      .brand-mark {
        width: 44px;
        height: 44px;
        border-radius: 14px;
        background: radial-gradient(circle at 30% 30%, rgba(223, 139, 112, 0.25), rgba(13, 41, 37, 0.95));
        border: 1px solid rgba(223, 139, 112, 0.35);
        box-shadow: 0 4px 14px rgba(0, 0, 0, 0.3), inset 0 1px 1px rgba(255, 255, 255, 0.3);
        display: grid;
        place-items: center;
      }
      .brand-svg {
        width: 28px;
        height: 28px;
      }
      .brand-svg__shape {
        fill: #df8b70;
        stroke: rgba(255, 254, 251, 0.9);
        stroke-width: 0.6px;
      }
      .brand-svg__line {
        fill: none;
        stroke: #fffefb;
        stroke-width: 2.4px;
        stroke-linecap: round;
      }
      .brand-text {
        display: flex;
        flex-direction: column;
      }
      .brand-title {
        font-size: 20px;
        font-weight: 800;
        letter-spacing: -0.035em;
        color: #fffefb;
        line-height: 1.1;
      }
      .brand-highlight {
        background: linear-gradient(135deg, #df8b70 0%, #f4b69d 100%);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
      }
      .brand-subtitle {
        font-size: 11px;
        font-weight: 500;
        color: #b5c4bf;
        letter-spacing: 0.04em;
        margin-top: 2px;
      }

      /* Card */
      .activate-card {
        padding: clamp(24px, 5vw, 40px);
        border-radius: 24px;
        background: #fffefb;
        color: #17201e;
        border: 1px solid #dce2de;
        box-shadow: 0 24px 60px rgba(0, 0, 0, 0.3);
      }
      .portal-kicker {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        font-size: 12px;
        font-weight: 700;
        color: #c86445;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        margin-bottom: 8px;
      }
      .kicker-icon {
        font-size: 15px;
      }
      .card-title {
        margin: 0 0 8px;
        font-size: 24px;
        font-weight: 800;
        letter-spacing: -0.03em;
        color: #0d2925;
      }
      .card-desc {
        margin: 0 0 24px;
        font-size: 14px;
        color: #56635f;
        line-height: 1.5;
      }

      /* Alert */
      .alert-box {
        display: flex;
        gap: 12px;
        padding: 14px 16px;
        border-radius: 14px;
        background: #fff7f5;
        border: 1px solid #f0d5d0;
        color: #a33d3d;
        margin-bottom: 20px;
        font-size: 13px;
        line-height: 1.4;
      }
      .alert-icon {
        font-size: 20px;
        color: #c86445;
        flex-shrink: 0;
      }
      .alert-content strong {
        display: block;
        margin-bottom: 2px;
        color: #0d2925;
      }
      .alert-content p {
        margin: 0;
      }

      /* Form */
      .activate-form {
        display: flex;
        flex-direction: column;
        gap: 18px;
      }
      .form-group {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .form-label {
        font-size: 13px;
        font-weight: 700;
        color: #173f38;
      }
      .input-wrap {
        position: relative;
        display: flex;
        align-items: center;
      }
      .input-icon {
        position: absolute;
        left: 14px;
        font-size: 20px;
        color: #84918d;
        pointer-events: none;
      }
      .form-input {
        width: 100%;
        height: 48px;
        padding: 0 44px 0 44px;
        border-radius: 12px;
        border: 1px solid #bfc9c4;
        background: #fbfbf9;
        color: #0d2925;
        font-size: 14px;
        transition: all 0.2s ease;
      }
      .form-input:focus {
        outline: none;
        border-color: #173f38;
        background: #fffefb;
        box-shadow: 0 0 0 3px rgba(23, 63, 56, 0.12);
      }
      .pwd-toggle-btn {
        position: absolute;
        right: 12px;
        background: none;
        border: 0;
        color: #84918d;
        cursor: pointer;
        display: grid;
        place-items: center;
        padding: 4px;
      }
      .pwd-toggle-btn:hover {
        color: #173f38;
      }
      .pwd-toggle-btn .material-icons {
        font-size: 20px;
      }
      .form-hint {
        font-size: 12px;
        color: #84918d;
      }

      /* Submit Button */
      .submit-btn {
        width: 100%;
        height: 50px;
        border: 0;
        border-radius: 14px;
        background: #173f38;
        color: #fffefb;
        font-size: 15px;
        font-weight: 700;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        cursor: pointer;
        transition: all 0.2s ease;
        margin-top: 6px;
      }
      .submit-btn:hover:not(:disabled) {
        background: #0d2925;
        transform: translateY(-1px);
        box-shadow: 0 6px 18px rgba(13, 41, 37, 0.25);
      }
      .submit-btn:disabled {
        opacity: 0.6;
        cursor: not-allowed;
      }

      /* Footer */
      .card-footer {
        margin-top: 24px;
        padding-top: 20px;
        border-top: 1px solid #e8efeb;
        display: flex;
        flex-direction: column;
        gap: 14px;
      }
      .security-note {
        margin: 0;
        font-size: 12px;
        color: #84918d;
        display: flex;
        align-items: center;
        gap: 8px;
        line-height: 1.4;
      }
      .security-note .material-icons {
        font-size: 16px;
        color: #52b788;
        flex-shrink: 0;
      }
      .footer-links {
        text-align: center;
      }
      .back-link {
        font-size: 13px;
        font-weight: 600;
        color: #173f38;
        text-decoration: none;
      }
      .back-link:hover {
        text-decoration: underline;
      }

      .spin-icon {
        animation: spin 1s linear infinite;
      }
      @keyframes spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PortalActivatePage {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(PortalAuthStore);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  private readonly token = this.route.snapshot.queryParamMap.get('token')?.trim() ?? '';
  protected readonly loading = signal(false);
  protected readonly error = signal('');
  protected readonly showPassword = signal(false);

  protected readonly form = this.fb.nonNullable.group({
    password: ['', [Validators.required, Validators.minLength(10)]],
    confirm: ['', Validators.required],
  });

  protected async submit() {
    const value = this.form.getRawValue();
    if (!this.token) {
      this.error.set(
        "Lien d'invitation manquant ou incomplet. Veuillez cliquer directement sur le lien reçu dans votre email.",
      );
      return;
    }
    if (value.password !== value.confirm) {
      this.error.set('Les deux mots de passe saisis ne correspondent pas.');
      return;
    }

    this.loading.set(true);
    this.error.set('');
    try {
      await this.auth.activate(this.token, value.password);
      await this.router.navigate(['/portal/home']);
    } catch {
      this.error.set(
        "Cette invitation est invalide, expirée ou a déjà été utilisée. Veuillez demander au cabinet de vous renvoyer une nouvelle invitation.",
      );
    } finally {
      this.loading.set(false);
    }
  }
}
