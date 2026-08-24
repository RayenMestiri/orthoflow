import { getCloudinary } from '../config/cloudinary.js';
import { connectDatabase, disconnectDatabase } from '../infrastructure/database/connection.js';
import { PatientMediaModel } from '../modules/patient-media/patient-media.model.js';

interface RenameResult {
  secure_url?: string;
}

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  await connectDatabase();
  const filter = { deliveryType: { $ne: 'authenticated' } } as const;
  const pending = await PatientMediaModel.countDocuments(filter);
  console.warn(`${pending} patient-media assets require authenticated delivery.`);
  if (!apply || pending === 0) {
    console.warn(
      apply ? 'Nothing to migrate.' : 'Dry run only. Re-run with --apply after a provider backup.',
    );
    return;
  }

  const cloudinary = getCloudinary();
  let migrated = 0;
  let failed = 0;
  const cursor = PatientMediaModel.find(filter).cursor();
  for await (const record of cursor) {
    try {
      const renamed = (await cloudinary.uploader.rename(record.publicId, record.publicId, {
        resource_type: record.resourceType,
        type: 'upload',
        to_type: 'authenticated',
        overwrite: false,
        invalidate: true,
      })) as RenameResult;
      await PatientMediaModel.updateOne(
        { _id: record._id, deliveryType: { $ne: 'authenticated' } },
        {
          $set: {
            deliveryType: 'authenticated',
            ...(renamed.secure_url ? { secureUrl: renamed.secure_url } : {}),
          },
        },
      );
      migrated += 1;
    } catch {
      failed += 1;
    }
  }
  console.warn(`Patient-media migration finished: ${migrated} migrated, ${failed} failed.`);
  if (failed > 0) process.exitCode = 1;
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : 'Patient-media migration failed');
    process.exitCode = 1;
  })
  .finally(async () => disconnectDatabase());
