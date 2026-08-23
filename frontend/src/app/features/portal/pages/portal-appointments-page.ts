import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { PortalAuthStore } from '../data-access/portal-auth.store';
import { PortalApiService } from '../data-access/portal-api.service';
import type { PortalAppointment } from '../models/portal.models';
import { PortalDatePipe } from '../presentation/portal-date.pipe';
@Component({
  selector: 'app-portal-appointments-page',
  imports: [PortalDatePipe],
  template: `<section class="portal-page">
    <p class="portal-kicker">Visits</p>
    <h1 class="portal-title">Appointments</h1>
    <p class="portal-lede">Upcoming and recent clinic visits for all linked children.</p>
    @if (loading()) {
      <div class="portal-empty">Loading appointments…</div>
    } @else {
      <article class="portal-card">
        @for (item of appointments(); track item.id) {
          <div class="portal-row">
            <div>
              <strong>{{ item.childName }}</strong>
              <p>
                {{ item.startAt | portalDate: auth.profile()?.clinic?.timezone : 'appointment'
                }}<br /><small
                  >{{ item.typeLabel
                  }}{{ item.treatmentLabel ? ' · ' + item.treatmentLabel : '' }}</small
                >
              </p>
            </div>
            <span class="portal-status">{{ friendly(item.status) }}</span>
          </div>
        } @empty {
          <div class="portal-empty">No upcoming or recent appointments.</div>
        }
      </article>
    }
  </section>`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PortalAppointmentsPage implements OnInit {
  protected auth = inject(PortalAuthStore);
  private api = inject(PortalApiService);
  protected appointments = signal<PortalAppointment[]>([]);
  protected loading = signal(true);
  ngOnInit() {
    firstValueFrom(this.api.appointments())
      .then((v) => this.appointments.set(v))
      .finally(() => this.loading.set(false));
  }
  protected friendly(v: string) {
    return v
      .toLowerCase()
      .replaceAll('_', ' ')
      .replace(/^./, (m) => m.toUpperCase());
  }
}
