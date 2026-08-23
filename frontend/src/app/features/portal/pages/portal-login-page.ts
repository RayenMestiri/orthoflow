import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { PortalAuthStore } from '../data-access/portal-auth.store';
@Component({
  selector: 'app-portal-login-page',
  imports: [ReactiveFormsModule],
  template: `<main class="auth">
    <section>
      <a class="brand" href="/">OrthoFlow</a>
      <p class="kicker">Family portal</p>
      <h1>Follow their care,<br />with less uncertainty.</h1>
      <p class="copy">
        Appointments, treatment guidance, recorded payments and documents shared by your clinic—kept
        in one private place.
      </p>
    </section>
    <form [formGroup]="form" (ngSubmit)="submit()">
      <h2>Welcome back</h2>
      <p>Use the email address invited by your clinic.</p>
      <label>Email<input type="email" formControlName="email" autocomplete="email" /></label
      ><label
        >Password<input type="password" formControlName="password" autocomplete="current-password"
      /></label>
      @if (error()) {
        <div class="error" role="alert">{{ error() }}</div>
      }
      <button [disabled]="form.invalid || loading()">
        {{ loading() ? 'Signing in…' : 'Sign in' }}
      </button>
    </form>
  </main>`,
  styles: [
    `
      :host {
        display: block;
        min-height: 100vh;
        background: #f6f3ec;
      }
      .auth {
        min-height: 100vh;
        display: grid;
        grid-template-columns: 1.05fr 0.95fr;
        align-items: center;
        gap: clamp(40px, 8vw, 120px);
        max-width: 1180px;
        margin: auto;
        padding: 48px;
      }
      .brand {
        color: #173f38;
        text-decoration: none;
        font-weight: 800;
        font-size: 22px;
      }
      .kicker {
        margin-top: 70px;
        color: #a94830;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.12em;
        font-size: 12px;
      }
      h1 {
        margin: 12px 0;
        color: #0d2925;
        font-size: clamp(42px, 6vw, 72px);
        line-height: 1.02;
        letter-spacing: -0.05em;
      }
      .copy {
        max-width: 540px;
        color: #56635f;
        font-size: 18px;
        line-height: 1.7;
      }
      form {
        max-width: 440px;
        padding: 36px;
        border: 1px solid #dce2de;
        border-radius: 20px;
        background: #fffefb;
        box-shadow: 0 20px 55px rgba(13, 41, 37, 0.08);
      }
      h2 {
        margin: 0;
        color: #0d2925;
        font-size: 30px;
      }
      form > p {
        color: #56635f;
      }
      label {
        display: grid;
        gap: 7px;
        margin: 20px 0;
        color: #173f38;
        font-size: 13px;
        font-weight: 700;
      }
      input {
        height: 48px;
        padding: 0 13px;
        border: 1px solid #bfc9c4;
        border-radius: 8px;
        background: #fff;
        font: inherit;
      }
      button {
        width: 100%;
        height: 48px;
        border: 0;
        border-radius: 8px;
        background: #173f38;
        color: #fff;
        font-weight: 700;
        cursor: pointer;
      }
      .error {
        margin: 12px 0;
        color: #a33d3d;
      }
      @media (max-width: 760px) {
        .auth {
          display: block;
          padding: 28px 20px;
        }
        .auth > section {
          margin-bottom: 34px;
        }
        .kicker {
          margin-top: 48px;
        }
        h1 {
          font-size: 42px;
        }
        form {
          padding: 25px;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PortalLoginPage {
  private fb = inject(FormBuilder);
  private auth = inject(PortalAuthStore);
  private router = inject(Router);
  protected loading = signal(false);
  protected error = signal('');
  protected form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', Validators.required],
  });
  protected async submit() {
    if (this.form.invalid) return;
    this.loading.set(true);
    this.error.set('');
    try {
      await this.auth.login(this.form.controls.email.value, this.form.controls.password.value);
      await this.router.navigate(['/portal/home']);
    } catch {
      this.error.set('We could not sign you in. Check your details or contact the clinic.');
    } finally {
      this.loading.set(false);
    }
  }
}
