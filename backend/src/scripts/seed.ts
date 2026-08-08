import { CLINIC_ROLES, MEMBERSHIP_STATUSES } from '../common/constants/roles.js';
import { buildUniqueSlug } from '../common/utils/slug.js';
import { env, isProduction } from '../config/env.js';
import { connectDatabase, disconnectDatabase } from '../infrastructure/database/connection.js';
import { passwordService } from '../infrastructure/security/password.service.js';
import { appointmentTypeService } from '../modules/appointment-types/appointment-type.service.js';
import { clinicRepository } from '../modules/clinics/clinic.repository.js';
import { membershipRepository } from '../modules/memberships/membership.repository.js';
import { patientRepository } from '../modules/patients/patient.repository.js';
import { userRepository } from '../modules/users/user.repository.js';

/**
 * Development seed.
 *
 * Creates one realistic but entirely fictional clinic so a new developer (or the
 * Angular front-end) has something to log into. Everything here is throwaway
 * data with published passwords — hence the hard production guard below.
 */

/** DEVELOPMENT ONLY. These passwords are in version control on purpose. */
const SEED_PASSWORD = 'OrthoFlow-Dev-2026';

const STAFF = [
  {
    email: 'owner@orthoflow.test',
    firstName: 'Amine',
    lastName: 'Ben Salah',
    role: CLINIC_ROLES.CLINIC_OWNER,
  },
  {
    email: 'ortho@orthoflow.test',
    firstName: 'Nadia',
    lastName: 'Khelifi',
    role: CLINIC_ROLES.ORTHODONTIST,
  },
  {
    email: 'secretary@orthoflow.test',
    firstName: 'Rim',
    lastName: 'Gharbi',
    role: CLINIC_ROLES.SECRETARY,
  },
] as const;

const PATIENTS = [
  { firstName: 'Yasmine', lastName: 'Trabelsi', birthDate: '2014-03-21', gender: 'FEMALE' },
  { firstName: 'Mehdi', lastName: 'Ayari', birthDate: '2012-11-04', gender: 'MALE' },
  { firstName: 'Sarra', lastName: 'Bouzid', birthDate: '2010-06-15', gender: 'FEMALE' },
  { firstName: 'Oussama', lastName: 'Chaabane', birthDate: '2008-01-30', gender: 'MALE' },
  { firstName: 'Ines', lastName: 'Mabrouk', birthDate: '1996-09-09', gender: 'FEMALE' },
] as const;

async function seed(): Promise<void> {
  if (isProduction) {
    throw new Error('Refusing to seed a production database.');
  }

  console.warn(`Seeding ${env.MONGODB_DB_NAME} (${env.NODE_ENV})...`);
  await connectDatabase();

  const owner = STAFF[0];
  const existingOwner = await userRepository.findByEmail(owner.email);
  if (existingOwner) {
    // Idempotent top-up: newer seed responsibilities (appointment types) still
    // run for a database that was seeded before they existed.
    const [membership] = await membershipRepository.findActiveByUser(existingOwner._id.toString());
    if (membership) {
      const types = await appointmentTypeService.seedDefaults(
        membership.clinicId.toString(),
        existingOwner._id.toString(),
      );
      console.warn(`Seed data already present — ensured ${types.length} appointment types.`);
    } else {
      console.warn('Seed data already present — nothing to do.');
    }
    return;
  }

  const passwordHash = await passwordService.hash(SEED_PASSWORD);
  const slug = await buildUniqueSlug('Cabinet Orthodontique Al Amal', (candidate) =>
    clinicRepository.existsBySlug(candidate),
  );

  const ownerUser = await userRepository.create({
    email: owner.email,
    passwordHash,
    firstName: owner.firstName,
    lastName: owner.lastName,
  });
  const ownerId = ownerUser._id.toString();
  await userRepository.markEmailVerified(ownerId, new Date());

  const clinic = await clinicRepository.create({
    name: 'Cabinet Orthodontique Al Amal',
    slug,
    createdBy: ownerId,
    email: 'contact@al-amal.test',
    phone: '+216 71 000 000',
    address: {
      line1: '12 Avenue Habib Bourguiba',
      city: 'Tunis',
      postalCode: '1000',
      country: 'TN',
    },
  });
  const clinicId = clinic._id.toString();

  await membershipRepository.create({
    userId: ownerId,
    clinicId,
    role: CLINIC_ROLES.CLINIC_OWNER,
    status: MEMBERSHIP_STATUSES.ACTIVE,
  });

  for (const member of STAFF.slice(1)) {
    const user = await userRepository.create({
      email: member.email,
      passwordHash,
      firstName: member.firstName,
      lastName: member.lastName,
    });
    await userRepository.markEmailVerified(user._id.toString(), new Date());

    await membershipRepository.create({
      userId: user._id.toString(),
      clinicId,
      role: member.role,
      status: MEMBERSHIP_STATUSES.ACTIVE,
      invitedBy: ownerId,
    });
  }

  for (const patient of PATIENTS) {
    await patientRepository.create({
      clinicId,
      createdBy: ownerId,
      firstName: patient.firstName,
      lastName: patient.lastName,
      birthDate: patient.birthDate,
      gender: patient.gender,
    });
  }

  const appointmentTypes = await appointmentTypeService.seedDefaults(clinicId, ownerId);
  console.warn(`  Appointment types: ${appointmentTypes.length}`);

  console.warn('\nSeed complete.');
  console.warn(`  Clinic:   ${clinic.name} (${clinicId})`);
  console.warn(`  Patients: ${PATIENTS.length}`);
  console.warn('  Accounts (DEVELOPMENT ONLY):');
  for (const member of STAFF) {
    console.warn(`    ${member.role.padEnd(14)} ${member.email}  /  ${SEED_PASSWORD}`);
  }
}

seed()
  .then(async () => {
    await disconnectDatabase();
    process.exit(0);
  })
  .catch(async (error: unknown) => {
    console.error('Seed failed:', error);
    await disconnectDatabase();
    process.exit(1);
  });
