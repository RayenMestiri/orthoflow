import mongoose from 'mongoose';
import { databaseConfig, mongooseConnectOptions } from '../config/database.js';
import { AppointmentModel } from '../modules/appointments/appointment.model.js';
import { AppointmentTypeModel } from '../modules/appointment-types/appointment-type.model.js';
import { AuditLogModel } from '../modules/audit-logs/audit-log.model.js';
import { ClinicalVisitModel } from '../modules/clinical-visits/clinical-visit.model.js';
import { TreatmentModel } from '../modules/treatments/treatment.model.js';
import { PatientModel } from '../modules/patients/patient.model.js';
import { UserModel } from '../modules/users/user.model.js';
import { ClinicMembershipModel } from '../modules/memberships/membership.model.js';
import { AuthSessionModel } from '../modules/auth/auth-session.model.js';
import { tokenService } from '../infrastructure/security/token.service.js';

async function runMeasurements() {
  console.log('=== ORTHOFLOW BACKEND PERFORMANCE BENCHMARK ===\n');
  await mongoose.connect(databaseConfig.uri, mongooseConnectOptions);
  
  console.log('Syncing database indexes...');
  await Promise.all([
    AppointmentModel.syncIndexes(),
    AppointmentTypeModel.syncIndexes(),
    AuditLogModel.syncIndexes(),
    ClinicalVisitModel.syncIndexes(),
    TreatmentModel.syncIndexes(),
    PatientModel.syncIndexes(),
  ]);
  console.log('Indexes synced successfully.\n');

  // Find a test user and clinic
  const user = await UserModel.findOne({ status: 'ACTIVE' });
  if (!user) throw new Error('No active user found');
  const membership = await ClinicMembershipModel.findOne({ userId: user._id, status: 'ACTIVE' });
  if (!membership) throw new Error('No active membership found');
  const clinicId = membership.clinicId.toString();

  // Create/find active session
  let session = await AuthSessionModel.findOne({ userId: user._id, revokedAt: null });
  if (!session) {
    session = await AuthSessionModel.create({
      userId: user._id,
      familyId: 'bench-family-1',
      tokenHash: 'bench-hash-1',
      userAgent: 'benchmark-agent',
      ip: '127.0.0.1',
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });
  }

  const token = tokenService.signAccessToken({
    userId: user._id.toString(),
    sessionId: session._id.toString(),
  });

  const patient = await PatientModel.findOne({ clinicId });
  const patientId = patient?._id.toString() || '';

  const headers = {
    Authorization: `Bearer ${token}`,
    'x-clinic-id': clinicId,
  };

  const endpoints = [
    { name: 'GET /appointment-types', url: 'http://localhost:4000/api/v1/appointment-types' },
    { name: 'GET /clinic/settings', url: 'http://localhost:4000/api/v1/clinic/settings' },
    { name: 'GET /patients/:id', url: `http://localhost:4000/api/v1/patients/${patientId}` },
    { name: 'GET /patients/:id/guardians', url: `http://localhost:4000/api/v1/patients/${patientId}/guardians` },
    { name: 'GET /appointments', url: 'http://localhost:4000/api/v1/appointments?start=2026-08-01T00:00:00Z&end=2026-08-31T23:59:59Z' },
    { name: 'GET /reception/today', url: 'http://localhost:4000/api/v1/reception/today' },
    { name: 'GET /follow-ups', url: 'http://localhost:4000/api/v1/follow-ups' },
    { name: 'GET /patients/:id/activity', url: `http://localhost:4000/api/v1/patients/${patientId}/activity` },
  ];

  console.log('--- INDIVIDUAL ENDPOINT TIMINGS (Run 1 Cold, Run 2 Warm, Run 3 Warm) ---');
  for (const ep of endpoints) {
    const times: number[] = [];
    let status = 0;
    for (let r = 1; r <= 3; r++) {
      const t0 = performance.now();
      const res = await fetch(ep.url, { headers });
      const t1 = performance.now();
      status = res.status;
      times.push(t1 - t0);
    }
    const r1 = (times[0] ?? 0).toFixed(1);
    const r2 = (times[1] ?? 0).toFixed(1);
    const r3 = (times[2] ?? 0).toFixed(1);
    console.log(`${ep.name.padEnd(32)} | Status: ${status} | Run 1: ${r1}ms | Run 2: ${r2}ms | Run 3: ${r3}ms`);
  }

  console.log('\n--- CONCURRENT SIMULATION: PATIENT PROFILE (3 simultaneous requests) ---');
  const tProfile0 = performance.now();
  const profileRes = await Promise.all([
    fetch(`http://localhost:4000/api/v1/patients/${patientId}`, { headers }),
    fetch(`http://localhost:4000/api/v1/patients/${patientId}/guardians`, { headers }),
    fetch(`http://localhost:4000/api/v1/follow-ups?patientId=${patientId}&page=1&limit=1`, { headers }),
  ]);
  const tProfile1 = performance.now();
  console.log(`Patient Profile (3 parallel requests): ${(tProfile1 - tProfile0).toFixed(1)}ms (Statuses: ${profileRes.map(r => r.status).join(', ')})`);

  console.log('\n--- CONCURRENT BATCH: ALL 8 ENDPOINTS IN PARALLEL ---');
  const tAll0 = performance.now();
  const allRes = await Promise.all(endpoints.map(ep => fetch(ep.url, { headers })));
  const tAll1 = performance.now();
  console.log(`All 8 endpoints fired simultaneously: ${(tAll1 - tAll0).toFixed(1)}ms (Avg: ${((tAll1 - tAll0)/8).toFixed(1)}ms, Statuses: ${allRes.map(r => r.status).join(', ')})`);

  await mongoose.disconnect();
}

runMeasurements().catch(console.error);
