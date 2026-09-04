import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthStore } from '../../../../core/auth/auth.store';
import {
  MembershipApiService,
  type AddMemberBody,
  type MembershipDto,
  type MembershipRole,
  type MembershipStatus,
} from '../../data-access/membership-api.service';

interface ConfirmRemove {
  membershipId: string;
  name: string;
}

const ROLE_LABELS: Record<MembershipRole, string> = {
  CLINIC_OWNER: 'Propriétaire',
  ORTHODONTIST: 'Orthodontiste',
  DENTIST: 'Dentiste',
  SECRETARY: 'Secrétaire',
  ASSISTANT: 'Assistant(e)',
};

@Component({
  selector: 'app-settings-team',
  standalone: true,
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="team-section" aria-labelledby="team-section-title">

      <!-- Section header -->
      <header class="team-header">
        <div class="team-header__copy">
          <h2 id="team-section-title" class="team-header__title">Équipe &amp; accès</h2>
          <p class="team-header__sub">
            Gérez les membres de votre cabinet et leurs niveaux d'accès à la plateforme.
          </p>
        </div>
        <div class="team-header__badge">
          <span class="material-icons" aria-hidden="true">group</span>
          <span>{{ members().length }} membre{{ members().length !== 1 ? 's' : '' }}</span>
        </div>
      </header>

      <!-- ── INVITE FORM ── -->
      <div class="invite-card" [class.invite-card--success]="successMsg()">
        <div class="invite-card__label-row">
          <span class="material-icons invite-card__icon" aria-hidden="true">person_add</span>
          <strong>Inviter un membre</strong>
        </div>

        @if (successMsg(); as msg) {
          <div class="invite-toast" role="status">
            <span class="material-icons" aria-hidden="true">check_circle</span>
            <span>{{ msg }}</span>
          </div>
        } @else {

          <form class="invite-form" (ngSubmit)="submitInvite()" #inviteForm="ngForm" novalidate>

            <!-- Row 1: email + role -->
            <div class="invite-row">
              <div class="field-group field-group--grow">
                <label class="field-label" for="inv-email">Adresse e-mail *</label>
                <input
                  id="inv-email"
                  name="email"
                  type="email"
                  class="field-input"
                  [(ngModel)]="form.email"
                  required
                  placeholder="prenom.nom@exemple.com"
                  autocomplete="off"
                  [disabled]="submitting()"
                />
              </div>

              <div class="field-group field-group--role">
                <label class="field-label" for="inv-role">Rôle *</label>
                <select
                  id="inv-role"
                  name="role"
                  class="field-select"
                  [(ngModel)]="form.role"
                  [disabled]="submitting()"
                >
                  @for (r of assignableRoles; track r.value) {
                    <option [value]="r.value">{{ r.label }}</option>
                  }
                </select>
              </div>
            </div>

            <!-- Extra fields shown when account doesn't exist yet -->
            @if (needsAccount()) {
              <div class="invite-new-account-banner" role="alert">
                <span class="material-icons" aria-hidden="true">info</span>
                <span>Aucun compte trouvé pour cet e-mail. Renseignez les informations ci-dessous pour créer le compte.</span>
              </div>

              <div class="invite-row">
                <div class="field-group field-group--half">
                  <label class="field-label" for="inv-first">Prénom *</label>
                  <input
                    id="inv-first"
                    name="firstName"
                    type="text"
                    class="field-input"
                    [(ngModel)]="form.firstName"
                    required
                    placeholder="Prénom"
                    [disabled]="submitting()"
                  />
                </div>
                <div class="field-group field-group--half">
                  <label class="field-label" for="inv-last">Nom *</label>
                  <input
                    id="inv-last"
                    name="lastName"
                    type="text"
                    class="field-input"
                    [(ngModel)]="form.lastName"
                    required
                    placeholder="Nom de famille"
                    [disabled]="submitting()"
                  />
                </div>
              </div>

              <div class="field-group">
                <label class="field-label" for="inv-pwd">Mot de passe temporaire *</label>
                <input
                  id="inv-pwd"
                  name="password"
                  type="password"
                  class="field-input"
                  [(ngModel)]="form.password"
                  required
                  placeholder="Min. 10 car. avec lettre + chiffre"
                  [disabled]="submitting()"
                />
                <small class="field-hint">Au moins 10 caractères, une lettre et un chiffre.</small>
              </div>
            }

            @if (inviteError()) {
              <p class="invite-error" role="alert">
                <span class="material-icons" aria-hidden="true">error_outline</span>
                {{ inviteError() }}
              </p>
            }

            <div class="invite-actions">
              <button
                type="submit"
                class="btn-primary"
                [disabled]="submitting() || !form.email || (needsAccount() && !isPasswordValid())"
              >
                @if (submitting()) {
                  <span class="btn-spinner" aria-hidden="true"></span>
                  <span>Invitation en cours...</span>
                } @else {
                  <span class="material-icons" aria-hidden="true">send</span>
                  <span>{{ needsAccount() ? 'Créer le compte &amp; inviter' : 'Inviter' }}</span>
                }
              </button>
            </div>

          </form>
        }
      </div>

      <!-- ── MEMBERS LIST ── -->
      <div class="members-card">
        <div class="members-card__header">
          <strong>Membres actifs &amp; invités</strong>
        </div>

        @if (loading()) {
          <!-- Skeleton -->
          @for (s of [1,2,3]; track s) {
            <div class="member-row member-row--skeleton" aria-hidden="true">
              <div class="skel skel--avatar"></div>
              <div class="skel-body">
                <div class="skel skel--name"></div>
                <div class="skel skel--email"></div>
              </div>
              <div class="skel skel--badge"></div>
            </div>
          }
        } @else if (visibleMembers().length === 0) {
          <div class="members-empty">
            <span class="material-icons members-empty__icon" aria-hidden="true">group_add</span>
            <p>Aucun membre dans ce cabinet.</p>
            <p class="members-empty__sub">Utilisez le formulaire ci-dessus pour inviter votre équipe.</p>
          </div>
        } @else {
          @for (m of visibleMembers(); track m.id) {
            <div class="member-row" [class.member-row--self]="isSelf(m)">

              <!-- Avatar -->
              <div class="member-avatar" [attr.aria-label]="displayName(m)">
                {{ initials(m) }}
              </div>

              <!-- Info -->
              <div class="member-info">
                <span class="member-name">
                  {{ displayName(m) }}
                  @if (isSelf(m)) { <span class="member-self-tag">Vous</span> }
                </span>
                <span class="member-email">{{ m.user?.email ?? '—' }}</span>
              </div>

              <!-- Badges -->
              <div class="member-badges">
                <span class="role-badge" [attr.data-role]="m.role">{{ roleLabel(m.role) }}</span>
                <span class="status-badge" [attr.data-status]="m.status">{{ statusLabel(m.status) }}</span>
              </div>

              <!-- Actions (disabled for self) -->
              @if (!isSelf(m)) {
                <div class="member-actions">

                  <!-- Role change with validation button -->
                  <div class="role-selector-wrap">
                    <select
                      class="member-role-select"
                      [class.has-pending-change]="hasRoleChanged(m)"
                      [value]="getSelectedRole(m)"
                      [disabled]="updatingId() === m.id"
                      (change)="onRoleSelectChange(m, $any($event.target).value)"
                      [attr.aria-label]="'Rôle de ' + displayName(m)"
                    >
                      @for (r of assignableRoles; track r.value) {
                        <option [value]="r.value" [selected]="getSelectedRole(m) === r.value">{{ r.label }}</option>
                      }
                    </select>

                    @if (hasRoleChanged(m)) {
                      <button
                        type="button"
                        class="btn-action btn-action--save"
                        [disabled]="updatingId() === m.id"
                        (click)="saveRoleChange(m)"
                        [attr.aria-label]="'Valider le rôle de ' + displayName(m)"
                        title="Valider la modification du rôle"
                      >
                        @if (updatingId() === m.id) {
                          <span class="btn-spinner-sm" aria-hidden="true"></span>
                        } @else {
                          <span class="material-icons">check</span>
                        }
                      </button>

                      <button
                        type="button"
                        class="btn-action btn-action--cancel"
                        [disabled]="updatingId() === m.id"
                        (click)="cancelRoleChange(m.id)"
                        [attr.aria-label]="'Annuler la modification'"
                        title="Annuler"
                      >
                        <span class="material-icons">close</span>
                      </button>
                    }
                  </div>

                  <!-- Suspend / Reactivate -->
                  @if (m.status === 'ACTIVE') {
                    <button
                      type="button"
                      class="btn-action btn-action--warn"
                      [disabled]="updatingId() === m.id"
                      (click)="suspendMember(m)"
                      [attr.aria-label]="'Suspendre ' + displayName(m)"
                      title="Suspendre"
                    >
                      <span class="material-icons">pause_circle</span>
                    </button>
                  } @else if (m.status === 'SUSPENDED') {
                    <button
                      type="button"
                      class="btn-action btn-action--ok"
                      [disabled]="updatingId() === m.id"
                      (click)="reactivateMember(m)"
                      [attr.aria-label]="'Réactiver ' + displayName(m)"
                      title="Réactiver"
                    >
                      <span class="material-icons">play_circle</span>
                    </button>
                  }

                  <!-- Remove -->
                  @if (m.status !== 'REMOVED') {
                    <button
                      type="button"
                      class="btn-action btn-action--danger"
                      [disabled]="updatingId() === m.id"
                      (click)="confirmRemove({ membershipId: m.id, name: displayName(m) })"
                      [attr.aria-label]="'Retirer ' + displayName(m)"
                      title="Retirer du cabinet"
                    >
                      <span class="material-icons">person_remove</span>
                    </button>
                  }

                </div>
              }

            </div>
          }
        }
      </div>

      <!-- ── CONFIRM REMOVE DIALOG ── -->
      @if (pendingRemove()) {
        <div class="confirm-overlay" role="dialog" aria-modal="true" aria-labelledby="confirm-title"
             (click)="cancelRemove()">
          <div class="confirm-dialog" (click)="$event.stopPropagation()">
            <span class="material-icons confirm-dialog__icon" aria-hidden="true">warning</span>
            <h3 id="confirm-title" class="confirm-dialog__title">Retirer ce membre ?</h3>
            <p class="confirm-dialog__body">
              <strong>{{ pendingRemove()!.name }}</strong> n'aura plus accès au cabinet.
              Son historique (rendez-vous, paiements) sera conservé.
            </p>
            <div class="confirm-dialog__actions">
              <button type="button" class="btn-ghost" (click)="cancelRemove()">Annuler</button>
              <button type="button" class="btn-danger" [disabled]="updatingId() !== null"
                      (click)="executeRemove()">
                Retirer
              </button>
            </div>
          </div>
        </div>
      }

    </section>
  `,
  styles: [`
    .team-section {
      display: flex;
      flex-direction: column;
      gap: 24px;
    }

    /* ── Header ── */
    .team-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 16px;
    }
    .team-header__title {
      margin: 0 0 4px;
      font-size: 20px;
      font-weight: 800;
      letter-spacing: -0.02em;
      color: #0d2925;
    }
    .team-header__sub {
      margin: 0;
      font-size: 13px;
      color: #56635f;
    }
    .team-header__badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 14px;
      border-radius: 99px;
      background: rgba(23,63,56,0.08);
      color: #173f38;
      font-size: 13px;
      font-weight: 600;
      white-space: nowrap;
      flex-shrink: 0;
    }
    .team-header__badge .material-icons { font-size: 16px; }

    /* ── Invite card ── */
    .invite-card {
      padding: 24px;
      border: 2px dashed #dce2de;
      border-radius: 16px;
      background: #fffefb;
      transition: border-color 0.2s, box-shadow 0.2s;
    }
    .invite-card:focus-within {
      border-color: #c86445;
      box-shadow: 0 0 0 4px rgba(200,100,69,0.08);
    }
    .invite-card--success {
      border-style: solid;
      border-color: #1e4620;
      background: rgba(30,70,32,0.03);
    }
    .invite-card__label-row {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 16px;
      font-size: 14px;
      font-weight: 700;
      color: #0d2925;
    }
    .invite-card__icon { font-size: 18px; color: #c86445; }

    .invite-toast {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 14px 16px;
      border-radius: 10px;
      background: rgba(30,70,32,0.08);
      color: #1e4620;
      font-size: 14px;
      font-weight: 600;
    }
    .invite-toast .material-icons { color: #1e4620; font-size: 20px; }

    .invite-form { display: flex; flex-direction: column; gap: 14px; }

    .invite-row {
      display: flex;
      gap: 12px;
      flex-wrap: wrap;
    }

    .field-group { display: flex; flex-direction: column; gap: 6px; }
    .field-group--grow { flex: 1 1 220px; }
    .field-group--role { flex: 0 0 170px; }
    .field-group--half { flex: 1 1 160px; }

    .field-label {
      font-size: 12px;
      font-weight: 700;
      color: #56635f;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }

    .field-input,
    .field-select {
      padding: 10px 14px;
      border: 1.5px solid #dce2de;
      border-radius: 10px;
      background: #fff;
      color: #0d2925;
      font-size: 14px;
      font-family: inherit;
      transition: border-color 0.18s, box-shadow 0.18s;
      outline: none;
    }
    .field-input:focus,
    .field-select:focus {
      border-color: #c86445;
      box-shadow: 0 0 0 3px rgba(200,100,69,0.12);
    }
    .field-input::placeholder { color: #a0ada9; }
    .field-select { cursor: pointer; }
    .field-hint { font-size: 11px; color: #84918d; margin-top: 2px; }

    .invite-new-account-banner {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      padding: 12px 14px;
      border-radius: 10px;
      background: rgba(200,100,69,0.08);
      border: 1px solid rgba(200,100,69,0.25);
      color: #7a3120;
      font-size: 13px;
    }
    .invite-new-account-banner .material-icons { font-size: 18px; flex-shrink: 0; margin-top: 1px; }

    .invite-error {
      display: flex;
      align-items: center;
      gap: 8px;
      margin: 0;
      padding: 10px 14px;
      border-radius: 8px;
      background: rgba(185,28,28,0.06);
      color: #b91c1c;
      font-size: 13px;
    }
    .invite-error .material-icons { font-size: 16px; }

    .invite-actions { display: flex; justify-content: flex-end; }

    .btn-primary {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 11px 22px;
      border: none;
      border-radius: 10px;
      background: linear-gradient(135deg, #c86445 0%, #a84e35 100%);
      color: #fff;
      font-size: 14px;
      font-weight: 700;
      font-family: inherit;
      cursor: pointer;
      transition: opacity 0.18s, transform 0.18s;
    }
    .btn-primary:hover:not(:disabled) { opacity: 0.88; transform: translateY(-1px); }
    .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }
    .btn-primary .material-icons { font-size: 18px; }

    .btn-spinner {
      width: 16px; height: 16px;
      border: 2px solid rgba(255,255,255,0.35);
      border-top-color: #fff;
      border-radius: 50%;
      animation: spin 0.7s linear infinite;
      flex-shrink: 0;
    }
    @keyframes spin { to { transform: rotate(360deg); } }

    /* ── Members card ── */
    .members-card {
      border: 1px solid #dce2de;
      border-radius: 16px;
      background: #fffefb;
      box-shadow: 0 4px 20px rgba(13,41,37,0.06);
      overflow: hidden;
    }
    .members-card__header {
      padding: 16px 20px;
      border-bottom: 1px solid #eef1ef;
      font-size: 13px;
      font-weight: 700;
      color: #56635f;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }

    /* Skeleton */
    .member-row--skeleton { padding: 16px 20px; display: flex; align-items: center; gap: 14px; }
    .skel {
      background: linear-gradient(90deg, #eef1ef 25%, #f6f8f6 50%, #eef1ef 75%);
      background-size: 200% 100%;
      animation: shimmer 1.4s infinite;
      border-radius: 6px;
    }
    .skel--avatar { width: 36px; height: 36px; border-radius: 50%; flex-shrink: 0; }
    .skel-body { flex: 1; display: flex; flex-direction: column; gap: 6px; }
    .skel--name { height: 12px; width: 140px; }
    .skel--email { height: 10px; width: 200px; }
    .skel--badge { height: 22px; width: 80px; border-radius: 99px; }
    @keyframes shimmer { to { background-position: -200% 0; } }

    /* Empty */
    .members-empty {
      padding: 48px 20px;
      text-align: center;
      color: #84918d;
    }
    .members-empty__icon { font-size: 40px; color: #c4cec9; display: block; margin-bottom: 12px; }
    .members-empty p { margin: 4px 0; font-size: 14px; }
    .members-empty__sub { font-size: 12px; color: #a0ada9; }

    /* Member row */
    .member-row {
      display: flex;
      align-items: center;
      gap: 14px;
      padding: 14px 20px;
      border-bottom: 1px solid #eef1ef;
      transition: background 0.15s;
    }
    .member-row:last-child { border-bottom: none; }
    .member-row:hover { background: rgba(23,63,56,0.02); }
    .member-row--self { background: rgba(23,63,56,0.015); }

    .member-avatar {
      width: 36px; height: 36px;
      border-radius: 50%;
      background: #e8efeb;
      color: #173f38;
      font-size: 13px;
      font-weight: 700;
      display: grid;
      place-items: center;
      flex-shrink: 0;
      text-transform: uppercase;
      letter-spacing: 0.02em;
    }

    .member-info {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .member-name {
      font-size: 14px;
      font-weight: 600;
      color: #0d2925;
      display: flex;
      align-items: center;
      gap: 6px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .member-self-tag {
      padding: 2px 7px;
      border-radius: 99px;
      background: rgba(23,63,56,0.1);
      color: #173f38;
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .member-email {
      font-size: 12px;
      color: #84918d;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .member-badges {
      display: flex;
      align-items: center;
      gap: 6px;
      flex-shrink: 0;
    }

    .role-badge, .status-badge {
      padding: 3px 10px;
      border-radius: 99px;
      font-size: 11px;
      font-weight: 700;
      white-space: nowrap;
    }

    /* Role colours */
    .role-badge[data-role="CLINIC_OWNER"]    { background: rgba(200,100,69,0.12); color: #c86445; }
    .role-badge[data-role="ORTHODONTIST"]    { background: rgba(13,107,107,0.10); color: #0d6b6b; }
    .role-badge[data-role="DENTIST"]         { background: rgba(29,78,216,0.10);  color: #1d4ed8; }
    .role-badge[data-role="SECRETARY"]       { background: rgba(86,99,95,0.10);   color: #56635f; }
    .role-badge[data-role="ASSISTANT"]       { background: rgba(109,40,217,0.10); color: #6d28d9; }

    /* Status colours */
    .status-badge[data-status="ACTIVE"]    { background: rgba(30,70,32,0.10);  color: #1e4620; }
    .status-badge[data-status="INVITED"]   { background: rgba(146,64,14,0.10); color: #92400e; }
    .status-badge[data-status="SUSPENDED"] { background: rgba(180,83,9,0.10);  color: #b45309; }
    .status-badge[data-status="REMOVED"]   { background: rgba(107,114,128,0.10); color: #6b7280; }

    /* Member actions */
    .member-actions {
      display: flex;
      align-items: center;
      gap: 6px;
      flex-shrink: 0;
    }

    .role-selector-wrap {
      display: inline-flex;
      align-items: center;
      gap: 5px;
    }

    .member-role-select {
      padding: 5px 10px;
      border: 1.5px solid #dce2de;
      border-radius: 8px;
      background: #fff;
      color: #0d2925;
      font-size: 12px;
      font-weight: 600;
      font-family: inherit;
      cursor: pointer;
      outline: none;
      transition: all 0.18s ease;
    }
    .member-role-select:focus { border-color: #c86445; }
    .member-role-select:disabled { opacity: 0.5; cursor: not-allowed; }

    .member-role-select.has-pending-change {
      border-color: #059669;
      background: #f0fdf4;
      color: #065f46;
      box-shadow: 0 0 0 2px rgba(5, 150, 105, 0.2);
    }

    .btn-action {
      display: grid;
      place-items: center;
      width: 32px; height: 32px;
      border: none;
      border-radius: 8px;
      cursor: pointer;
      transition: background 0.15s, transform 0.12s, box-shadow 0.15s;
      color: #fff;
    }
    .btn-action:hover:not(:disabled) { transform: scale(1.08); }
    .btn-action:disabled { opacity: 0.4; cursor: not-allowed; }
    .btn-action .material-icons { font-size: 16px; }
    .btn-action--save   {
      background: #059669;
      box-shadow: 0 2px 8px rgba(5, 150, 105, 0.35);
      animation: popIn 0.18s cubic-bezier(0.16, 1, 0.3, 1);

      &:hover:not(:disabled) {
        background: #047857;
      }
    }
    .btn-action--cancel {
      background: #64748b;
      animation: popIn 0.18s cubic-bezier(0.16, 1, 0.3, 1);

      &:hover:not(:disabled) {
        background: #475569;
      }
    }
    .btn-action--warn   { background: #b45309; }
    .btn-action--ok     { background: #1e4620; }
    .btn-action--danger { background: #b91c1c; }

    .btn-spinner-sm {
      width: 14px;
      height: 14px;
      border: 2px solid rgba(255, 255, 255, 0.4);
      border-top-color: #ffffff;
      border-radius: 50%;
      animation: spin 0.7s linear infinite;
    }

    @keyframes popIn {
      0% { transform: scale(0.6); opacity: 0; }
      100% { transform: scale(1); opacity: 1; }
    }

    /* ── Confirm overlay ── */
    .confirm-overlay {
      position: fixed;
      inset: 0;
      background: rgba(13,41,37,0.45);
      backdrop-filter: blur(4px);
      display: grid;
      place-items: center;
      z-index: 9999;
      animation: fadeIn 0.15s ease;
    }
    @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }

    .confirm-dialog {
      background: #fffefb;
      border-radius: 16px;
      padding: 32px 28px;
      max-width: 380px;
      width: calc(100% - 32px);
      box-shadow: 0 24px 64px rgba(13,41,37,0.18);
      text-align: center;
      animation: slideUp 0.2s ease;
    }
    @keyframes slideUp { from { transform: translateY(16px); opacity: 0; } to { transform: none; opacity: 1; } }

    .confirm-dialog__icon { font-size: 36px; color: #b91c1c; margin-bottom: 12px; }
    .confirm-dialog__title { margin: 0 0 10px; font-size: 17px; font-weight: 800; color: #0d2925; }
    .confirm-dialog__body { margin: 0 0 24px; font-size: 14px; color: #56635f; line-height: 1.5; }

    .confirm-dialog__actions {
      display: flex;
      gap: 10px;
      justify-content: center;
    }

    .btn-ghost {
      padding: 10px 20px;
      border: 1.5px solid #dce2de;
      border-radius: 10px;
      background: transparent;
      color: #56635f;
      font-size: 14px;
      font-weight: 600;
      font-family: inherit;
      cursor: pointer;
      transition: border-color 0.15s;
    }
    .btn-ghost:hover { border-color: #a0ada9; }

    .btn-danger {
      padding: 10px 20px;
      border: none;
      border-radius: 10px;
      background: #b91c1c;
      color: #fff;
      font-size: 14px;
      font-weight: 700;
      font-family: inherit;
      cursor: pointer;
      transition: opacity 0.15s;
    }
    .btn-danger:hover:not(:disabled) { opacity: 0.85; }
    .btn-danger:disabled { opacity: 0.5; cursor: not-allowed; }
  `],
})
export class SettingsTeam implements OnInit {
  private readonly api = inject(MembershipApiService);
  private readonly auth = inject(AuthStore);

  protected readonly members = signal<MembershipDto[]>([]);
  protected readonly loading = signal(true);
  protected readonly submitting = signal(false);
  protected readonly needsAccount = signal(false);
  protected readonly inviteError = signal<string | null>(null);
  protected readonly successMsg = signal<string | null>(null);
  protected readonly updatingId = signal<string | null>(null);
  protected readonly pendingRemove = signal<ConfirmRemove | null>(null);
  protected readonly pendingRoles = signal<Record<string, MembershipRole>>({});

  protected readonly visibleMembers = computed(() =>
    this.members().filter((m) => m.status !== 'REMOVED'),
  );

  protected readonly assignableRoles: { value: MembershipRole; label: string }[] = [
    { value: 'SECRETARY', label: 'Secrétaire' },
    { value: 'ORTHODONTIST', label: 'Orthodontiste' },
    { value: 'DENTIST', label: 'Dentiste' },
    { value: 'ASSISTANT', label: 'Assistant(e)' },
    { value: 'CLINIC_OWNER', label: 'Propriétaire' },
  ];

  protected form: AddMemberBody & { firstName: string; lastName: string; password: string } = {
    email: '',
    role: 'SECRETARY',
    firstName: '',
    lastName: '',
    password: '',
  };

  ngOnInit(): void {
    this.loadMembers();
  }

  protected isSelf(m: MembershipDto): boolean {
    return m.userId === this.auth.user()?.id;
  }

  protected initials(m: MembershipDto): string {
    const u = m.user;
    if (!u) return '?';
    return (u.firstName[0] ?? '') + (u.lastName[0] ?? '');
  }

  protected displayName(m: MembershipDto): string {
    const u = m.user;
    return u ? `${u.firstName} ${u.lastName}` : m.userId;
  }

  protected roleLabel(role: MembershipRole): string {
    return ROLE_LABELS[role] ?? role;
  }

  protected statusLabel(status: MembershipStatus): string {
    const map: Record<MembershipStatus, string> = {
      ACTIVE: 'Actif',
      INVITED: 'Invité',
      SUSPENDED: 'Suspendu',
      REMOVED: 'Retiré',
    };
    return map[status] ?? status;
  }

  protected isPasswordValid(): boolean {
    const p = this.form.password;
    return p.length >= 10 && /[a-zA-Z]/.test(p) && /\d/.test(p);
  }

  protected submitInvite(): void {
    if (!this.form.email || this.submitting()) return;

    // Client-side guard when creating a new account
    if (this.needsAccount()) {
      if (!this.form.firstName.trim() || !this.form.lastName.trim()) {
        this.inviteError.set('Prénom et nom sont requis.');
        return;
      }
      if (!this.isPasswordValid()) {
        this.inviteError.set('Le mot de passe doit contenir au moins 10 caractères, une lettre et un chiffre.');
        return;
      }
    }

    this.submitting.set(true);
    this.inviteError.set(null);

    const clinicId = this.auth.activeClinicId()!;
    const body: AddMemberBody = { email: this.form.email, role: this.form.role };
    if (this.needsAccount()) {
      body.firstName = this.form.firstName.trim();
      body.lastName = this.form.lastName.trim();
      body.password = this.form.password;
    }

    this.api.addMember(clinicId, body).subscribe({
      next: (membership) => {
        this.submitting.set(false);
        this.needsAccount.set(false);
        this.members.update((list) => [membership, ...list]);
        const name = membership.user
          ? `${membership.user.firstName} ${membership.user.lastName}`
          : this.form.email;
        this.successMsg.set(`${name} a été ajouté(e) à l'équipe.`);
        this.form = { email: '', role: 'SECRETARY', firstName: '', lastName: '', password: '' };
        setTimeout(() => this.successMsg.set(null), 4000);
      },
      error: (err) => {
        this.submitting.set(false);
        const body = err?.error as { success: false; error?: { code?: string; message?: string } } | undefined;
        const code = body?.error?.code;

        if (code === 'USER_NOT_FOUND') {
          // Not a real error — backend is telling us the email has no account yet.
          // Reveal account creation fields, clear the error message.
          this.needsAccount.set(true);
          this.inviteError.set(null);
        } else {
          // Zod 422, conflict 409, etc.
          const msg = body?.error?.message ?? 'Une erreur est survenue. Veuillez réessayer.';
          this.inviteError.set(msg);
        }
      },
    });
  }

  protected getSelectedRole(m: MembershipDto): MembershipRole {
    return this.pendingRoles()[m.id] ?? m.role;
  }

  protected hasRoleChanged(m: MembershipDto): boolean {
    const selected = this.pendingRoles()[m.id];
    return selected !== undefined && selected !== m.role;
  }

  protected onRoleSelectChange(m: MembershipDto, newRole: MembershipRole): void {
    if (newRole === m.role) {
      this.cancelRoleChange(m.id);
    } else {
      this.pendingRoles.update((prev) => ({ ...prev, [m.id]: newRole }));
    }
  }

  protected cancelRoleChange(membershipId: string): void {
    this.pendingRoles.update((prev) => {
      const next = { ...prev };
      delete next[membershipId];
      return next;
    });
  }

  protected saveRoleChange(m: MembershipDto): void {
    const newRole = this.pendingRoles()[m.id];
    if (!newRole || newRole === m.role) return;

    this.updatingId.set(m.id);
    const clinicId = this.auth.activeClinicId()!;
    this.api.updateMember(clinicId, m.id, { role: newRole }).subscribe({
      next: (updated) => {
        this.updatingId.set(null);
        this.cancelRoleChange(m.id);
        this.members.update((list) => list.map((x) => (x.id === updated.id ? updated : x)));
      },
      error: () => this.updatingId.set(null),
    });
  }

  protected suspendMember(m: MembershipDto): void {
    this.setStatus(m, 'SUSPENDED');
  }

  protected reactivateMember(m: MembershipDto): void {
    this.setStatus(m, 'ACTIVE');
  }

  protected confirmRemove(data: ConfirmRemove): void {
    this.pendingRemove.set(data);
  }

  protected cancelRemove(): void {
    this.pendingRemove.set(null);
  }

  protected executeRemove(): void {
    const target = this.pendingRemove();
    if (!target) return;
    this.updatingId.set(target.membershipId);
    const clinicId = this.auth.activeClinicId()!;
    this.api.removeMember(clinicId, target.membershipId).subscribe({
      next: (updated) => {
        this.updatingId.set(null);
        this.pendingRemove.set(null);
        this.members.update((list) => list.map((x) => (x.id === updated.id ? updated : x)));
      },
      error: () => {
        this.updatingId.set(null);
        this.pendingRemove.set(null);
      },
    });
  }

  private setStatus(m: MembershipDto, status: MembershipStatus): void {
    this.updatingId.set(m.id);
    const clinicId = this.auth.activeClinicId()!;
    this.api.updateMember(clinicId, m.id, { status }).subscribe({
      next: (updated) => {
        this.updatingId.set(null);
        this.members.update((list) => list.map((x) => (x.id === updated.id ? updated : x)));
      },
      error: () => this.updatingId.set(null),
    });
  }

  private loadMembers(): void {
    const clinicId = this.auth.activeClinicId();
    if (!clinicId) { this.loading.set(false); return; }
    this.api.list(clinicId).subscribe({
      next: (items) => {
        this.members.set(items);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }
}
