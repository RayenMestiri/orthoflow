import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ClinicSettingsStore } from '../../data-access/clinic-settings.store';
import {
  LANGUAGE_LABELS,
  SUPPORTED_LANGUAGES,
  type ClinicGeneralSettings,
  type SupportedLanguage,
} from '../../models/clinic-settings.models';

/** Zones a Tunisian clinic realistically picks; free text stays possible. */
const COMMON_TIMEZONES = [
  'Africa/Tunis',
  'Africa/Algiers',
  'Africa/Casablanca',
  'Africa/Cairo',
  'Europe/Paris',
  'Europe/London',
  'UTC',
];

/**
 * Clinic identity and presentation.
 *
 * The timezone lives here because it is clinic-wide configuration with exactly
 * one authoritative home; other modules read it rather than hardcoding a zone.
 */
@Component({
  selector: 'app-settings-general',
  imports: [ReactiveFormsModule],
  templateUrl: './settings-general.html',
  styleUrl: '../../pages/settings-page/settings-section.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsGeneral {
  readonly general = input.required<ClinicGeneralSettings>();
  readonly canEdit = input(false);

  protected readonly store = inject(ClinicSettingsStore);
  private readonly formBuilder = inject(NonNullableFormBuilder);

  protected readonly locating = signal(false);
  protected readonly locationError = signal<string | null>(null);
  protected readonly locationSuccess = signal<string | null>(null);

  protected readonly timezones = COMMON_TIMEZONES;
  protected readonly languages = SUPPORTED_LANGUAGES;
  protected readonly languageLabels = LANGUAGE_LABELS;

  protected readonly form = this.formBuilder.group({
    clinicName: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(120)]],
    doctorDisplayName: ['', [Validators.maxLength(120)]],
    phone: ['', [Validators.maxLength(32)]],
    email: ['', [Validators.email]],
    addressLine1: ['', [Validators.maxLength(160)]],
    city: ['', [Validators.maxLength(80)]],
    postalCode: ['', [Validators.maxLength(20)]],
    country: ['', [Validators.maxLength(80)]],
    timezone: ['Africa/Tunis', [Validators.required]],
    logoUrl: ['', [Validators.pattern(/^https?:\/\/.+/)]],
    defaultLanguage: ['fr' as SupportedLanguage, [Validators.required]],
  });

  private readonly formValue = toSignal(this.form.valueChanges, { initialValue: null });

  /** Save stays disabled until something actually changed. */
  protected readonly isDirty = computed(() => {
    this.formValue();
    const current = this.general();
    const value = this.form.getRawValue();
    return (
      value.clinicName !== current.clinicName ||
      value.doctorDisplayName !== (current.doctorDisplayName ?? '') ||
      value.phone !== (current.phone ?? '') ||
      value.email !== (current.email ?? '') ||
      value.addressLine1 !== (current.addressLine1 ?? '') ||
      value.city !== (current.city ?? '') ||
      value.postalCode !== (current.postalCode ?? '') ||
      value.country !== (current.country ?? '') ||
      value.timezone !== current.timezone ||
      value.logoUrl !== (current.logoUrl ?? '') ||
      value.defaultLanguage !== current.defaultLanguage
    );
  });

  protected readonly isSaving = computed(() => this.store.savingSection() === 'general');
  protected readonly justSaved = computed(() => this.store.savedSection() === 'general');

  constructor() {
    effect(() => this.reset());
  }

  reset(): void {
    const current = this.general();
    this.form.reset({
      clinicName: current.clinicName,
      doctorDisplayName: current.doctorDisplayName ?? '',
      phone: current.phone ?? '',
      email: current.email ?? '',
      addressLine1: current.addressLine1 ?? '',
      city: current.city ?? '',
      postalCode: current.postalCode ?? '',
      country: current.country ?? '',
      timezone: current.timezone,
      logoUrl: current.logoUrl ?? '',
      defaultLanguage: current.defaultLanguage,
    });
    if (!this.canEdit()) {
      this.form.disable({ emitEvent: false });
    }
  }

  async submit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const value = this.form.getRawValue();
    // Empty text means "cleared", which the API expresses as null.
    const orNull = (text: string): string | null => (text.trim() ? text.trim() : null);

    await this.store.saveGeneral({
      clinicName: value.clinicName.trim(),
      doctorDisplayName: orNull(value.doctorDisplayName),
      phone: orNull(value.phone),
      email: orNull(value.email),
      addressLine1: orNull(value.addressLine1),
      city: orNull(value.city),
      postalCode: orNull(value.postalCode),
      country: orNull(value.country),
      timezone: value.timezone,
      logoUrl: orNull(value.logoUrl),
      defaultLanguage: value.defaultLanguage,
    });
  }

  async detectDeviceLocation(): Promise<void> {
    if (!this.canEdit()) return;
    if (typeof window === 'undefined' || !navigator.geolocation) {
      this.locationError.set('La géolocalisation n’est pas supportée par cet appareil.');
      return;
    }
    this.locating.set(true);
    this.locationError.set(null);
    this.locationSuccess.set(null);

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const lat = pos.coords.latitude;
          const lon = pos.coords.longitude;
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&addressdetails=1`,
            { headers: { 'Accept-Language': 'fr,en' } },
          );
          if (!res.ok) throw new Error('Erreur de géocodage');
          const data = await res.json();
          const addr = data.address || {};
          const streetParts = [addr.house_number, addr.road || addr.street || addr.suburb].filter(Boolean);
          const line1 = streetParts.length > 0 ? streetParts.join(' ') : (data.name || '');
          const city = addr.city || addr.town || addr.village || addr.municipality || addr.county || '';
          const postalCode = addr.postcode || '';
          const country = addr.country || '';

          this.form.patchValue({
            addressLine1: line1 || this.form.controls.addressLine1.value,
            city: city || this.form.controls.city.value,
            postalCode: postalCode || this.form.controls.postalCode.value,
            country: country || this.form.controls.country.value,
          });
          this.form.markAsDirty();
          this.locationSuccess.set('Adresse du cabinet récupérée depuis l’appareil.');
          setTimeout(() => this.locationSuccess.set(null), 4000);
        } catch {
          this.locationError.set('Impossible de déterminer l’adresse à partir de vos coordonnées GPS.');
        } finally {
          this.locating.set(false);
        }
      },
      (err) => {
        this.locating.set(false);
        if (err.code === 1) {
          this.locationError.set('Accès à la position refusé. Veuillez autoriser la géolocalisation.');
        } else {
          this.locationError.set('Position introuvable ou signal GPS indisponible.');
        }
      },
      { timeout: 10000, enableHighAccuracy: true },
    );
  }
}
