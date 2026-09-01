import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { getApiProblem } from '../../../core/http/api-error';
import { PortalApiService } from '../data-access/portal-api.service';

@Component({
  selector: 'app-portal-forgot-password-page',
  imports: [ReactiveFormsModule, RouterLink],
  template: `
    <main class="portal-auth-layout">
      <!-- Ambient Lighting Orbs -->
      <div class="ambient-glow ambient-glow--1" aria-hidden="true"></div>
      <div class="ambient-glow ambient-glow--2" aria-hidden="true"></div>

      <div class="portal-container">
        <section class="portal-card-shell">
          <!-- Top Switcher -->
          <div class="portal-switcher" role="tablist" aria-label="Espaces de connexion">
            <a routerLink="/portal/login" class="portal-switcher__tab portal-switcher__tab--active" role="tab">
              <span class="material-icons">family_restroom</span>
              <span>Portail Famille</span>
            </a>
            <a
              routerLink="/forgot-password"
              [queryParams]="form.controls.email.value ? { email: form.controls.email.value } : null"
              class="portal-switcher__tab"
              role="tab"
            >
              <span class="material-icons">local_hospital</span>
              <span>Espace Cabinet</span>
            </a>
          </div>

          <div class="portal-card">
            <!-- Header -->
            <div class="portal-card__header">
              <div class="portal-card__icon-badge">
                <span class="material-icons">lock_reset</span>
              </div>
              <h2>Mot de passe oublié</h2>
              <p>
                Renseignez l'adresse email associée à votre dossier famille pour recevoir un lien d'accès sécurisé.
              </p>
            </div>

            <!-- Error Banner & Smart Bridge -->
            @if (error()) {
              <div class="portal-alert portal-alert--error" role="alert">
                <span class="material-icons">info</span>
                <div class="portal-alert__content">
                  <span>{{ error() }}</span>
                  @if (isStaffAccount()) {
                    <a
                      routerLink="/forgot-password"
                      [queryParams]="{ email: form.controls.email.value }"
                      class="smart-bridge-btn"
                    >
                      <span class="material-icons">arrow_forward</span>
                      Réinitialiser via l'Espace Cabinet
                    </a>
                  }
                </div>
              </div>
            }

            <!-- Success State -->
            @if (submitted()) {
              <div class="portal-alert portal-alert--success" role="status">
                <span class="material-icons">mark_email_read</span>
                <div class="portal-alert__content">
                  <strong>Demande traitée avec succès</strong>
                  <p>{{ successMessage() }}</p>
                </div>
              </div>

              <div class="portal-instruction-box">
                <span class="material-icons">tips_and_updates</span>
                <p>
                  Pensez à vérifier vos courriers indésirables (spams) si l'e-mail n'apparaît pas dans votre boîte de réception d'ici quelques instants.
                </p>
              </div>

              <div class="portal-card__actions">
                <a routerLink="/portal/login" class="submit-button submit-button--secondary">
                  <span class="material-icons">arrow_back</span>
                  <span>Retour à la connexion</span>
                </a>
              </div>
            } @else {
              <!-- Form -->
              <form [formGroup]="form" (ngSubmit)="submit()" class="portal-form" novalidate>
                <div class="form-group">
                  <label for="forgot-email">Adresse email</label>
                  <div class="input-wrapper" [class.input-wrapper--invalid]="form.controls.email.touched && form.controls.email.invalid">
                    <span class="material-icons input-icon">email</span>
                    <input
                      id="forgot-email"
                      type="email"
                      formControlName="email"
                      autocomplete="email"
                      placeholder="parent@exemple.com"
                      aria-describedby="email-error"
                    />
                  </div>
                  @if (form.controls.email.touched && form.controls.email.invalid) {
                    <small id="email-error" class="form-error">Veuillez saisir une adresse email valide.</small>
                  }
                </div>

                <button
                  type="submit"
                  class="submit-button"
                  [disabled]="form.invalid || loading()"
                >
                  @if (loading()) {
                    <span class="spinner"></span>
                    <span>Envoi en cours…</span>
                  } @else {
                    <span>Recevoir mon lien sécurisé</span>
                    <span class="material-icons">send</span>
                  }
                </button>
              </form>

              <div class="portal-card__footer">
                <p>
                  Vous vous souvenez de votre mot de passe ?
                  <a routerLink="/portal/login" [queryParams]="form.controls.email.value ? { email: form.controls.email.value } : null">
                    Se connecter
                  </a>
                </p>
              </div>
            }
          </div>
        </section>
      </div>
    </main>
  `,
  styles: [
    `
      :host {
        display: block;
        min-height: 100vh;
        background: #fbf9f5;
        color: #17201e;
        font-family: inherit;
      }

      .portal-auth-layout {
        position: relative;
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: clamp(24px, 4vw, 48px) 16px;
        overflow: hidden;
      }

      .ambient-glow {
        position: absolute;
        border-radius: 50%;
        filter: blur(100px);
        pointer-events: none;
        opacity: 0.5;
      }

      .ambient-glow--1 {
        top: -10%;
        left: 20%;
        width: 480px;
        height: 480px;
        background: radial-gradient(circle, rgba(16, 185, 129, 0.18), transparent 70%);
      }

      .ambient-glow--2 {
        bottom: -15%;
        right: 15%;
        width: 520px;
        height: 520px;
        background: radial-gradient(circle, rgba(217, 119, 6, 0.12), transparent 70%);
      }

      .portal-container {
        position: relative;
        z-index: 10;
        width: min(100%, 480px);
        margin: 0 auto;
      }

      .portal-card-shell {
        display: flex;
        flex-direction: column;
        gap: 16px;
      }

      .portal-switcher {
        display: flex;
        background: #ece8df;
        padding: 5px;
        border-radius: 16px;
        gap: 6px;
      }

      .portal-switcher__tab {
        flex: 1;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        padding: 10px 16px;
        border-radius: 12px;
        font-size: 0.88rem;
        font-weight: 700;
        text-decoration: none;
        color: #556761;
        background: transparent;
        transition: all 0.2s ease;
      }

      .portal-switcher__tab .material-icons {
        font-size: 18px;
      }

      .portal-switcher__tab--active {
        background: #ffffff;
        color: #0c332b;
        box-shadow: 0 2px 10px rgba(12, 51, 43, 0.08);
      }

      .portal-card {
        background: #ffffff;
        border: 1px solid #dce6e1;
        border-radius: 24px;
        padding: clamp(28px, 4vw, 40px);
        box-shadow: 0 20px 48px rgba(13, 45, 38, 0.08);
        display: flex;
        flex-direction: column;
        gap: 22px;
      }

      .portal-card__header {
        display: flex;
        flex-direction: column;
        align-items: center;
        text-align: center;
      }

      .portal-card__icon-badge {
        width: 56px;
        height: 56px;
        border-radius: 16px;
        background: #e6f4f0;
        color: #0f5e4f;
        display: flex;
        align-items: center;
        justify-content: center;
        margin-bottom: 14px;
      }

      .portal-card__icon-badge .material-icons {
        font-size: 28px;
      }

      .portal-card__header h2 {
        margin: 0 0 8px;
        font-size: 1.55rem;
        font-weight: 800;
        color: #0a2922;
        letter-spacing: -0.02em;
      }

      .portal-card__header p {
        margin: 0;
        font-size: 0.9rem;
        line-height: 1.55;
        color: #556761;
      }

      .portal-alert {
        display: flex;
        gap: 12px;
        padding: 14px 16px;
        border-radius: 14px;
        font-size: 0.88rem;
        line-height: 1.45;
        align-items: flex-start;
      }

      .portal-alert--success {
        background: #ecfdf5;
        border: 1px solid #a7f3d0;
        color: #065f46;
      }

      .portal-alert--error {
        background: #fef2f2;
        border: 1px solid #fecaca;
        color: #991b1b;
      }

      .portal-alert .material-icons {
        font-size: 20px;
        flex-shrink: 0;
      }

      .portal-alert__content {
        display: flex;
        flex-direction: column;
        gap: 8px;
        flex: 1;
      }

      .portal-alert__content p {
        margin: 0;
        font-size: 0.84rem;
        line-height: 1.5;
      }

      .smart-bridge-btn {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        align-self: flex-start;
        background: #991b1b;
        color: #ffffff;
        text-decoration: none;
        font-size: 0.82rem;
        font-weight: 700;
        padding: 6px 12px;
        border-radius: 8px;
        margin-top: 4px;
        transition: background 0.2s ease;
      }

      .smart-bridge-btn:hover {
        background: #7f1d1d;
      }

      .smart-bridge-btn .material-icons {
        font-size: 16px;
      }

      .portal-instruction-box {
        display: flex;
        gap: 10px;
        background: #fdfbf7;
        border: 1px dashed #dcd5c9;
        border-radius: 12px;
        padding: 12px 14px;
        font-size: 0.84rem;
        color: #635b4f;
        line-height: 1.45;
      }

      .portal-instruction-box .material-icons {
        font-size: 20px;
        color: #d97706;
        flex-shrink: 0;
      }

      .portal-instruction-box p {
        margin: 0;
      }

      .portal-form {
        display: flex;
        flex-direction: column;
        gap: 18px;
      }

      .form-group {
        display: flex;
        flex-direction: column;
        gap: 7px;
      }

      .form-group label {
        font-size: 0.86rem;
        font-weight: 700;
        color: #173d34;
      }

      .input-wrapper {
        display: flex;
        align-items: center;
        background: #fcfbf8;
        border: 1.5px solid #d4ddd8;
        border-radius: 12px;
        padding: 0 14px;
        transition: all 0.2s ease;
      }

      .input-wrapper:focus-within {
        border-color: #0f5e4f;
        background: #ffffff;
        box-shadow: 0 0 0 3px rgba(15, 94, 79, 0.12);
      }

      .input-wrapper--invalid {
        border-color: #dc2626;
      }

      .input-icon {
        color: #839790;
        font-size: 20px;
        margin-right: 10px;
      }

      .input-wrapper input {
        width: 100%;
        height: 48px;
        border: none;
        background: transparent;
        font: inherit;
        color: #0d2925;
        font-size: 0.95rem;
      }

      .input-wrapper input:focus {
        outline: none;
      }

      .form-error {
        color: #dc2626;
        font-size: 0.78rem;
      }

      .submit-button {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 10px;
        width: 100%;
        height: 50px;
        background: linear-gradient(135deg, #0c332b 0%, #175447 100%);
        color: #ffffff;
        border: none;
        border-radius: 12px;
        font-size: 0.98rem;
        font-weight: 700;
        cursor: pointer;
        margin-top: 6px;
        text-decoration: none;
        box-shadow: 0 6px 18px rgba(12, 51, 43, 0.22);
        transition: all 0.2s ease;
      }

      .submit-button:hover:not(:disabled) {
        background: linear-gradient(135deg, #11443a 0%, #1e6c5c 100%);
        box-shadow: 0 8px 24px rgba(12, 51, 43, 0.3);
        transform: translateY(-1px);
      }

      .submit-button--secondary {
        background: #f1ede5;
        color: #173d34;
        border: 1px solid #dcd5c9;
        box-shadow: none;
      }

      .submit-button--secondary:hover {
        background: #e7e1d5;
        color: #0c2b24;
      }

      .submit-button:disabled {
        opacity: 0.6;
        cursor: not-allowed;
      }

      .spinner {
        width: 20px;
        height: 20px;
        border: 2.5px solid rgba(255, 255, 255, 0.3);
        border-top-color: #ffffff;
        border-radius: 50%;
        animation: spin 0.8s linear infinite;
      }

      @keyframes spin {
        to {
          transform: rotate(360deg);
        }
      }

      .portal-card__footer {
        text-align: center;
        border-top: 1px solid #eef3f0;
        padding-top: 18px;
      }

      .portal-card__footer p {
        margin: 0;
        font-size: 0.88rem;
        color: #556761;
      }

      .portal-card__footer a {
        color: #0f5e4f;
        font-weight: 750;
        text-decoration: none;
        margin-left: 4px;
      }

      .portal-card__footer a:hover {
        text-decoration: underline;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PortalForgotPasswordPage implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly api = inject(PortalApiService);

  protected readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
  });

  protected readonly loading = signal(false);
  protected readonly submitted = signal(false);
  protected readonly isStaffAccount = signal(false);
  protected readonly successMessage = signal<string>('');
  protected readonly error = signal<string | null>(null);

  ngOnInit(): void {
    const emailParam = this.route.snapshot.queryParamMap.get('email');
    if (emailParam) {
      this.form.patchValue({ email: emailParam.trim() });
    }
  }

  protected submit(): void {
    if (this.form.invalid || this.loading()) return;
    this.loading.set(true);
    this.error.set(null);
    this.isStaffAccount.set(false);

    const email = this.form.getRawValue().email.trim();
    this.api.forgotPassword(email).subscribe({
      next: (res) => {
        this.loading.set(false);
        this.successMessage.set(res.message);
        this.submitted.set(true);
      },
      error: (err) => {
        this.loading.set(false);
        const problem = getApiProblem(err);
        if (problem?.code === 'STAFF_ACCOUNT_DETECTED') {
          this.isStaffAccount.set(true);
        }
        this.error.set(problem?.message ?? "Impossible d'envoyer l'e-mail de réinitialisation.");
      },
    });
  }
}
