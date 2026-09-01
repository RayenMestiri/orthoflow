import { A11yModule } from '@angular/cdk/a11y';
import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnDestroy,
  signal,
} from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { PermissionService, PERMISSIONS } from '../../../../core/auth/permissions';
import { getApiProblem } from '../../../../core/http/api-error';
import { ActivePatientService } from '../../data-access/active-patient.service';
import { PatientCashRecords } from '../../../cash-records/components/patient-cash-records/patient-cash-records';
import { FollowUpsApiService } from '../../../follow-ups/data-access/follow-ups-api.service';
import type { FollowUpRow } from '../../../follow-ups/models/follow-up.models';
import { PatientClinicalVisits } from '../../../clinical-visits/components/patient-clinical-visits/patient-clinical-visits';
import { PatientMediaWorkspace } from '../../../patient-media/components/patient-media-workspace/patient-media-workspace';
import {
  PATIENT_MEDIA_CATEGORIES,
  type PatientMediaCategory,
  type TreatmentMediaOption,
} from '../../../patient-media/models/patient-media.models';
import { PatientTreatments } from '../../../treatments/components/patient-treatments/patient-treatments';
import { TreatmentsApiService } from '../../../treatments/data-access/treatments-api.service';
import { treatmentTypeLabel } from '../../../treatments/models/treatment.models';
import { PatientActivityTimeline } from '../../components/patient-activity/patient-activity';
import { CreateTaskDrawerComponent } from '../../../tasks/components/create-task-drawer/create-task-drawer.component';
import { PatientConsents } from '../../../consents/components/patient-consents/patient-consents';
import { PatientGeneratedDocuments } from '../../../generated-documents/components/patient-generated-documents/patient-generated-documents';
import { PatientCommunications } from '../../../communications/components/patient-communications/patient-communications';
import { TasksStore } from '../../../tasks/data-access/tasks.store';
import { PatientsApiService } from '../../data-access/patients-api.service';
import type {
  ContactPreference,
  Guardian,
  GuardianChild,
  GuardianInput,
  GuardianRelationship,
  GuardianSearchResult,
  PortalAccessStatus,
  Patient,
  PatientActivityTargetType,
} from '../../models/patient.models';

@Component({
  selector: 'app-patient-detail-page',
  imports: [
    A11yModule,
    DatePipe,
    PatientCashRecords,
    PatientClinicalVisits,
    PatientMediaWorkspace,
    PatientTreatments,
    PatientActivityTimeline,
    CreateTaskDrawerComponent,
    PatientConsents,
    PatientGeneratedDocuments,
    PatientCommunications,
    ReactiveFormsModule,
    RouterLink,
  ],
  templateUrl: './patient-detail-page.html',
  styleUrl: './patient-detail-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PatientDetailPage implements OnDestroy {
  private readonly api = inject(PatientsApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly permissions = inject(PermissionService);
  private readonly treatmentsApi = inject(TreatmentsApiService);
  private readonly followUpsApi = inject(FollowUpsApiService);
  private readonly activePatientService = inject(ActivePatientService);
  readonly tasksStore = inject(TasksStore);
  readonly patientId = this.route.snapshot.paramMap.get('patientId') ?? '';
  readonly patient = signal<Patient | null>(null);
  readonly guardians = signal<Guardian[]>([]);
  readonly nextFollowUp = signal<FollowUpRow | null>(null);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly notice = signal<string | null>(
    this.route.snapshot.queryParamMap.get('guardianWarning')
      ? 'The patient was saved, but the guardian could not be attached. Add them below.'
      : this.route.snapshot.queryParamMap.get('saved')
        ? 'Patient information saved.'
        : null,
  );
  readonly selectedTreatmentId = signal<string | null>(
    this.route.snapshot.queryParamMap.get('treatmentId'),
  );
  readonly selectedTreatmentLabel = signal<string | null>(
    this.route.snapshot.queryParamMap.get('treatmentLabel'),
  );
  readonly selectedRecordId = signal<string | null>(
    this.route.snapshot.queryParamMap.get('recordId') ??
      this.route.snapshot.queryParamMap.get('cashRecordId'),
  );
  readonly selectedReceiptNumber = signal<string | null>(
    this.route.snapshot.queryParamMap.get('receiptNumber'),
  );
  readonly selectedReceiptId = signal<string | null>(
    this.route.snapshot.queryParamMap.get('receiptId'),
  );
  readonly activeView = signal<
    'overview' | 'activity' | 'communications' | 'treatments' | 'visits' | 'payments' | 'media' | 'consents'
  >(
    (this.route.snapshot.queryParamMap.get('tab') as
      | 'overview'
      | 'activity'
      | 'communications'
      | 'treatments'
      | 'visits'
      | 'payments'
      | 'media'
      | 'consents'
      | null) ?? 'overview',
  );

  readonly mediaTreatmentOptions = signal<TreatmentMediaOption[]>([]);
  private readonly mediaTreatmentsLoaded = signal(false);
  readonly guardianPanelOpen = signal(false);
  readonly editingGuardian = signal<Guardian | null>(null);
  readonly guardianSaving = signal(false);
  readonly guardianError = signal<string | null>(null);
  readonly archiveOpen = signal(false);
  readonly archiving = signal(false);
  readonly canUpdate = this.permissions.can(PERMISSIONS.PATIENTS_UPDATE);
  readonly canArchive = this.permissions.can(PERMISSIONS.PATIENTS_ARCHIVE);
  /** The front desk sees the patient file but not the clinical treatment area. */
  readonly canViewTreatments = this.permissions.can(PERMISSIONS.TREATMENTS_VIEW);
  readonly canManageTreatments = this.permissions.can(PERMISSIONS.TREATMENTS_MANAGE);
  readonly canViewClinicalVisits = this.permissions.can(PERMISSIONS.CLINICAL_VISITS_VIEW);
  readonly canViewFollowUps = this.permissions.can(PERMISSIONS.FOLLOWUPS_VIEW);
  /** Assistants follow the chair, not the till. */
  readonly canViewPayments = this.permissions.can(PERMISSIONS.CASH_RECORDS_VIEW);
  readonly canViewMedia = this.permissions.can(PERMISSIONS.PATIENT_MEDIA_VIEW);
  readonly canViewGeneratedDocuments = this.permissions.can(PERMISSIONS.GENERATED_DOCUMENTS_VIEW);
  readonly canGenerateDocuments =
    this.permissions.can(PERMISSIONS.GENERATED_DOCUMENTS_GENERATE_ADMIN) ||
    this.permissions.can(PERMISSIONS.GENERATED_DOCUMENTS_GENERATE_CLINICAL) ||
    this.permissions.can(PERMISSIONS.GENERATED_DOCUMENTS_GENERATE_FINANCIAL);
  readonly canVoidDocuments = this.permissions.can(PERMISSIONS.GENERATED_DOCUMENTS_VOID);
  readonly canManageMedia = this.permissions.can(PERMISSIONS.PATIENT_MEDIA_MANAGE_ADMIN);
  readonly canViewConsents = this.permissions.can(PERMISSIONS.CONSENTS_VIEW);
  readonly canCaptureConsents = this.permissions.can(PERMISSIONS.CONSENTS_CAPTURE);
  readonly canRevokeConsents = this.permissions.can(PERMISSIONS.CONSENTS_REVOKE);
  readonly canVoidConsents = this.permissions.can(PERMISSIONS.CONSENTS_VOID);
  readonly canManagePortalAccess = this.permissions.can(PERMISSIONS.PORTAL_ACCESS_MANAGE);
  readonly canViewCommunications = this.permissions.can(PERMISSIONS.COMMUNICATIONS_VIEW);
  readonly manageableMediaCategories: readonly PatientMediaCategory[] = this.permissions.can(
    PERMISSIONS.PATIENT_MEDIA_MANAGE_CLINICAL,
  )
    ? PATIENT_MEDIA_CATEGORIES
    : ['ADMINISTRATIVE'];
  readonly isMinor = computed(() => {
    const patient = this.patient();
    if (!patient) return false;
    if (patient.age !== null && patient.age !== undefined) return patient.age < 18;
    if (patient.birthDate) {
      const birth = new Date(patient.birthDate);
      const now = new Date();
      const ageDiff = now.getFullYear() - birth.getFullYear();
      return ageDiff < 18;
    }
    return false;
  });

  readonly guardianDrawerView = signal<'VIEW' | 'CREATE' | 'EDIT'>('VIEW');
  readonly viewingGuardian = signal<Guardian | null>(null);
  readonly guardianChildren = signal<GuardianChild[]>([]);
  readonly guardianChildrenLoading = signal(false);
  readonly unlinkConfirmOpen = signal(false);
  readonly unlinkTargetGuardian = signal<Guardian | null>(null);
  readonly unlinking = signal(false);
  readonly makingPrimary = signal(false);
  readonly portalAccess = signal<PortalAccessStatus | null>(null);
  readonly portalAccessLoading = signal(false);
  readonly portalAccessBusy = signal(false);

  readonly addMode = signal<'NEW' | 'EXISTING'>('NEW');
  readonly guardianSearchQuery = signal('');
  readonly guardianSearchResults = signal<GuardianSearchResult[]>([]);
  readonly guardianSearching = signal(false);
  readonly selectedExistingGuardian = signal<GuardianSearchResult | null>(null);
  readonly existingRelationship = signal<GuardianRelationship>('MOTHER');
  readonly existingIsPrimary = signal(false);
  readonly existingFinanciallyResponsible = signal(false);
  readonly existingCommunicationAuthorized = signal(false);
  readonly existingContactPreference = signal<ContactPreference>('NO_PREFERENCE');
  readonly existingLinking = signal(false);

  /** Guardians the payment drawer may offer as the payer. */
  readonly cashRecordGuardians = computed(() =>
    this.guardians().map((guardian) => ({
      id: guardian.id,
      fullName: guardian.fullName,
      relationship: guardian.relationship,
      isPrimary: guardian.isPrimary,
    })),
  );
  readonly primaryGuardian = computed(
    () => this.guardians().find((guardian) => guardian.isPrimary) ?? null,
  );

  readonly guardianForm = new FormGroup({
    firstName: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(80)],
    }),
    lastName: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(80)],
    }),
    relationship: new FormControl<GuardianRelationship>('MOTHER', { nonNullable: true }),
    phone: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(32)] }),
    email: new FormControl('', {
      nonNullable: true,
      validators: [Validators.email, Validators.maxLength(254)],
    }),
    isPrimary: new FormControl(false, { nonNullable: true }),
    financiallyResponsible: new FormControl(false, { nonNullable: true }),
    contactPreference: new FormControl<ContactPreference>('NO_PREFERENCE', { nonNullable: true }),
    communicationAuthorized: new FormControl(false, { nonNullable: true }),
  });

  constructor() {
    void this.load();
    this.route.queryParamMap?.subscribe((params) => {
      const tab = params.get('tab');
      if (
        tab &&
        ['overview', 'activity', 'communications', 'treatments', 'visits', 'payments', 'media', 'consents'].includes(
          tab,
        )
      ) {
        this.activeView.set(
          tab as
            | 'overview'
            | 'activity'
            | 'communications'
            | 'treatments'
            | 'visits'
            | 'payments'
            | 'media'
            | 'consents',
        );
        this.activePatientService.setActiveTab(tab);
      }
      this.selectedTreatmentId.set(params.get('treatmentId'));
      this.selectedTreatmentLabel.set(params.get('treatmentLabel'));
      this.selectedRecordId.set(params.get('recordId') ?? params.get('cashRecordId'));
      this.selectedReceiptNumber.set(params.get('receiptNumber'));
      this.selectedReceiptId.set(params.get('receiptId'));
    });
  }

  selectTab(
    tab:
      | 'overview'
      | 'activity'
      | 'communications'
      | 'treatments'
      | 'visits'
      | 'payments'
      | 'media'
      | 'consents',
  ): void {
    this.activeView.set(tab);
    this.activePatientService.setActiveTab(tab);
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { tab },
      queryParamsHandling: 'merge',
    });
  }

  ngOnDestroy(): void {
    this.activePatientService.clear();
  }

  formatBirthDate(value: string | null): string {
    if (!value) return '—';
    const [year, month, day] = value.split('-').map(Number);
    if (!year || !month || !day) return '—';
    return new Intl.DateTimeFormat('fr-FR', {
      dateStyle: 'long',
      timeZone: 'UTC',
    }).format(new Date(Date.UTC(year, month - 1, day)));
  }

  formatAddress(patient: Patient): string {
    return [patient.address.line1, patient.address.city].filter(Boolean).join(', ') || '—';
  }

  formatEnumLabel(value: string): string {
    const normalized = value.toLowerCase().replaceAll('_', ' ');
    return normalized.charAt(0).toUpperCase() + normalized.slice(1);
  }

  relationshipLabel(value: string): string {
    switch (value) {
      case 'FATHER':
        return 'Père';
      case 'MOTHER':
        return 'Mère';
      case 'LEGAL_GUARDIAN':
        return 'Responsable légal';
      case 'OTHER':
        return 'Autre';
      default:
        return value.toLowerCase().replaceAll('_', ' ');
    }
  }

  contactPreferenceLabel(value: string): string {
    switch (value) {
      case 'PHONE':
        return 'Appel / SMS';
      case 'EMAIL':
        return 'Email';
      case 'NO_PREFERENCE':
        return 'Sans préférence';
      default:
        return value;
    }
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const [patient, guardians] = await Promise.all([
        firstValueFrom(this.api.get(this.patientId)),
        firstValueFrom(this.api.listGuardians(this.patientId)),
      ]);
      this.patient.set(patient);
      this.guardians.set(guardians);
      this.activePatientService.setPatient({
        id: this.patientId,
        fullName: `${patient.firstName} ${patient.lastName}`,
        activeTab: this.activeView(),
      });
      if (this.canViewFollowUps) {
        try {
          const followUps = await firstValueFrom(
            this.followUpsApi.list({
              page: 1,
              limit: 1,
              filter: 'ALL',
              sort: 'MOST_OVERDUE',
              patientId: this.patientId,
            }),
          );
          this.nextFollowUp.set(followUps.rows[0] ?? null);
        } catch {
          this.nextFollowUp.set(null);
        }
      }
    } catch (error) {
      this.error.set(getApiProblem(error).message);
    } finally {
      this.loading.set(false);
    }
  }

  async openMedia(): Promise<void> {
    this.activeView.set('media');
    if (this.mediaTreatmentsLoaded()) return;
    this.mediaTreatmentsLoaded.set(true);
    try {
      const treatments = await firstValueFrom(this.treatmentsApi.listForPatient(this.patientId));
      this.mediaTreatmentOptions.set(
        treatments.map((treatment) => ({
          id: treatment.id,
          label: treatmentTypeLabel(treatment.type, treatment.customTypeLabel),
          status: this.formatEnumLabel(treatment.status),
        })),
      );
    } catch {
      this.mediaTreatmentOptions.set([]);
    }
  }

  openGuardianView(guardian: Guardian): void {
    this.viewingGuardian.set(guardian);
    this.guardianDrawerView.set('VIEW');
    this.guardianError.set(null);
    this.guardianPanelOpen.set(true);
    void this.loadGuardianChildren(guardian.id);
    if (this.canManagePortalAccess) void this.loadPortalAccess(guardian.id);
  }

  openAddGuardian(): void {
    this.editingGuardian.set(null);
    this.viewingGuardian.set(null);
    this.guardianDrawerView.set('CREATE');
    this.addMode.set('NEW');
    this.selectedExistingGuardian.set(null);
    this.guardianSearchQuery.set('');
    this.guardianSearchResults.set([]);
    this.existingRelationship.set('MOTHER');
    this.existingIsPrimary.set(this.guardians().length === 0);
    this.existingFinanciallyResponsible.set(false);
    this.existingCommunicationAuthorized.set(false);
    this.existingContactPreference.set('NO_PREFERENCE');
    this.guardianError.set(null);
    this.guardianForm.reset({
      firstName: '',
      lastName: '',
      relationship: 'MOTHER',
      phone: '',
      email: '',
      isPrimary: this.guardians().length === 0,
      financiallyResponsible: false,
      contactPreference: 'NO_PREFERENCE',
      communicationAuthorized: false,
    });
    this.guardianPanelOpen.set(true);
  }

  switchToEditGuardian(guardian: Guardian): void {
    this.editingGuardian.set(guardian);
    this.viewingGuardian.set(guardian);
    this.guardianDrawerView.set('EDIT');
    this.guardianError.set(null);
    this.guardianForm.reset({
      firstName: guardian.firstName,
      lastName: guardian.lastName,
      relationship: guardian.relationship,
      phone: guardian.phone ?? '',
      email: guardian.email ?? '',
      isPrimary: guardian.isPrimary,
      financiallyResponsible: guardian.financiallyResponsible,
      contactPreference: guardian.contactPreference,
      communicationAuthorized: guardian.communicationAuthorized ?? false,
    });
  }

  switchBackToView(): void {
    if (this.viewingGuardian()) {
      this.guardianDrawerView.set('VIEW');
    } else {
      this.closeGuardian();
    }
  }

  closeGuardian(): void {
    if (
      !this.guardianSaving() &&
      !this.unlinking() &&
      !this.makingPrimary() &&
      !this.existingLinking()
    ) {
      this.guardianPanelOpen.set(false);
      this.viewingGuardian.set(null);
      this.editingGuardian.set(null);
      this.guardianChildren.set([]);
      this.portalAccess.set(null);
    }
  }

  async loadPortalAccess(guardianId: string): Promise<void> {
    this.portalAccessLoading.set(true);
    try {
      this.portalAccess.set(await firstValueFrom(this.api.portalAccessStatus(guardianId)));
    } catch {
      this.portalAccess.set(null);
    } finally {
      this.portalAccessLoading.set(false);
    }
  }

  async invitePortal(guardian: Guardian): Promise<void> {
    this.portalAccessBusy.set(true);
    this.guardianError.set(null);
    try {
      const result = await firstValueFrom(this.api.invitePortalAccess(guardian.id));
      await this.loadPortalAccess(guardian.id);
      this.notice.set(
        result.delivery === 'QUEUED'
          ? `Invitation portail mise en file d’envoi pour ${guardian.email}.`
          : 'Invitation portail créée.',
      );
    } catch (error) {
      this.guardianError.set(getApiProblem(error).message);
    } finally {
      this.portalAccessBusy.set(false);
    }
  }

  async revokePortal(guardian: Guardian): Promise<void> {
    this.portalAccessBusy.set(true);
    this.guardianError.set(null);
    try {
      await firstValueFrom(
        this.api.revokePortalAccess(guardian.id, 'Access revoked by clinic owner'),
      );
      await this.loadPortalAccess(guardian.id);
      this.notice.set(`Accès portail révoqué pour ${guardian.fullName}.`);
    } catch (error) {
      this.guardianError.set(getApiProblem(error).message);
    } finally {
      this.portalAccessBusy.set(false);
    }
  }

  async loadGuardianChildren(guardianId: string): Promise<void> {
    this.guardianChildrenLoading.set(true);
    try {
      const children = await firstValueFrom(
        this.api.getGuardianChildren(this.patientId, guardianId),
      );
      this.guardianChildren.set(children.filter((c) => c.patientId !== this.patientId));
    } catch {
      this.guardianChildren.set([]);
    } finally {
      this.guardianChildrenLoading.set(false);
    }
  }

  async makePrimary(guardian: Guardian): Promise<void> {
    this.makingPrimary.set(true);
    this.guardianError.set(null);
    try {
      const updated = await firstValueFrom(
        this.api.makePrimaryGuardian(this.patientId, guardian.id),
      );
      this.guardians.update((items) =>
        items.map((item) => ({ ...item, isPrimary: item.id === updated.id })),
      );
      this.viewingGuardian.set(updated);
      this.notice.set(`${updated.fullName} est désormais le contact principal.`);
    } catch (error) {
      this.guardianError.set(getApiProblem(error).message);
    } finally {
      this.makingPrimary.set(false);
    }
  }

  promptUnlinkGuardian(guardian: Guardian): void {
    this.unlinkTargetGuardian.set(guardian);
    this.unlinkConfirmOpen.set(true);
  }

  async confirmUnlink(): Promise<void> {
    const target = this.unlinkTargetGuardian();
    if (!target) return;
    this.unlinking.set(true);
    try {
      await firstValueFrom(this.api.unlinkGuardian(this.patientId, target.id));
      this.guardians.update((items) => items.filter((item) => item.id !== target.id));
      this.unlinkConfirmOpen.set(false);
      this.unlinkTargetGuardian.set(null);
      this.closeGuardian();
      this.notice.set(`${target.fullName} a été dissocié(e) de ce dossier.`);
    } catch (error) {
      this.guardianError.set(getApiProblem(error).message);
    } finally {
      this.unlinking.set(false);
    }
  }

  async onSearchGuardians(query: string): Promise<void> {
    this.guardianSearchQuery.set(query);
    if (!query.trim()) {
      this.guardianSearchResults.set([]);
      return;
    }
    this.guardianSearching.set(true);
    try {
      const results = await firstValueFrom(this.api.searchGuardians(query));
      // Filter out guardians already linked to this patient
      const linkedIds = new Set(this.guardians().map((g) => g.id));
      this.guardianSearchResults.set(results.filter((r) => !linkedIds.has(r.id)));
    } catch {
      this.guardianSearchResults.set([]);
    } finally {
      this.guardianSearching.set(false);
    }
  }

  selectExistingGuardian(guardian: GuardianSearchResult): void {
    this.selectedExistingGuardian.set(guardian);
  }

  async linkExistingGuardianSubmit(): Promise<void> {
    const selected = this.selectedExistingGuardian();
    if (!selected) return;
    this.existingLinking.set(true);
    this.guardianError.set(null);
    try {
      const linked = await firstValueFrom(
        this.api.linkExistingGuardian(this.patientId, {
          guardianId: selected.id,
          relationship: this.existingRelationship(),
          isPrimary: this.existingIsPrimary(),
      financiallyResponsible: this.existingFinanciallyResponsible(),
      communicationAuthorized: this.existingCommunicationAuthorized(),
          contactPreference: this.existingContactPreference(),
        }),
      );
      this.guardians.update((items) => {
        const normalized = linked.isPrimary
          ? items.map((item) => ({ ...item, isPrimary: false }))
          : items;
        return [...normalized, linked];
      });
      this.closeGuardian();
      this.notice.set(`${linked.fullName} a été associé(e) comme responsable.`);
    } catch (error) {
      this.guardianError.set(getApiProblem(error).message);
    } finally {
      this.existingLinking.set(false);
    }
  }

  async saveGuardian(): Promise<void> {
    if (this.guardianForm.invalid) {
      this.guardianForm.markAllAsTouched();
      return;
    }
    this.guardianSaving.set(true);
    this.guardianError.set(null);
    try {
      const editing = this.editingGuardian();
      const saved = editing
        ? await firstValueFrom(
            this.api.updateGuardian(this.patientId, editing.id, this.guardianPayload()),
          )
        : await firstValueFrom(this.api.createGuardian(this.patientId, this.guardianPayload()));
      this.guardians.update((items) => {
        const normalized = saved.isPrimary
          ? items.map((item) => ({ ...item, isPrimary: false }))
          : items;
        return editing
          ? normalized.map((item) => (item.id === saved.id ? saved : item))
          : [...normalized, saved];
      });
      this.viewingGuardian.set(saved);
      this.guardianDrawerView.set('VIEW');
      this.notice.set(
        editing ? 'Informations du responsable mises à jour.' : 'Responsable ajouté au patient.',
      );
    } catch (error) {
      this.guardianError.set(getApiProblem(error).message);
    } finally {
      this.guardianSaving.set(false);
    }
  }

  async archive(): Promise<void> {
    this.archiving.set(true);
    try {
      this.patient.set(await firstValueFrom(this.api.archive(this.patientId)));
      this.archiveOpen.set(false);
      this.notice.set("Patient archivé. Le dossier reste accessible dans les filtres d'archives.");
    } catch (error) {
      this.error.set(getApiProblem(error).message);
      this.archiveOpen.set(false);
    } finally {
      this.archiving.set(false);
    }
  }

  initials(firstName: string, lastName: string): string {
    return `${firstName[0] ?? ''}${lastName[0] ?? ''}`.toUpperCase();
  }

  openActivityTarget(target: PatientActivityTargetType): void {
    if (target === 'CLINICAL_VISIT' && this.canViewClinicalVisits) this.activeView.set('visits');
    if (target === 'TREATMENT' && this.canViewTreatments) this.activeView.set('treatments');
    if (target === 'CASH_RECORD' && this.canViewPayments) this.activeView.set('payments');
    if (target === 'MEDIA' && this.canViewMedia) void this.openMedia();
    if (target === 'CONSENT' && this.canViewConsents) this.activeView.set('consents');
    if (target === 'GENERATED_DOCUMENT' && this.canViewGeneratedDocuments) this.openMedia();
  }

  onActivityItemSelected(
    event: import('../../components/patient-activity/patient-activity').ActivityNavigationEvent,
  ): void {
    if (event.targetType === 'CLINICAL_VISIT' && this.canViewClinicalVisits) {
      this.activeView.set('visits');
    } else if (event.targetType === 'CASH_RECORD' && this.canViewPayments) {
      if (event.activity.cashRecordId) {
        this.selectedRecordId.set(event.activity.cashRecordId);
      }
      if (event.activity.receiptNumber) {
        this.selectedReceiptNumber.set(event.activity.receiptNumber);
      }
      if (event.activity.receiptId) {
        this.selectedReceiptId.set(event.activity.receiptId);
      }
      this.activeView.set('payments');
    } else if (event.targetType === 'MEDIA' && this.canViewMedia) {
      void this.openMedia();
    } else if (event.targetType === 'TREATMENT' && this.canViewTreatments) {
      if (event.activity.treatment?.id) {
        this.selectedTreatmentId.set(event.activity.treatment.id);
        this.selectedTreatmentLabel.set(event.activity.treatment.label);
      }
      this.activeView.set('treatments');
    } else if (event.targetType === 'CONSENT' && this.canViewConsents) {
      this.activeView.set('consents');
    } else if (event.targetType === 'GENERATED_DOCUMENT' && this.canViewGeneratedDocuments) {
      this.openMedia();
    }
  }

  private guardianPayload(): GuardianInput {
    const value = this.guardianForm.getRawValue();
    const clean = (entry: string): string | null => entry.trim() || null;
    return {
      firstName: value.firstName.trim(),
      lastName: value.lastName.trim(),
      relationship: value.relationship,
      phone: clean(value.phone),
      email: clean(value.email),
      isPrimary: value.isPrimary,
      financiallyResponsible: value.financiallyResponsible,
      contactPreference: value.contactPreference,
      communicationAuthorized: value.communicationAuthorized,
    };
  }

  openCreateTaskForPatient(): void {
    const p = this.patient();
    if (!p) return;
    this.tasksStore.openCreateDrawer({
      context: {
        type: 'PATIENT',
        entityId: p.id,
        patientId: p.id,
        labelSnapshot: `${p.firstName} ${p.lastName}`.trim(),
      },
    });
  }
}
