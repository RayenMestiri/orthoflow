import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { PortalAuthStore } from '../data-access/portal-auth.store';
@Component({
  selector: 'app-portal-activate-page',
  imports: [ReactiveFormsModule],
  template: `<main class="activate">
    <form [formGroup]="form" (ngSubmit)="submit()">
      <p>OrthoFlow family portal</p>
      <h1>Create your private access</h1>
      <span>Choose a strong password. The invitation link can be used only once.</span
      ><label
        >Password<input
          type="password"
          formControlName="password"
          autocomplete="new-password" /></label
      ><label
        >Confirm password<input
          type="password"
          formControlName="confirm"
          autocomplete="new-password"
      /></label>
      @if (error()) {
        <div role="alert">{{ error() }}</div>
      }
      <button [disabled]="form.invalid || loading()">
        {{ loading() ? 'Activating…' : 'Activate access' }}
      </button>
    </form>
  </main>`,
  styles: [
    `
      :host {
        display: block;
        min-height: 100vh;
        background: #0d2925;
      }
      .activate {
        min-height: 100vh;
        display: grid;
        place-items: center;
        padding: 20px;
      }
      form {
        width: min(100%, 460px);
        padding: 36px;
        border-radius: 20px;
        background: #fffefb;
      }
      form > p {
        color: #a94830;
        font-size: 12px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.1em;
      }
      h1 {
        color: #0d2925;
        font-size: 34px;
      }
      span {
        display: block;
        color: #56635f;
        line-height: 1.6;
      }
      label {
        display: grid;
        gap: 7px;
        margin: 20px 0;
        color: #173f38;
        font-weight: 700;
        font-size: 13px;
      }
      input {
        height: 48px;
        padding: 0 13px;
        border: 1px solid #bfc9c4;
        border-radius: 8px;
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
      }
      div[role='alert'] {
        color: #a33d3d;
        margin-bottom: 14px;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PortalActivatePage {
  private fb = inject(FormBuilder);
  private auth = inject(PortalAuthStore);
  private router = inject(Router);
  private token = inject(ActivatedRoute).snapshot.queryParamMap.get('token') ?? '';
  protected loading = signal(false);
  protected error = signal('');
  protected form = this.fb.nonNullable.group({
    password: ['', [Validators.required, Validators.minLength(10)]],
    confirm: ['', Validators.required],
  });
  protected async submit() {
    const value = this.form.getRawValue();
    if (!this.token || value.password !== value.confirm) {
      this.error.set('Passwords must match and the invitation link must be valid.');
      return;
    }
    this.loading.set(true);
    try {
      await this.auth.activate(this.token, value.password);
      await this.router.navigate(['/portal/home']);
    } catch {
      this.error.set(
        'This invitation is invalid, expired, or already used. Ask the clinic for a new invitation.',
      );
    } finally {
      this.loading.set(false);
    }
  }
}
