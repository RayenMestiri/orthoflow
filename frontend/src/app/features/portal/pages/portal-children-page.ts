import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { PortalApiService } from '../data-access/portal-api.service';
import type { PortalChildSummary } from '../models/portal.models';
@Component({
  selector: 'app-portal-children-page',
  imports: [RouterLink],
  template: `<section class="portal-page">
    <p class="portal-kicker">Family</p>
    <h1 class="portal-title">My children</h1>
    <p class="portal-lede">
      Each profile contains only information approved for the family portal.
    </p>
    @if (loading()) {
      <div class="portal-empty">Loading…</div>
    } @else {
      <div class="portal-grid">
        @for (child of children(); track child.id) {
          <article class="portal-card">
            <h2>{{ child.fullName }}</h2>
            <p>
              {{ child.age === null ? 'Age not recorded' : child.age + ' years old' }} ·
              {{ label(child.relationship) }}
            </p>
            <p>
              <span class="portal-status">{{
                child.treatment?.status || 'No current treatment'
              }}</span>
            </p>
            <a class="portal-link" [routerLink]="['/portal/children', child.id]"
              >View care overview</a
            >
          </article>
        } @empty {
          <div class="portal-empty">No linked children.</div>
        }
      </div>
    }
  </section>`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PortalChildrenPage implements OnInit {
  private api = inject(PortalApiService);
  protected children = signal<PortalChildSummary[]>([]);
  protected loading = signal(true);
  ngOnInit() {
    firstValueFrom(this.api.children())
      .then((v) => this.children.set(v))
      .finally(() => this.loading.set(false));
  }
  protected label(v: string) {
    return v.toLowerCase().replaceAll('_', ' ');
  }
}
