import { Writable } from 'node:stream';
import { pino } from 'pino';
import { describe, expect, it } from 'vitest';
import { REDACTED_PATHS } from '../../src/config/logger.js';

describe('production log redaction', () => {
  it('removes credentials, request bodies, clinical notes and destinations', () => {
    let output = '';
    const destination = new Writable({
      write(chunk, _encoding, callback) {
        output += chunk.toString();
        callback();
      },
    });
    const log = pino({ redact: { paths: REDACTED_PATHS, censor: '[redacted]' } }, destination);

    log.info({
      req: { headers: { authorization: 'Bearer secret' }, body: { patientName: 'Private' } },
      doctorNote: 'Sensitive clinical text',
      destinationSnapshot: '+21600000000',
    });

    expect(output).not.toContain('Bearer secret');
    expect(output).not.toContain('Private');
    expect(output).not.toContain('Sensitive clinical text');
    expect(output).not.toContain('+21600000000');
    expect(output).toContain('[redacted]');
  });
});
