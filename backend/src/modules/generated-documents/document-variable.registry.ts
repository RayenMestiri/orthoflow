import { ValidationError } from '../../common/errors/app-error.js';
import { ERROR_CODES } from '../../common/constants/error-codes.js';
import {
  DOCUMENT_BLOCK_KINDS,
  DOCUMENT_CATEGORIES,
  DOCUMENT_TABLE_SOURCES,
  type DocumentBlock,
  type DocumentCategory,
  type DocumentTableSource,
  type ResolvedDocumentBlock,
  type ResolvedDocumentRow,
} from './generated-document.types.js';

const COMMON_VARIABLES = [
  'patient.fullName',
  'patient.birthDate',
  'patient.referenceNumber',
  'clinic.name',
  'clinic.address',
  'clinic.phone',
  'clinic.email',
  'doctor.fullName',
  'document.generatedAt',
] as const;

const CATEGORY_VARIABLES: Readonly<Record<DocumentCategory, readonly string[]>> = {
  [DOCUMENT_CATEGORIES.ATTENDANCE_CERTIFICATE]: [
    'appointment.date', 'appointment.time', 'appointment.type', 'appointment.status',
  ],
  [DOCUMENT_CATEGORIES.PATIENT_SUMMARY]: [
    'guardian.fullName', 'guardian.relationship', 'treatment.type', 'treatment.status',
    'treatment.startDate', 'treatment.expectedEndDate', 'retention.status',
  ],
  [DOCUMENT_CATEGORIES.TREATMENT_SUMMARY]: [
    'treatment.type', 'treatment.status', 'treatment.startDate',
    'treatment.expectedEndDate', 'treatment.completedAt',
  ],
  [DOCUMENT_CATEGORIES.REFERRAL_LETTER]: [
    'referral.recipient', 'referral.reason', 'referral.message',
    'treatment.type', 'treatment.status',
  ],
  [DOCUMENT_CATEGORIES.PAYMENT_STATEMENT]: [
    'finance.periodStart', 'finance.periodEnd', 'finance.totalRecorded',
    'finance.currency', 'finance.recordCount',
  ],
  [DOCUMENT_CATEGORIES.RETENTION_SUMMARY]: [
    'retention.status', 'retention.startedAt', 'retention.nextControlAt',
    'treatment.type',
  ],
  [DOCUMENT_CATEGORIES.GENERAL]: [],
};

const CATEGORY_TABLES: Readonly<Record<DocumentCategory, readonly DocumentTableSource[]>> = {
  [DOCUMENT_CATEGORIES.ATTENDANCE_CERTIFICATE]: [],
  [DOCUMENT_CATEGORIES.PATIENT_SUMMARY]: [],
  [DOCUMENT_CATEGORIES.TREATMENT_SUMMARY]: [DOCUMENT_TABLE_SOURCES.TREATMENT_MILESTONES],
  [DOCUMENT_CATEGORIES.REFERRAL_LETTER]: [],
  [DOCUMENT_CATEGORIES.PAYMENT_STATEMENT]: [DOCUMENT_TABLE_SOURCES.FINANCE_RECORDS],
  [DOCUMENT_CATEGORIES.RETENTION_SUMMARY]: [DOCUMENT_TABLE_SOURCES.RETENTION_DEVICES],
  [DOCUMENT_CATEGORIES.GENERAL]: [],
};

const VARIABLE_PATTERN = /{{\s*([a-z][a-zA-Z0-9]*(?:\.[a-z][a-zA-Z0-9]*)+)\s*}}/g;

function invalid(message: string): never {
  throw new ValidationError(message, { code: ERROR_CODES.INVALID_DOCUMENT_TEMPLATE });
}

function variablesIn(value: string | undefined): string[] {
  if (!value) return [];
  return [...value.matchAll(VARIABLE_PATTERN)].map((match) => match[1] ?? '');
}

export function allowedVariables(category: DocumentCategory): string[] {
  return [...COMMON_VARIABLES, ...CATEGORY_VARIABLES[category]];
}

export function validateDocumentDefinition(
  category: DocumentCategory,
  definition: DocumentBlock[],
): string[] {
  if (definition.length === 0 || definition.length > 40) {
    invalid('A document template must contain between 1 and 40 blocks');
  }
  const allowed = new Set(allowedVariables(category));
  const used = new Set<string>();
  for (const [index, block] of definition.entries()) {
    const position = `Block ${index + 1}`;
    if (block.kind === DOCUMENT_BLOCK_KINDS.HEADING) {
      if (!block.text?.trim() || !block.level) invalid(`${position} requires heading text and level`);
    } else if (block.kind === DOCUMENT_BLOCK_KINDS.PARAGRAPH) {
      if (!block.text?.trim()) invalid(`${position} requires paragraph text`);
    } else if (block.kind === DOCUMENT_BLOCK_KINDS.KEY_VALUE) {
      if (!block.label?.trim() || !block.value?.trim()) invalid(`${position} requires a label and value`);
    } else if (block.kind === DOCUMENT_BLOCK_KINDS.DATA_TABLE) {
      if (!block.source || !CATEGORY_TABLES[category].includes(block.source)) {
        invalid(`${position} uses a table source that is not allowed for ${category}`);
      }
      if (!block.columns?.length || block.columns.length > 8) {
        invalid(`${position} must define between 1 and 8 table columns`);
      }
      const keys = new Set(block.columns.map((column) => column.key));
      if (keys.size !== block.columns.length) invalid(`${position} contains duplicate column keys`);
    } else if (
      block.kind !== DOCUMENT_BLOCK_KINDS.DIVIDER &&
      block.kind !== DOCUMENT_BLOCK_KINDS.SIGNATURE_LINE
    ) {
      invalid(`${position} has an unsupported block kind`);
    }

    for (const variable of [...variablesIn(block.text), ...variablesIn(block.value)]) {
      if (!allowed.has(variable)) invalid(`${position} uses unknown or restricted variable {{${variable}}}`);
      used.add(variable);
    }
  }
  return [...used].sort();
}

export function resolveDocumentBlocks(
  definition: DocumentBlock[],
  values: Readonly<Record<string, string | null>>,
  tables: Readonly<Partial<Record<DocumentTableSource, ResolvedDocumentRow[]>>>,
): ResolvedDocumentBlock[] {
  const interpolate = (value: string | undefined): { text: string; empty: boolean } => {
    let empty = false;
    const text = (value ?? '').replace(VARIABLE_PATTERN, (_match, key: string) => {
      const replacement = values[key];
      if (!replacement) empty = true;
      return replacement || '—';
    });
    return { text, empty };
  };

  return definition.flatMap((block) => {
    const text = interpolate(block.text);
    const value = interpolate(block.value);
    if (block.omitWhenEmpty && (text.empty || value.empty)) return [];
    return [{
      ...block,
      ...(block.text !== undefined ? { text: text.text } : {}),
      ...(block.value !== undefined ? { value: value.text } : {}),
      ...(block.source ? { rows: tables[block.source] ?? [] } : {}),
    }];
  });
}
