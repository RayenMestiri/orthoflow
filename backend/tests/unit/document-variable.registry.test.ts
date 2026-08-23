import { describe, expect, it } from 'vitest';
import { ValidationError } from '../../src/common/errors/app-error.js';
import { resolveDocumentBlocks, validateDocumentDefinition } from '../../src/modules/generated-documents/document-variable.registry.js';
import { DOCUMENT_BLOCK_KINDS, DOCUMENT_CATEGORIES, DOCUMENT_TABLE_SOURCES } from '../../src/modules/generated-documents/generated-document.types.js';

describe('document variable registry', () => {
  it('accepts whitelisted variables and returns a stable variable list', () => {
    expect(validateDocumentDefinition(DOCUMENT_CATEGORIES.ATTENDANCE_CERTIFICATE, [
      { kind: DOCUMENT_BLOCK_KINDS.HEADING, level: 1, text: 'Attendance for {{ patient.fullName }}' },
      { kind: DOCUMENT_BLOCK_KINDS.KEY_VALUE, label: 'Visit', value: '{{appointment.date}}' },
    ])).toEqual(['appointment.date', 'patient.fullName']);
  });

  it('rejects arbitrary patient fields and category-inappropriate tables', () => {
    expect(() => validateDocumentDefinition(DOCUMENT_CATEGORIES.GENERAL, [
      { kind: DOCUMENT_BLOCK_KINDS.PARAGRAPH, text: '{{patient.notes}}' },
    ])).toThrow(ValidationError);
    expect(() => validateDocumentDefinition(DOCUMENT_CATEGORIES.GENERAL, [
      { kind: DOCUMENT_BLOCK_KINDS.DATA_TABLE, source: DOCUMENT_TABLE_SOURCES.FINANCE_RECORDS, columns: [{ key: 'amount', label: 'Amount' }] },
    ])).toThrow(ValidationError);
  });

  it('resolves values, omits optional empty blocks and snapshots table rows', () => {
    const result = resolveDocumentBlocks([
      { kind: DOCUMENT_BLOCK_KINDS.PARAGRAPH, text: 'Patient {{patient.fullName}}' },
      { kind: DOCUMENT_BLOCK_KINDS.KEY_VALUE, label: 'Reference', value: '{{patient.referenceNumber}}', omitWhenEmpty: true },
      { kind: DOCUMENT_BLOCK_KINDS.DATA_TABLE, source: DOCUMENT_TABLE_SOURCES.FINANCE_RECORDS, columns: [{ key: 'amount', label: 'Amount' }] },
    ], { 'patient.fullName': 'Leila Mansour', 'patient.referenceNumber': null }, { FINANCE_RECORDS: [{ cells: [{ key: 'amount', value: '200.000 TND' }] }] });
    expect(result).toHaveLength(2);
    expect(result[0]?.text).toBe('Patient Leila Mansour');
    expect(result[1]?.rows?.[0]?.cells[0]?.value).toBe('200.000 TND');
  });
});
