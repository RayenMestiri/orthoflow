/**
 * Test environment.
 *
 * Set before anything imports `src/config/env.ts`, which validates the
 * environment at import time. `dotenv` never overwrites variables that already
 * exist, so these values win over a developer's local `.env` — a test run must
 * never be able to reach the real Atlas cluster.
 */
process.env.NODE_ENV = 'test';
process.env.PORT = '4100';
process.env.LOG_LEVEL = 'silent';
process.env.MONGODB_URI = 'mongodb://127.0.0.1:27017/orthoflow-test';
process.env.MONGODB_DB_NAME = 'orthoflow-test';
process.env.MONGODB_TRANSACTIONS_ENABLED = 'false';
process.env.JWT_ACCESS_SECRET = 'test-access-secret-value-that-is-long-enough-01';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-value-that-is-long-enough-02';
process.env.JWT_ACCESS_EXPIRES_IN = '15m';
process.env.JWT_REFRESH_EXPIRES_IN = '30d';
process.env.CLOUDINARY_CLOUD_NAME = '';
process.env.CLOUDINARY_API_KEY = '';
process.env.CLOUDINARY_API_SECRET = '';
process.env.SWAGGER_ENABLED = 'false';
process.env.BOOTSTRAP_SUPER_ADMIN_EMAIL = '';
process.env.AUTH_CODE_SECRET = 'test-auth-code-secret-that-is-long-enough-for-tests';
process.env.AUTH_CODE_EXPIRES_IN = '10m';
process.env.AUTH_CODE_RESEND_COOLDOWN = '1m';
process.env.AUTH_CODE_MAX_ATTEMPTS = '5';
