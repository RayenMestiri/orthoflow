import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { PortalAuthStore } from '../data-access/portal-auth.store';
import { PortalApiService } from '../data-access/portal-api.service';
import type { PortalChildSummary } from '../models/portal.models';
import { PortalDatePipe } from '../presentation/portal-date.pipe';
@Component({
  selector: 'app-portal-home-page',
  imports: [PortalDatePipe, RouterLink],
  template: `<section class="portal-page">
    <p class="portal-kicker">Family overview</p>
    <h1 class="portal-title">Hello {{ auth.profile()?.fullName?.split(' ')?.[0] }}</h1>
    <p class="portal-lede">
      The essentials your clinic has shared, without the operational detail.
    </p>
    @if (loading()) {
      <div class="portal-empty">Loading your children…</div>
    } @else if (error()) {
      <div class="portal-error">
        {{ error() }} <button class="portal-link" (click)="load()">Retry</button>
      </div>
    } @else if (!children().length) {
      <div class="portal-empty">
        <h2>No children are linked yet</h2>
        <p>Contact the clinic if you expected to see a child here.</p>
      </div>
    } @else {
      <div class="portal-grid">
        @for (child of children(); track child.id) {
          <article class="portal-card">
            <div class="portal-row">
              <div>
                <p class="portal-kicker">Your child</p>
                <h2>{{ child.fullName }}</h2>
              </div>
              <span class="portal-status">{{ child.treatment?.status || 'Care record' }}</span>
            </div>
            <div class="portal-row">
              <div>
                <small class="portal-muted">Next appointment</small>
                <p>
                  <strong>{{
                    child.nextAppointment
                      ? (child.nextAppointment.startAt
                        | portalDate: auth.profile()?.clinic?.timezone : 'appointment')
                      : 'Not scheduled'
                  }}</strong>
                </p>
              </div>
            </div>
            <div class="portal-row">
              <div>
                <small class="portal-muted">Treatment</small>
                <p>
                  <strong>{{ child.treatment?.label || 'No active treatment' }}</strong>
                </p>
              </div>
            </div>
            <a class="portal-link" [routerLink]="['/portal/children', child.id]">Open child</a>
          </article>
        }
      </div>
    }
  </section>`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PortalHomePage implements OnInit {
  protected auth = inject(PortalAuthStore);
  private api = inject(PortalApiService);
  protected children = signal<PortalChildSummary[]>([]);
  protected loading = signal(true);
  protected error = signal('');
  ngOnInit() {
    void this.load();
  }
  protected async load() {
    this.loading.set(true);
    this.error.set('');
    try {
      this.children.set(await firstValueFrom(this.api.children()));
    } catch {
      this.error.set('We could not load the family overview.');
    } finally {
      this.loading.set(false);
    }
  }
}
