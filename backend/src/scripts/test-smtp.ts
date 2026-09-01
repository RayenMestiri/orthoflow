import { emailService } from '../infrastructure/email/email.service.js';
import { env } from '../config/env.js';

async function main() {
  console.log('Testing SMTP Configuration...');
  console.log({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    user: env.SMTP_USER,
    from: env.SMTP_FROM_ADDRESS,
    name: env.SMTP_FROM_NAME,
    isConfigured: emailService.isConfigured(),
  });

  if (!emailService.isConfigured()) {
    console.error('SMTP is not configured properly in .env!');
    return;
  }

  try {
    console.log('Sending test email to:', env.SMTP_FROM_ADDRESS);
    const result = await emailService.sendTransactional({
      recipient: env.SMTP_FROM_ADDRESS,
      subject: 'OrthoFlow SMTP Test',
      text: 'This is a test email verifying SMTP configuration in OrthoFlow.',
      html: '<p>This is a test email verifying SMTP configuration in <strong>OrthoFlow</strong>.</p>',
    });
    console.log('Email sent successfully! MessageId:', result.messageId);
  } catch (err: any) {
    console.error('Failed to send email via SMTP:', err);
  }
}

main().catch(console.error);
