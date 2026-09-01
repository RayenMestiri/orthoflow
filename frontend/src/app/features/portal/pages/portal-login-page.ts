import { ChangeDetectionStrategy, Component, inject, signal, OnInit } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { PortalAuthStore } from '../data-access/portal-auth.store';
import { getApiProblem } from '../../../core/http/api-error';

@Component({
  selector: 'app-portal-login-page',
  imports: [ReactiveFormsModule, RouterLink],
  template: `
    <main class="portal-auth">
      <!-- Background Ambient Glow -->
      <div class="portal-auth__ambient" aria-hidden="true">
        <div class="glow glow--top"></div>
        <div class="glow glow--bottom"></div>
      </div>

      <div class="portal-auth__container">
        <!-- Left Showcase Column -->
        <section class="portal-showcase">
          <header class="portal-showcase__header">
            <a class="brand" routerLink="/">
              <div class="brand__logo">
                <span class="material-icons" aria-hidden="true">spa</span>
              </div>
              <span class="brand__text">OrthoFlow</span>
            </a>
            <div class="portal-badge">
              <span class="portal-badge__dot"></span>
              <span>Portail Famille & Patients</span>
            </div>
          </header>

          <div class="portal-showcase__body">
            <span class="portal-kicker">Espace privé & sécurisé</span>
            <h1 class="portal-headline">
              Suivez les soins de vos proches,<br />
              <span class="gradient-text">avec sérénité et clarté.</span>
            </h1>
            <p class="portal-description">
              Rendez-vous, consignes de traitement, relevés de règlements et documents certifiés
              partagés par votre clinique — réunis dans un espace privé d'exception.
            </p>

            <div class="portal-features">
              <div class="feature-card">
                <div class="feature-card__icon feature-card__icon--cal">
                  <span class="material-icons">event_available</span>
                </div>
                <div class="feature-card__content">
                  <strong>Agenda en direct</strong>
                  <small>Rappels automatiques & contrôles</small>
                </div>
              </div>

              <div class="feature-card">
                <div class="feature-card__icon feature-card__icon--treatment">
                  <span class="material-icons">health_and_safety</span>
                </div>
                <div class="feature-card__content">
                  <strong>Suivi du traitement</strong>
                  <small>Conseils & appareils de rétention</small>
                </div>
              </div>

              <div class="feature-card">
                <div class="feature-card__icon feature-card__icon--finance">
                  <span class="material-icons">receipt_long</span>
                </div>
                <div class="feature-card__content">
                  <strong>Reçus & règlements</strong>
                  <small>Reçus certifiés téléchargeables</small>
                </div>
              </div>

              <div class="feature-card">
                <div class="feature-card__icon feature-card__icon--doc">
                  <span class="material-icons">verified_user</span>
                </div>
                <div class="feature-card__content">
                  <strong>Documents officiels</strong>
                  <small>Consentements & bilans cliniques</small>
                </div>
              </div>
            </div>
          </div>

          <footer class="portal-showcase__footer">
            <span class="material-icons">lock</span>
            <span>Accès chiffré de bout en bout · Données de santé protégées</span>
          </footer>
        </section>

        <!-- Right Form Column -->
        <section class="portal-card-shell">
          <!-- Quick Switcher Tabs -->
          <div class="portal-switcher" role="tablist" aria-label="Espaces de connexion">
            <button
              type="button"
              class="portal-switcher__tab portal-switcher__tab--active"
              role="tab"
              aria-selected="true"
            >
              <span class="material-icons">family_restroom</span>
              <span>Portail Famille</span>
            </button>
            <a
              routerLink="/login"
              [queryParams]="form.controls.email.value ? { email: form.controls.email.value, copied: 'true' } : null"
              class="portal-switcher__tab"
              role="tab"
              aria-selected="false"
              title="Basculer vers l'espace cabinet pour les praticiens et le personnel"
            >
              <span class="material-icons">local_hospital</span>
              <span>Espace Cabinet</span>
            </a>
          </div>

          <div class="portal-card">
            <!-- Reception / Transferred Coordinate Banner -->
            @if (copiedNotice()) {
              <div class="portal-alert portal-alert--success" role="status">
                <span class="material-icons">auto_awesome</span>
                <div>
                  <strong>Coordonnées transmises</strong>
                  <p>{{ copiedNotice() }}</p>
                </div>
              </div>
            }

            <div class="portal-card__header">
              <h2>Connexion Famille</h2>
              <p>Renseignez l'adresse email invitée par votre cabinet orthodontique.</p>
            </div>

            <!-- Error Banner & Smart Bridge -->
            @if (error()) {
              <div class="portal-alert portal-alert--error" role="alert">
                <span class="material-icons">info</span>
                <div class="portal-alert__content">
                  <span>{{ error() }}</span>
                  @if (isStaffAccount()) {
                    <a
                      routerLink="/login"
                      [queryParams]="{ email: form.controls.email.value, copied: 'true' }"
                      class="smart-bridge-btn"
                    >
                      <span class="material-icons">arrow_forward</span>
                      Basculer sur l'Espace Cabinet
                    </a>
                  }
                </div>
              </div>
            }

            <form [formGroup]="form" (ngSubmit)="submit()" class="portal-form" novalidate>
              <div class="form-group">
                <label for="portal-email">Adresse email</label>
                <div class="input-wrapper" [class.input-wrapper--invalid]="form.controls.email.touched && form.controls.email.invalid">
                  <span class="material-icons input-icon">email</span>
                  <input
                    id="portal-email"
                    type="email"
                    formControlName="email"
                    autocomplete="email"
                    placeholder="parent@exemple.com"
                    aria-describedby="email-help"
                  />
                </div>
                @if (form.controls.email.touched && form.controls.email.invalid) {
                  <small id="email-help" class="form-error">Veuillez saisir une adresse email valide.</small>
                }
              </div>

              <div class="form-group">
                <div class="label-split">
                  <label for="portal-password">Mot de passe</label>
                  <a
                    routerLink="/portal/forgot-password"
                    [queryParams]="form.controls.email.value ? { email: form.controls.email.value } : null"
                    class="forgot-password-link"
                  >
                    Mot de passe oublié ?
                  </a>
                </div>
                <div class="input-wrapper" [class.input-wrapper--invalid]="form.controls.password.touched && form.controls.password.invalid">
                  <span class="material-icons input-icon">lock</span>
                  <input
                    id="portal-password"
                    [type]="passwordVisible() ? 'text' : 'password'"
                    formControlName="password"
                    autocomplete="current-password"
                    placeholder="••••••••••••"
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
              </div>

              <button
                type="submit"
                class="submit-button"
                [disabled]="form.invalid || loading()"
              >
                @if (loading()) {
                  <span class="spinner"></span>
                  <span>Connexion en cours…</span>
                } @else {
                  <span>Accéder à mon espace famille</span>
                  <span class="material-icons">arrow_forward</span>
                }
              </button>
            </form>

            <div class="portal-card__footer">
              <p>
                Vous avez reçu un lien d'activation ?
                <a routerLink="/portal/activate">Activer mon compte</a>
              </p>
            </div>
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
        color: #12332c;
        font-family: var(--font-sans, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif);
      }

      .portal-auth {
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        position: relative;
        padding: clamp(24px, 4vw, 60px) 20px;
        overflow: hidden;
      }

      .portal-auth__ambient {
        position: absolute;
        inset: 0;
        pointer-events: none;
        overflow: hidden;
      }

      .glow {
        position: absolute;
        border-radius: 50%;
        filter: blur(90px);
        opacity: 0.45;
      }

      .glow--top {
        top: -10%;
        left: -10%;
        width: 50vw;
        height: 50vw;
        background: radial-gradient(circle, rgba(16, 185, 129, 0.18), transparent 70%);
      }

      .glow--bottom {
        bottom: -15%;
        right: -10%;
        width: 60vw;
        height: 60vw;
        background: radial-gradient(circle, rgba(20, 100, 85, 0.15), transparent 70%);
      }

      .portal-auth__container {
        width: 100%;
        max-width: 1200px;
        display: grid;
        grid-template-columns: 1.15fr 0.95fr;
        gap: clamp(32px, 5vw, 80px);
        align-items: center;
        position: relative;
        z-index: 1;
      }

      /* Left Column */
      .portal-showcase {
        display: flex;
        flex-direction: column;
        gap: 32px;
      }

      .portal-showcase__header {
        display: flex;
        align-items: center;
        gap: 16px;
        flex-wrap: wrap;
      }

      .brand {
        display: inline-flex;
        align-items: center;
        gap: 10px;
        text-decoration: none;
        color: #0c2d26;
        font-weight: 800;
        font-size: 1.4rem;
        letter-spacing: -0.02em;
      }

      .brand__logo {
        width: 38px;
        height: 38px;
        border-radius: 10px;
        background: linear-gradient(135deg, #0d3830 0%, #175447 100%);
        color: #5eead4;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 4px 12px rgba(13, 56, 48, 0.2);
      }

      .portal-badge {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        background: #e6f4f0;
        color: #0d5f50;
        font-size: 0.82rem;
        font-weight: 700;
        padding: 6px 14px;
        border-radius: 9999px;
        border: 1px solid #bce6dc;
      }

      .portal-badge__dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: #10b981;
        box-shadow: 0 0 8px #10b981;
      }

      .portal-kicker {
        color: #b45309;
        font-size: 0.8rem;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.12em;
      }

      .portal-headline {
        margin: 10px 0 16px;
        font-size: clamp(2rem, 3.8vw, 3.1rem);
        line-height: 1.15;
        font-weight: 800;
        letter-spacing: -0.035em;
        color: #082620;
      }

      .gradient-text {
        background: linear-gradient(135deg, #0d5f50 0%, #059669 100%);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
      }

      .portal-description {
        font-size: 1.05rem;
        line-height: 1.65;
        color: #4a5c56;
        max-width: 520px;
        margin: 0;
      }

      .portal-features {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        gap: 16px;
        margin-top: 12px;
      }

      .feature-card {
        display: flex;
        align-items: center;
        gap: 14px;
        background: rgba(255, 255, 255, 0.7);
        backdrop-filter: blur(12px);
        padding: 14px 16px;
        border-radius: 14px;
        border: 1px solid rgba(220, 230, 226, 0.8);
        box-shadow: 0 4px 16px rgba(10, 40, 34, 0.04);
        transition: transform 0.2s ease, box-shadow 0.2s ease;
      }

      .feature-card:hover {
        transform: translateY(-2px);
        box-shadow: 0 8px 24px rgba(10, 40, 34, 0.08);
      }

      .feature-card__icon {
        width: 40px;
        height: 40px;
        border-radius: 10px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 20px;
        flex-shrink: 0;
      }

      .feature-card__icon--cal { background: #e0f2fe; color: #0284c7; }
      .feature-card__icon--treatment { background: #dcfce7; color: #16a34a; }
      .feature-card__icon--finance { background: #fef3c7; color: #d97706; }
      .feature-card__icon--doc { background: #f3e8ff; color: #9333ea; }

      .feature-card__content {
        display: flex;
        flex-direction: column;
      }

      .feature-card__content strong {
        font-size: 0.92rem;
        color: #0d3830;
      }

      .feature-card__content small {
        font-size: 0.76rem;
        color: #64748b;
      }

      .portal-showcase__footer {
        display: flex;
        align-items: center;
        gap: 8px;
        color: #64748b;
        font-size: 0.82rem;
      }

      .portal-showcase__footer .material-icons {
        font-size: 16px;
        color: #10b981;
      }

      /* Right Column: Card Shell */
      .portal-card-shell {
        display: flex;
        flex-direction: column;
        gap: 16px;
        max-width: 480px;
        width: 100%;
        margin: 0 auto;
      }

      .portal-switcher {
        display: flex;
        background: #ede8df;
        padding: 5px;
        border-radius: 14px;
        gap: 4px;
      }

      .portal-switcher__tab {
        flex: 1;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        padding: 10px 14px;
        border-radius: 10px;
        font-size: 0.88rem;
        font-weight: 700;
        text-decoration: none;
        color: #52635d;
        border: none;
        background: transparent;
        cursor: pointer;
        transition: all 0.2s ease;
      }

      .portal-switcher__tab .material-icons {
        font-size: 18px;
      }

      .portal-switcher__tab--active {
        background: #ffffff;
        color: #0c332b;
        box-shadow: 0 3px 10px rgba(12, 51, 43, 0.08);
      }

      .portal-switcher__tab:not(.portal-switcher__tab--active):hover {
        color: #0c332b;
        background: rgba(255, 255, 255, 0.5);
      }

      .portal-card {
        background: #ffffff;
        border: 1px solid #e2e8e4;
        border-radius: 24px;
        padding: clamp(28px, 4vw, 40px);
        box-shadow: 0 20px 48px rgba(13, 45, 38, 0.08);
        display: flex;
        flex-direction: column;
        gap: 22px;
      }

      .portal-card__header h2 {
        margin: 0 0 6px;
        font-size: 1.6rem;
        font-weight: 800;
        color: #0a2922;
        letter-spacing: -0.02em;
      }

      .portal-card__header p {
        margin: 0;
        font-size: 0.9rem;
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
        gap: 10px;
        flex: 1;
      }

      .smart-bridge-btn {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        align-self: flex-start;
        background: #0f483d;
        color: #ffffff;
        text-decoration: none;
        font-size: 0.82rem;
        font-weight: 700;
        padding: 6px 12px;
        border-radius: 8px;
        transition: background 0.2s ease;
      }

      .smart-bridge-btn:hover {
        background: #156252;
      }

      .smart-bridge-btn .material-icons {
        font-size: 16px;
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

      .label-split {
        display: flex;
        justify-content: space-between;
        align-items: center;
      }

      .forgot-password-link {
        font-size: 0.78rem;
        font-weight: 700;
        color: #0f5e4f;
        text-decoration: none;
        transition: color 0.2s ease;
      }

      .forgot-password-link:hover {
        color: #173d34;
        text-decoration: underline;
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
        to { transform: rotate(360deg); }
      }

      .portal-card__footer {
        border-top: 1px solid #edf2ef;
        padding-top: 18px;
        text-align: center;
        font-size: 0.86rem;
        color: #556761;
      }

      .portal-card__footer a {
        color: #0d5f50;
        font-weight: 700;
        text-decoration: none;
      }

      .portal-card__footer a:hover {
        text-decoration: underline;
      }

      @media (max-width: 900px) {
        .portal-auth__container {
          grid-template-columns: 1fr;
          gap: 40px;
        }
        .portal-showcase {
          text-align: center;
          align-items: center;
        }
        .portal-showcase__header {
          justify-content: center;
        }
        .portal-description {
          margin: 0 auto;
        }
        .portal-features {
          grid-template-columns: 1fr 1fr;
        }
      }

      @media (max-width: 540px) {
        .portal-features {
          grid-template-columns: 1fr;
        }
        .portal-card {
          padding: 24px 18px;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PortalLoginPage implements OnInit {
  private fb = inject(FormBuilder);
  private auth = inject(PortalAuthStore);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  protected loading = signal(false);
  protected error = signal('');
  protected isStaffAccount = signal(false);
  protected passwordVisible = signal(false);
  protected copiedNotice = signal<string | null>(null);

  protected form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', Validators.required],
  });

  ngOnInit(): void {
    const emailParam = this.route.snapshot.queryParamMap.get('email');
    const copiedParam = this.route.snapshot.queryParamMap.get('copied');

    if (emailParam) {
      this.form.controls.email.setValue(emailParam);
    }
    if (copiedParam === 'true') {
      this.copiedNotice.set(
        '✨ Coordonnées transmises : Bienvenue sur le Portail Famille OrthoFlow. Vos identifiants ont été pré-remplis.',
      );
    }
  }

  protected async submit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.loading.set(true);
    this.error.set('');
    this.isStaffAccount.set(false);

    try {
      await this.auth.login(
        this.form.controls.email.value.trim().toLowerCase(),
        this.form.controls.password.value,
      );
      await this.router.navigate(['/portal/home']);
    } catch (err: unknown) {
      const problem = getApiProblem(err);
      if (problem.code === 'STAFF_ACCOUNT_DETECTED') {
        this.isStaffAccount.set(true);
        this.error.set(problem.message);
      } else {
        this.error.set(
          problem.message ||
            'Impossible de vous connecter. Vérifiez vos identifiants ou contactez votre clinique.',
        );
      }
    } finally {
      this.loading.set(false);
    }
  }
}
