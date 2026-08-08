import nodemailer, { type Transporter } from 'nodemailer';
import { env } from '../../config/env.js';

export interface AuthCodeEmail {
  recipient: string;
  recipientName: string;
  code: string;
  purpose: 'EMAIL_VERIFICATION' | 'PASSWORD_RESET';
  expiresInMinutes: number;
}

export interface EmailServiceContract {
  sendAuthCode(message: AuthCodeEmail): Promise<boolean>;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => {
    const entities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;',
    };
    return entities[character] ?? character;
  });
}

export class SmtpEmailService implements EmailServiceContract {
  private readonly transporter: Transporter | null;

  constructor() {
    this.transporter =
      env.SMTP_HOST === '' || env.SMTP_USER === '' || env.SMTP_PASS === ''
        ? null
        : nodemailer.createTransport({
            host: env.SMTP_HOST,
            port: env.SMTP_PORT,
            secure: env.SMTP_SECURE,
            auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
          });
  }

  async sendAuthCode(message: AuthCodeEmail): Promise<boolean> {
    if (!this.transporter || env.SMTP_FROM_ADDRESS === '') {
      return false;
    }

    const isVerification = message.purpose === 'EMAIL_VERIFICATION';
    const subject = isVerification
      ? 'Verify your OrthoFlow email'
      : 'Reset your OrthoFlow password';
    const action = isVerification ? 'verify your email' : 'reset your password';
    const safeName = escapeHtml(message.recipientName);

    await this.transporter.sendMail({
      from: { name: env.SMTP_FROM_NAME, address: env.SMTP_FROM_ADDRESS },
      to: message.recipient,
      subject,
      text: `Hello ${message.recipientName},\n\nUse ${message.code} to ${action}. This code expires in ${message.expiresInMinutes} minutes.\n\nIf you did not request this, you can ignore this email.`,
      html: `<div style="font-family:Arial,sans-serif;color:#17201e;line-height:1.6;max-width:560px;margin:auto"><p>Hello ${safeName},</p><p>Use this one-time code to ${action}:</p><p style="font-size:32px;font-weight:700;letter-spacing:8px;color:#173f38;margin:24px 0">${message.code}</p><p>This code expires in ${message.expiresInMinutes} minutes. If you did not request this, you can ignore this email.</p><p style="color:#56635f">OrthoFlow</p></div>`,
    });

    return true;
  }
}

export const emailService = new SmtpEmailService();
