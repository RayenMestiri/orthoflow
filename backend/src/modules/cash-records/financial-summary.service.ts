import { ERROR_CODES } from '../../common/constants/error-codes.js';
import { NotFoundError } from '../../common/errors/app-error.js';
import { DEFAULT_CURRENCY, majorToMinor } from '../../common/utils/money.js';
import { clinicRepository, type ClinicRepository } from '../clinics/clinic.repository.js';
import { patientRepository, type PatientRepository } from '../patients/patient.repository.js';
import {
  treatmentRepository,
  type TreatmentRepository,
} from '../treatments/treatment.repository.js';
import { CASH_RECORD_STATUSES, type FinancialSummaryDto } from './cash-record.types.js';
import { cashRecordRepository, type CashRecordRepository } from './cash-record.repository.js';

/**
 * Derives a patient's — or one treatment's — financial position.
 *
 * THE LEDGER RULE (AGENTS.md §2.1): there is no stored `patient.totalPaid` and
 * no mutable `treatment.amountPaid`. Recorded money is summed from the cash
 * records every time it is asked for, and cancelled records contribute zero.
 * A total that can be edited is a total that will be edited, and then the
 * clinic's books and its receipts disagree.
 *
 * TREATMENT IS READ-ONLY HERE. This service reads `agreedPrice` through the
 * public `treatmentRepository` and never writes to the Treatment domain.
 */
export class FinancialSummaryService {
  constructor(
    private readonly cashRecords: CashRecordRepository = cashRecordRepository,
    private readonly treatments: TreatmentRepository = treatmentRepository,
    private readonly patients: PatientRepository = patientRepository,
    private readonly clinics: ClinicRepository = clinicRepository,
  ) {}

  /**
   * The clinic's authoritative currency.
   *
   * `clinic.currency` already exists, so Clinic Settings needs no change. The
   * constant is only a floor for clinics created before the field did.
   */
  async resolveCurrency(clinicId: string): Promise<string> {
    const clinic = await this.clinics.findById(clinicId);
    return clinic?.currency?.toUpperCase() || DEFAULT_CURRENCY;
  }

  async forPatient(clinicId: string, patientId: string): Promise<FinancialSummaryDto> {
    await this.requirePatient(clinicId, patientId);
    return this.build(clinicId, patientId, null);
  }

  async forTreatment(clinicId: string, treatmentId: string): Promise<FinancialSummaryDto> {
    const treatment = await this.treatments.findByIdInClinic(treatmentId, clinicId);
    if (!treatment) {
      throw new NotFoundError('Treatment not found', { code: ERROR_CODES.TREATMENT_NOT_FOUND });
    }
    return this.build(clinicId, treatment.patientId.toString(), treatmentId);
  }

  /**
   * The shared computation.
   *
   * `agreedAmountMinor` is null when no treatment is in scope, or when the
   * treatment has no agreed price yet — in which case `remaining` is null too
   * rather than a misleading zero. "Nothing left to pay" and "we never agreed a
   * price" are different facts and the UI must be able to tell them apart.
   */
  private async build(
    clinicId: string,
    patientId: string,
    treatmentId: string | null,
  ): Promise<FinancialSummaryDto> {
    const currency = await this.resolveCurrency(clinicId);
    const scope = treatmentId === null ? { patientId } : { patientId, treatmentId };

    const [{ totalMinor, recordCount }, cancelledCount, agreedAmountMinor] = await Promise.all([
      this.cashRecords.sumRecordedMinor(clinicId, scope),
      this.cashRecords.countByStatus(clinicId, scope, CASH_RECORD_STATUSES.CANCELLED),
      this.resolveAgreedAmountMinor(clinicId, treatmentId, currency),
    ]);

    return {
      patientId,
      treatmentId,
      currency,
      agreedAmountMinor,
      recordedAmountMinor: totalMinor,
      remainingAmountMinor: agreedAmountMinor === null ? null : agreedAmountMinor - totalMinor,
      recordCount,
      cancelledCount,
    };
  }

  /**
   * Reads the treatment's agreed price and converts it to minor units.
   *
   * FUTURE NORMALIZATION POINT — `treatment.agreedPrice` is a major-unit float
   * owned by the Treatment module. The conversion lives here, on the Cash
   * Records side of the boundary, precisely so that Treatment needs no change
   * during parallel work. See the handoff notes for the migration.
   */
  private async resolveAgreedAmountMinor(
    clinicId: string,
    treatmentId: string | null,
    currency: string,
  ): Promise<number | null> {
    if (treatmentId === null) {
      return null;
    }
    const treatment = await this.treatments.findByIdInClinic(treatmentId, clinicId);
    if (!treatment || treatment.agreedPrice === null) {
      return null;
    }
    return majorToMinor(treatment.agreedPrice, currency);
  }

  private async requirePatient(clinicId: string, patientId: string): Promise<void> {
    const patient = await this.patients.findByIdInClinic(patientId, clinicId);
    if (!patient) {
      // Same 404 whether the patient does not exist or belongs to another
      // clinic — the API must not confirm that an id exists elsewhere.
      throw new NotFoundError('Patient not found', { code: ERROR_CODES.PATIENT_NOT_FOUND });
    }
  }
}

export const financialSummaryService = new FinancialSummaryService();
