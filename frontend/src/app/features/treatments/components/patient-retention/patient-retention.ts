import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, effect, inject, input, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { getApiProblem } from '../../../../core/http/api-error';
import { RetentionApiService } from '../../data-access/retention-api.service';
import type { RetainerArch, RetainerInput, RetainerType, RetentionPlan } from '../../models/retention.models';

@Component({
  selector: 'app-patient-retention',
  imports: [DatePipe, ReactiveFormsModule],
  templateUrl: './patient-retention.html',
  styleUrl: './patient-retention.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PatientRetention {
  private readonly api = inject(RetentionApiService);
  readonly treatmentId = input.required<string>();
  readonly canManage = input(false);
  protected readonly plan = signal<RetentionPlan | null>(null);
  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly showPlanForm = signal(false);
  protected readonly deviceFormOpen = signal(false);
  protected readonly replacingId = signal<string | null>(null);
  protected readonly planForm = new FormGroup({
    initialControlRecommendedAt: new FormControl('', { nonNullable: true }),
    notes: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(2000)] }),
  });
  protected readonly deviceForm = new FormGroup({
    type: new FormControl<RetainerType>('CLEAR_RETAINER', { nonNullable: true }),
    customTypeLabel: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(80)] }),
    arch: new FormControl<RetainerArch>('BOTH', { nonNullable: true }),
    deliveredAt: new FormControl(this.today(), { nonNullable: true, validators: [Validators.required] }),
    notes: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(1000)] }),
  });

  constructor() {
    effect(() => void this.load(this.treatmentId()));
  }

  protected async load(treatmentId = this.treatmentId()): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      this.plan.set(await firstValueFrom(this.api.getByTreatment(treatmentId)));
    } catch (error) {
      this.error.set(getApiProblem(error).message);
    } finally {
      this.loading.set(false);
    }
  }

  protected async createPlan(): Promise<void> {
    if (this.planForm.invalid) return;
    const value = this.planForm.getRawValue();
    await this.mutate(() =>
      firstValueFrom(
        this.api.create(this.treatmentId(), {
          initialControlRecommendedAt: value.initialControlRecommendedAt
            ? new Date(`${value.initialControlRecommendedAt}T12:00:00`).toISOString()
            : null,
          notes: value.notes.trim() || null,
        }),
      ),
    );
    this.showPlanForm.set(false);
  }

  protected openDevice(replacingId: string | null = null): void {
    this.replacingId.set(replacingId);
    this.deviceForm.reset({
      type: 'CLEAR_RETAINER',
      customTypeLabel: '',
      arch: 'BOTH',
      deliveredAt: this.today(),
      notes: '',
    });
    this.deviceFormOpen.set(true);
  }

  protected async saveDevice(): Promise<void> {
    const plan = this.plan();
    const value = this.deviceForm.getRawValue();
    if (!plan || this.deviceForm.invalid) return;
    if (value.type === 'OTHER' && !value.customTypeLabel.trim()) {
      this.deviceForm.controls.customTypeLabel.setErrors({ required: true });
      return;
    }
    const input: RetainerInput = {
      type: value.type,
      customTypeLabel: value.type === 'OTHER' ? value.customTypeLabel.trim() : null,
      arch: value.arch,
      deliveredAt: new Date(`${value.deliveredAt}T12:00:00`).toISOString(),
      notes: value.notes.trim() || null,
    };
    const replacingId = this.replacingId();
    await this.mutate(() =>
      firstValueFrom(
        replacingId
          ? this.api.replace(plan.id, replacingId, input)
          : this.api.deliver(plan.id, input),
      ),
    );
    this.deviceFormOpen.set(false);
  }

  protected markLost(retainerId: string): void {
    const plan = this.plan();
    if (plan) void this.mutate(() => firstValueFrom(this.api.markLost(plan.id, retainerId)));
  }

  protected discontinue(retainerId: string): void {
    const plan = this.plan();
    if (plan) void this.mutate(() => firstValueFrom(this.api.discontinue(plan.id, retainerId)));
  }

  protected complete(): void {
    const plan = this.plan();
    if (plan) void this.mutate(() => firstValueFrom(this.api.complete(plan.id)));
  }

  private async mutate(request: () => Promise<RetentionPlan>): Promise<void> {
    this.saving.set(true);
    this.error.set(null);
    try {
      this.plan.set(await request());
    } catch (error) {
      this.error.set(getApiProblem(error).message);
    } finally {
      this.saving.set(false);
    }
  }

  private today(): string {
    return new Date().toISOString().slice(0, 10);
  }
}
