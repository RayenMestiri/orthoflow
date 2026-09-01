import {
  ChangeDetectionStrategy,
  Component,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  ValidatorFn,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { getApiProblem } from '../../../core/http/api-error';
import { PortalApiService } from '../data-access/portal-api.service';

function passwordsMatchValidator(): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const password = control.get('password')?.value;
    const confirm = control.get('confirmPassword')?.value;
    if (!password || !confirm) return null;
    return password === confirm ? null : { passwordMismatch: true };
  };
}

@Component({
  selector: 'app-portal-reset-password-page',
  imports: [ReactiveFormsModule, RouterLink],
  template: `
    <main class="portal-auth-layout">
      <!-- Ambient Lighting Orbs -->
      <div class="ambient-glow ambient-glow--1" aria-hidden="true"></div>
      <div class="ambient-glow ambient-glow--2" aria-hidden="true"></div>

      <div class="portal-container">
        <section class="portal-card-shell">
          <div class="portal-card">
            <!-- Header -->
            <div class="portal-card__header">
              <div class="portal-card__icon-badge">
                <span class="material-icons">vpn_key</span>
              </div>
              <h2>Nouveau mot de passe</h2>
              <p>
                Définissez un nouveau mot de passe robuste pour accéder à votre espace famille.
              </p>
            </div>

            <!-- Missing / Invalid Token Notice -->
            @if (!token()) {
              <div class="portal-alert portal-alert--error" role="alert">
                <span class="material-icons">error_outline</span>
                <div class="portal-alert__content">
                  <strong>Lien manquant ou invalide</strong>
                  <p>
                    Le lien de réinitialisation est incomplet. Veuillez vérifier le lien reçu dans votre boîte e-mail ou faire une nouvelle demande.
                  </p>
                </div>
              </div>

              <div class="portal-card__actions">
                <a routerLink="/portal/forgot-password" class="submit-button">
                  <span class="material-icons">refresh</span>
                  <span>Demander un nouveau lien</span>
                </a>
              </div>
            } @else if (success()) {
              <!-- Success State -->
              <div class="portal-alert portal-alert--success" role="status">
                <span class="material-icons">check_circle</span>
                <div class="portal-alert__content">
                  <strong>Mot de passe mis à jour !</strong>
                  <p>
                    Votre nouveau mot de passe a été enregistré avec succès. Vous pouvez dès maintenant vous connecter à votre espace famille.
                  </p>
                </div>
              </div>

              <div class="portal-card__actions">
                <a
                  routerLink="/portal/login"
                  [queryParams]="resetEmail() ? { email: resetEmail(), copied: 'true' } : null"
                  class="submit-button"
                >
                  <span>Accéder à la connexion</span>
                  <span class="material-icons">arrow_forward</span>
                </a>
              </div>
            } @else {
              <!-- Error Banner -->
              @if (error()) {
                <div class="portal-alert portal-alert--error" role="alert">
                  <span class="material-icons">info</span>
                  <span>{{ error() }}</span>
                </div>
              }

              <!-- Reset Form -->
              <form [formGroup]="form" (ngSubmit)="submit()" class="portal-form" novalidate>
                <div class="form-group">
                  <label for="new-password">Nouveau mot de passe</label>
                  <div
                    class="input-wrapper"
                    [class.input-wrapper--invalid]="form.controls.password.touched && form.controls.password.invalid"
                  >
                    <span class="material-icons input-icon">lock</span>
                    <input
                      id="new-password"
                      [type]="passwordVisible() ? 'text' : 'password'"
                      formControlName="password"
                      autocomplete="new-password"
                      placeholder="••••••••••••"
                      aria-describedby="password-rules"
                    />
                    <button
                      type="button"
                      class="password-toggle"
                      (click)="passwordVisible.set(!passwordVisible())"
                      [attr.aria-label]="passwordVisible() ? 'Masquer le mot de passe' : 'Afficher le mot de passe'"
                    >
                      <span class="material-icons">{{ passwordVisible() ? 'visibility_off' : 'visibility' }}</span>
                    </button>
                  </div>
                  @if (form.controls.password.touched && form.controls.password.invalid) {
                    <small id="password-rules" class="form-error">
                      Le mot de passe doit comporter au moins 8 caractères, une majuscule, une minuscule et un chiffre.
                    </small>
                  }
                </div>

                <div class="form-group">
                  <label for="confirm-password">Confirmer le mot de passe</label>
                  <div
                    class="input-wrapper"
                    [class.input-wrapper--invalid]="form.touched && form.errors?.['passwordMismatch']"
                  >
                    <span class="material-icons input-icon">lock_clock</span>
                    <input
                      id="confirm-password"
                      [type]="confirmPasswordVisible() ? 'text' : 'password'"
                      formControlName="confirmPassword"
                      autocomplete="new-password"
                      placeholder="••••••••••••"
                      aria-describedby="confirm-error"
                    />
                    <button
                      type="button"
                      class="password-toggle"
                      (click)="confirmPasswordVisible.set(!confirmPasswordVisible())"
                      [attr.aria-label]="confirmPasswordVisible() ? 'Masquer le mot de passe' : 'Afficher le mot de passe'"
                    >
                      <span class="material-icons">{{ confirmPasswordVisible() ? 'visibility_off' : 'visibility' }}</span>
                    </button>
                  </div>
                  @if (form.controls.confirmPassword.touched && form.errors?.['passwordMismatch']) {
                    <small id="confirm-error" class="form-error">Les deux mots de passe ne correspondent pas.</small>
                  }
                </div>

                <button
                  type="submit"
                  class="submit-button"
                  [disabled]="form.invalid || loading()"
                >
                  @if (loading()) {
                    <span class="spinner"></span>
                    <span>Enregistrement…</span>
                  } @else {
                    <span>Enregistrer mon mot de passe</span>
                    <span class="material-icons">check</span>
                  }
                </button>
              </form>

              <div class="portal-card__footer">
                <p>
                  <a routerLink="/portal/login">Retour à la connexion</a>
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
        gap: 4px;
      }

      .portal-alert__content p {
        margin: 0;
        font-size: 0.84rem;
        line-height: 1.5;
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

      .password-toggle {
        background: transparent;
        border: none;
        color: #839790;
        cursor: pointer;
        padding: 6px;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .password-toggle:hover {
        color: #0f5e4f;
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
      }

      .portal-card__footer a:hover {
        text-decoration: underline;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PortalResetPasswordPage implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly api = inject(PortalApiService);

  protected readonly token = signal<string | null>(null);
  protected readonly passwordVisible = signal(false);
  protected readonly confirmPasswordVisible = signal(false);
  protected readonly loading = signal(false);
  protected readonly success = signal(false);
  protected readonly resetEmail = signal<string | null>(null);
  protected readonly error = signal<string | null>(null);

  protected readonly form = this.fb.nonNullable.group(
    {
      password: [
        '',
        [
          Validators.required,
          Validators.minLength(8),
          Validators.pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/),
        ],
      ],
      confirmPassword: ['', [Validators.required]],
    },
    { validators: [passwordsMatchValidator()] },
  );

  ngOnInit(): void {
    const rawToken = this.route.snapshot.queryParamMap.get('token');
    this.token.set(rawToken ? rawToken.trim() : null);
  }

  protected submit(): void {
    const tokenVal = this.token();
    if (!tokenVal || this.form.invalid || this.loading()) return;
    this.loading.set(true);
    this.error.set(null);

    const { password } = this.form.getRawValue();
    this.api.resetPassword(tokenVal, password).subscribe({
      next: (res) => {
        this.loading.set(false);
        this.resetEmail.set(res.email);
        this.success.set(true);
      },
      error: (err) => {
        this.loading.set(false);
        const problem = getApiProblem(err);
        this.error.set(problem?.message ?? 'Impossible de réinitialiser le mot de passe.');
      },
    });
  }
}
