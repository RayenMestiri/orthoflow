import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { CommunicationsApiService } from '../../../communications/data-access/communications-api.service';
import type { ProviderStatus } from '../../../communications/models/communication.models';
import { ClinicSettingsStore } from '../../data-access/clinic-settings.store';
import {
  COMMUNICATION_CHANNELS,
  type ClinicCommunicationSettings,
  type CommunicationChannel,
} from '../../models/clinic-settings.models';

@Component({
  selector: 'app-settings-communications',
  imports: [ReactiveFormsModule],
  templateUrl: './settings-communications.html',
  styleUrls: ['../../pages/settings-page/settings-section.scss', './settings-communications.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsCommunications {
  readonly settings = input.required<ClinicCommunicationSettings>();
  readonly canEdit = input(false);
  protected readonly store = inject(ClinicSettingsStore);
  private readonly api = inject(CommunicationsApiService);
  private readonly formBuilder = inject(NonNullableFormBuilder);
  protected readonly providerStatus = signal<ProviderStatus>({
    EMAIL: false,
    SMS: false,
    WHATSAPP: false,
  });
  protected readonly channels = COMMUNICATION_CHANNELS;

  protected readonly form = this.formBuilder.group({
    appointmentRemindersEnabled: true,
    reminderLeadMinutes: [1440, [Validators.required, Validators.min(30), Validators.max(10080)]],
    appointmentConfirmationsEnabled: true,
    appointmentCancellationNoticesEnabled: true,
    receiptNoticesEnabled: true,
    consentConfirmationsEnabled: true,
    documentShareNoticesEnabled: true,
    defaultPhoneRegion: [''],
  });
  protected readonly selectedChannels = signal<CommunicationChannel[]>(['EMAIL']);
  private readonly formValue = toSignal(this.form.valueChanges, { initialValue: null });
  protected readonly isSaving = computed(() => this.store.savingSection() === 'communications');
  protected readonly justSaved = computed(() => this.store.savedSection() === 'communications');
  protected readonly isDirty = computed(() => {
    this.formValue();
    const value = this.form.getRawValue();
    const current = this.settings();
    return (
      JSON.stringify({
        ...value,
        defaultPhoneRegion: value.defaultPhoneRegion || null,
        channelPriority: this.selectedChannels(),
      }) !==
      JSON.stringify({
        appointmentRemindersEnabled: current.appointmentRemindersEnabled,
        reminderLeadMinutes: current.reminderLeadMinutes,
        appointmentConfirmationsEnabled: current.appointmentConfirmationsEnabled,
        appointmentCancellationNoticesEnabled: current.appointmentCancellationNoticesEnabled,
        receiptNoticesEnabled: current.receiptNoticesEnabled,
        consentConfirmationsEnabled: current.consentConfirmationsEnabled,
        documentShareNoticesEnabled: current.documentShareNoticesEnabled,
        defaultPhoneRegion: current.defaultPhoneRegion,
        channelPriority: current.channelPriority,
      })
    );
  });

  constructor() {
    effect(() => this.reset());
    void firstValueFrom(this.api.providerStatus()).then((status) =>
      this.providerStatus.set(status),
    );
  }

  reset(): void {
    const current = this.settings();
    this.selectedChannels.set([...current.channelPriority]);
    this.form.reset({ ...current, defaultPhoneRegion: current.defaultPhoneRegion ?? '' });
    if (!this.canEdit()) this.form.disable({ emitEvent: false });
  }

  toggle(
    name: keyof Omit<
      ClinicCommunicationSettings,
      'reminderLeadMinutes' | 'channelPriority' | 'defaultPhoneRegion'
    >,
  ): void {
    const control = this.form.controls[name];
    control.setValue(!control.value);
  }

  toggleChannel(channel: CommunicationChannel): void {
    if (
      !this.canEdit() ||
      (!this.providerStatus()[channel] && !this.selectedChannels().includes(channel))
    )
      return;
    const selected = this.selectedChannels();
    if (selected.includes(channel)) {
      if (selected.length === 1) return;
      this.selectedChannels.set(selected.filter((item) => item !== channel));
    } else {
      this.selectedChannels.set([...selected, channel]);
    }
  }

  async submit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const value = this.form.getRawValue();
    await this.store.saveCommunications({
      ...value,
      reminderLeadMinutes: Number(value.reminderLeadMinutes),
      defaultPhoneRegion: value.defaultPhoneRegion.trim().toUpperCase() || null,
      channelPriority: this.selectedChannels(),
    });
  }
}
