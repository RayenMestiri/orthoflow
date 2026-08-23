import { toObjectId } from '../../common/utils/object-id.js';
import { ClinicModel } from './clinic.model.js';
import type { ClinicRecord } from './clinic.types.js';
import type {
  ClinicSchedulingSettings,
  ClinicCareContinuitySettings,
  UpdateGeneralSettingsInput,
  WeeklyWorkingHours,
} from './clinic-settings.types.js';

/**
 * Persistence for clinic operating configuration.
 *
 * Deliberately a separate class from `ClinicRepository`: settings are their own
 * concern with their own update shapes, and keeping them apart means the two
 * can evolve without either becoming a grab bag.
 *
 * TENANCY RULE: every method takes `clinicId` and puts it in the filter.
 */
export class ClinicSettingsRepository {
  async findClinic(clinicId: string): Promise<ClinicRecord | null> {
    return ClinicModel.findById(toObjectId(clinicId, 'clinicId'))
      .lean<ClinicRecord | null>()
      .exec();
  }

  /**
   * Updates identity fields on the clinic root plus the presentation fields in
   * `settings.general`. Dotted paths so untouched siblings survive.
   */
  async updateGeneral(
    clinicId: string,
    changes: UpdateGeneralSettingsInput,
  ): Promise<ClinicRecord | null> {
    const set: Record<string, unknown> = {};

    if (changes.clinicName !== undefined) set.name = changes.clinicName;
    if (changes.phone !== undefined) set.phone = changes.phone;
    if (changes.email !== undefined) set.email = changes.email;
    if (changes.timezone !== undefined) set.timezone = changes.timezone;
    if (changes.addressLine1 !== undefined) set['address.line1'] = changes.addressLine1;
    if (changes.city !== undefined) set['address.city'] = changes.city;
    if (changes.postalCode !== undefined) set['address.postalCode'] = changes.postalCode;
    if (changes.country !== undefined) set['address.country'] = changes.country;

    if (changes.doctorDisplayName !== undefined) {
      set['settings.general.doctorDisplayName'] = changes.doctorDisplayName;
    }
    if (changes.logoUrl !== undefined) set['settings.general.logoUrl'] = changes.logoUrl;
    if (changes.defaultLanguage !== undefined) {
      set['settings.general.defaultLanguage'] = changes.defaultLanguage;
    }

    return this.applyUpdate(clinicId, set);
  }

  /**
   * Replaces the whole week.
   *
   * Partial updates are not offered on purpose: a half-written week would leave
   * days undefined, and every consumer would have to invent a fallback.
   */
  async updateWorkingHours(
    clinicId: string,
    workingHours: WeeklyWorkingHours,
  ): Promise<ClinicRecord | null> {
    return this.applyUpdate(clinicId, { 'settings.workingHours': workingHours });
  }

  async updateScheduling(
    clinicId: string,
    scheduling: ClinicSchedulingSettings,
  ): Promise<ClinicRecord | null> {
    return this.applyUpdate(clinicId, { 'settings.scheduling': scheduling });
  }

  async updateCareContinuity(
    clinicId: string,
    careContinuity: ClinicCareContinuitySettings,
  ): Promise<ClinicRecord | null> {
    return this.applyUpdate(clinicId, { 'settings.careContinuity': careContinuity });
  }

  private async applyUpdate(
    clinicId: string,
    set: Record<string, unknown>,
  ): Promise<ClinicRecord | null> {
    if (Object.keys(set).length === 0) {
      return this.findClinic(clinicId);
    }

    return ClinicModel.findOneAndUpdate(
      { _id: toObjectId(clinicId, 'clinicId') },
      { $set: set },
      { new: true, runValidators: true },
    )
      .lean<ClinicRecord | null>()
      .exec();
  }
}

export const clinicSettingsRepository = new ClinicSettingsRepository();
