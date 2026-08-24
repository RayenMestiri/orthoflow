import nodemailer, { type Transporter } from 'nodemailer';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';

export interface AuthCodeEmail {
  recipient: string;
  recipientName: string;
  code: string;
  purpose: 'EMAIL_VERIFICATION' | 'PASSWORD_RESET';
  expiresInMinutes: number;
}

export interface EmailServiceContract {
  sendAuthCode(message: AuthCodeEmail): Promise<boolean>;
  sendTransactional?(message: TransactionalEmail): Promise<{ messageId: string | null }>;
  isConfigured?(): boolean;
  sendPortalInvitation?(message: {
    recipient: string;
    recipientName: string;
    activationUrl: string;
    expiresInHours: number;
    clinicName: string;
  }): Promise<boolean>;
}

export interface TransactionalEmail {
  recipient: string;
  subject: string;
  text: string;
  html?: string | null;
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

  isConfigured(): boolean {
    return this.transporter !== null && env.SMTP_FROM_ADDRESS !== '';
  }

  async sendTransactional(message: TransactionalEmail): Promise<{ messageId: string | null }> {
    if (!this.transporter || env.SMTP_FROM_ADDRESS === '') {
      throw new Error('SMTP_NOT_CONFIGURED');
    }
    const info = (await this.transporter.sendMail({
      from: { name: env.SMTP_FROM_NAME, address: env.SMTP_FROM_ADDRESS },
      to: message.recipient,
      subject: message.subject,
      text: message.text,
      ...(message.html ? { html: message.html } : {}),
    })) as { messageId?: unknown };
    return { messageId: typeof info.messageId === 'string' ? info.messageId : null };
  }

  async sendAuthCode(message: AuthCodeEmail): Promise<boolean> {
    if (!this.transporter || env.SMTP_FROM_ADDRESS === '') {
      if (env.NODE_ENV === 'development') {
        logger.warn(
          { purpose: message.purpose },
          'SMTP is unavailable; authentication email was not delivered',
        );
      }
      return false;
    }

    const isVerification = message.purpose === 'EMAIL_VERIFICATION';
    const subject = isVerification
      ? 'Vérifiez votre compte Dentiste'
      : 'Réinitialisez votre mot de passe Dentiste';
    const safeName = escapeHtml(message.recipientName);
    const safeRecipient = escapeHtml(message.recipient);

    const htmlContent = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(subject)}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #F6F3EC; font-family: 'Manrope', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased; color: #17201E;">
  <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #F6F3EC; padding: 40px 16px;">
    <tr>
      <td align="center">
        <!-- Main Card Container -->
        <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 560px; background-color: #FFFEFB; border-radius: 16px; overflow: hidden; border: 1px solid #DCE2DE; box-shadow: 0 12px 36px rgba(13, 41, 37, 0.07);">

          <!-- Top Header with Deep Pine Gradient -->
          <tr>
            <td style="background: linear-gradient(135deg, #0D2925 0%, #173F38 100%); padding: 36px 40px; text-align: center; border-bottom: 3px solid #C86445;">
              <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0">
                <tr>
                  <td align="center">
                    <div style="display: inline-block; background: rgba(255, 254, 251, 0.08); border: 1px solid rgba(255, 254, 251, 0.15); border-radius: 12px; padding: 10px 20px; margin-bottom: 8px;">
                      <span style="font-size: 24px; font-weight: 700; color: #FFFEFB; letter-spacing: -0.5px;">Dentiste<span style="color: #C86445;">.</span></span>
                    </div>
                    <div style="font-size: 13px; color: #DCE2DE; font-weight: 500; letter-spacing: 0.5px; text-transform: uppercase;">Cabinet Dentaire & Orthodontie</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Main Content -->
          <tr>
            <td style="padding: 40px 40px 32px 40px;">
              <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0">

                <!-- Greeting & Category Badge -->
                <tr>
                  <td>
                    <span style="display: inline-block; background-color: #F7EBE8; color: #A94830; font-size: 12px; font-weight: 600; padding: 4px 12px; border-radius: 20px; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 16px;">
                      ${isVerification ? "Vérification d'e-mail" : 'Réinitialisation du mot de passe'}
                    </span>
                    <h1 style="margin: 0 0 12px 0; font-size: 24px; font-weight: 700; color: #0D2925; line-height: 1.3;">
                      ${isVerification ? 'Vérifiez votre adresse e-mail' : 'Réinitialisez votre mot de passe'}
                    </h1>
                    <p style="margin: 0 0 24px 0; font-size: 16px; color: #56635F; line-height: 1.6;">
                      Bonjour <strong style="color: #17201E;">${safeName}</strong>,<br>
                      ${
                        isVerification
                          ? 'Merci de vous être inscrit sur <strong>Dentiste</strong>. Veuillez utiliser le code sécurisé ci-dessous pour valider votre adresse e-mail.'
                          : 'Vous avez demandé la réinitialisation de votre mot de passe. Voici votre code de confirmation sécurisé :'
                      }
                    </p>
                  </td>
                </tr>

                <!-- Code Card Box -->
                <tr>
                  <td align="center" style="padding: 8px 0 28px 0;">
                    <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #F0F4F2; border: 1.5px dashed #173F38; border-radius: 14px; text-align: center; padding: 28px 20px;">
                      <tr>
                        <td>
                          <div style="font-size: 12px; text-transform: uppercase; letter-spacing: 1.5px; color: #56635F; font-weight: 600; margin-bottom: 8px;">Votre code à 6 chiffres</div>
                          <div style="font-size: 38px; font-weight: 800; color: #0D2925; letter-spacing: 12px; margin: 4px 0 14px 12px; font-family: monospace, 'Courier New', sans-serif;">
                            ${message.code}
                          </div>
                          <div style="font-size: 13px; color: #173F38; font-weight: 600; background: #FFFEFB; display: inline-block; padding: 6px 14px; border-radius: 20px; border: 1px solid #DCE2DE;">
                            ⏱️ Expire dans <strong style="color: #C86445;">${message.expiresInMinutes} minutes</strong>
                          </div>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <!-- Safety Note -->
                <tr>
                  <td>
                    <div style="background-color: #F6F3EC; border-left: 4px solid #C86445; border-radius: 0 8px 8px 0; padding: 14px 16px; margin-bottom: 12px;">
                      <p style="margin: 0; font-size: 13px; color: #56635F; line-height: 1.5;">
                        🔒 <strong>Sécurité :</strong> Ne partagez ce code avec personne. Si vous n'avez pas demandé ce code, vous pouvez ignorer cet e-mail.
                      </p>
                    </div>
                  </td>
                </tr>

              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #F6F3EC; padding: 24px 40px; text-align: center; border-top: 1px solid #DCE2DE;">
              <p style="margin: 0 0 6px 0; font-size: 13px; font-weight: 600; color: #173F38;">
                Dentiste — Solution de Gestion de Cabinet Dentaire
              </p>
              <p style="margin: 0; font-size: 12px; color: #56635F;">
                Cet e-mail automatique a été envoyé à <span style="color: #17201E;">${safeRecipient}</span>.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    await this.transporter.sendMail({
      from: { name: env.SMTP_FROM_NAME, address: env.SMTP_FROM_ADDRESS },
      to: message.recipient,
      subject,
      text: `Bonjour ${message.recipientName},\n\nVotre code de vérification Dentiste est : ${message.code}. Il expire dans ${message.expiresInMinutes} minutes.\n\nDentiste — Solution de Gestion de Cabinet`,
      html: htmlContent,
    });

    return true;
  }

  async sendPortalInvitation(message: {
    recipient: string;
    recipientName: string;
    activationUrl: string;
    expiresInHours: number;
    clinicName: string;
  }): Promise<boolean> {
    if (!this.transporter || env.SMTP_FROM_ADDRESS === '') return false;
    const name = escapeHtml(message.recipientName);
    const clinic = escapeHtml(message.clinicName);
    const url = escapeHtml(message.activationUrl);
    await this.transporter.sendMail({
      from: { name: env.SMTP_FROM_NAME, address: env.SMTP_FROM_ADDRESS },
      to: message.recipient,
      subject: `${message.clinicName} vous invite sur OrthoFlow`,
      text: `Bonjour ${message.recipientName},\n\n${message.clinicName} vous invite à consulter le suivi de votre enfant. Activez votre accès: ${message.activationUrl}\n\nCe lien expire dans ${message.expiresInHours} heures.`,
      html: `<div style="font-family:Manrope,Arial,sans-serif;max-width:560px;margin:auto;background:#fffefb;color:#17201e;padding:32px;border:1px solid #dce2de;border-radius:16px"><h1 style="color:#0d2925">Votre espace parent</h1><p>Bonjour <strong>${name}</strong>,</p><p><strong>${clinic}</strong> vous invite à consulter le suivi de votre enfant dans un espace privé OrthoFlow.</p><p><a href="${url}" style="display:inline-block;background:#173f38;color:#fff;padding:12px 18px;border-radius:8px;text-decoration:none">Activer mon accès</a></p><p style="color:#56635f;font-size:13px">Ce lien personnel expire dans ${message.expiresInHours} heures. Ne le transférez pas.</p></div>`,
    });
    return true;
  }
}

export const emailService = new SmtpEmailService();
