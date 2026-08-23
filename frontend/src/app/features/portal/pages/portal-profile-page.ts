import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { PortalAuthStore } from '../data-access/portal-auth.store';
@Component({
  selector: 'app-portal-profile-page',
  template: `<section class="portal-page">
    <p class="portal-kicker">Account</p>
    <h1 class="portal-title">Profile</h1>
    <p class="portal-lede">
      Your clinic controls which children and documents are connected to this private account.
    </p>
    <article class="portal-card">
      <div class="portal-row">
        <span>Name</span><strong>{{ auth.profile()?.fullName }}</strong>
      </div>
      <div class="portal-row">
        <span>Email</span><strong>{{ auth.profile()?.email }}</strong>
      </div>
      <div class="portal-row">
        <span>Clinic</span><strong>{{ auth.profile()?.clinic?.name }}</strong>
      </div>
    </article>
    <div class="portal-empty" style="margin-top:18px">
      To change your email or access, contact the clinic. This portal cannot edit clinical records.
    </div>
  </section>`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PortalProfilePage {
  protected auth = inject(PortalAuthStore);
}
