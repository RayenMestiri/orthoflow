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

export interface StaffInvitationEmail {
  recipient: string;
  recipientName: string;
  clinicName: string;
  invitedByName: string;
  roleName: string;
  isNewAccount: boolean;
  temporaryPassword?: string;
  loginUrl: string;
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
  sendPortalPasswordReset?(message: {
    recipient: string;
    recipientName: string;
    resetUrl: string;
    expiresInHours: number;
    clinicName: string;
  }): Promise<boolean>;
  sendStaffInvitation?(message: StaffInvitationEmail): Promise<boolean>;
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
    const subject = `${message.clinicName} vous invite sur votre espace patient`;

    const htmlContent = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(subject)}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #F6F3EC; font-family: 'Manrope', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased; color: #17201E;">
  <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #F6F3EC; padding: 36px 16px;">
    <tr>
      <td align="center">
        <!-- Main Card Container -->
        <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 580px; margin: 0 auto; background-color: #FFFEFB; border-radius: 16px; overflow: hidden; border: 1px solid #DCE2DE; box-shadow: 0 12px 36px rgba(13, 41, 37, 0.07);">

          <!-- Top Header with Deep Pine Gradient -->
          <tr>
            <td style="background: linear-gradient(135deg, #0D2925 0%, #173F38 100%); padding: 32px 36px; text-align: center; border-bottom: 3px solid #C86445;">
              <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0">
                <tr>
                  <td align="center">
                    <div style="display: inline-block; background: rgba(255, 254, 251, 0.08); border: 1px solid rgba(255, 254, 251, 0.16); border-radius: 12px; padding: 9px 22px; margin-bottom: 6px;">
                      <span style="font-size: 22px; font-weight: 700; color: #FFFEFB; letter-spacing: -0.3px;">${clinic}<span style="color: #C86445;">.</span></span>
                    </div>
                    <div style="font-size: 12px; color: #DCE2DE; font-weight: 500; letter-spacing: 0.6px; text-transform: uppercase;">Cabinet Dentaire & Orthodontie</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Main Content -->
          <tr>
            <td style="padding: 36px 36px 28px 36px; text-align: left;">
              <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0">
                <tr>
                  <td>
                    <!-- Badge Pill -->
                    <span style="display: inline-block; background-color: #F7EBE8; color: #A94830; border: 1px solid #F3D2C9; font-size: 12px; font-weight: 700; padding: 5px 14px; border-radius: 20px; text-transform: uppercase; letter-spacing: 0.4px; margin-bottom: 16px;">
                      ✨ Espace Patient & Famille
                    </span>

                    <!-- Main Headline -->
                    <h1 style="margin: 0 0 14px 0; font-size: 22px; font-weight: 700; color: #0D2925; line-height: 1.35;">
                      Votre espace personnel de suivi en ligne
                    </h1>

                    <!-- Body Paragraph -->
                    <p style="margin: 0 0 16px 0; font-size: 15px; color: #56635F; line-height: 1.65;">
                      Bonjour <strong>${name}</strong>,<br>
                      Le cabinet <strong>${clinic}</strong> vous invite à activer votre espace privé sécurisé OrthoFlow afin de consulter les rendez-vous, soins et documents en toute simplicité.
                    </p>

                    <!-- CTA Button -->
                    <table role="presentation" border="0" cellspacing="0" cellpadding="0" style="margin: 28px 0 20px 0; width: 100%;">
                      <tr>
                        <td align="center">
                          <a href="${url}" style="display: inline-block; background-color: #173F38; color: #FFFFFF; font-weight: 700; font-size: 15px; padding: 14px 32px; border-radius: 10px; text-decoration: none; box-shadow: 0 4px 14px rgba(23, 63, 56, 0.22); letter-spacing: 0.2px;">
                            Activer mon espace privé →
                          </a>
                        </td>
                      </tr>
                    </table>

                    <!-- Security Notice Box -->
                    <div style="background-color: #F6F3EC; border-left: 3px solid #173F38; border-radius: 0 8px 8px 0; padding: 14px 18px; margin: 22px 0 10px 0;">
                      <p style="margin: 0; font-size: 13px; color: #56635F; line-height: 1.55;">
                        🔒 <strong>Lien sécurisé :</strong> Ce lien d'accès personnel expire dans <strong>${message.expiresInHours} heures</strong>. Ne le partagez avec personne.
                      </p>
                    </div>

                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #F6F3EC; padding: 24px 36px; text-align: center; border-top: 1px solid #DCE2DE;">
              <p style="margin: 0 0 6px 0; font-size: 13px; font-weight: 600; color: #173F38;">
                ${clinic} · OrthoFlow
              </p>
              <p style="margin: 0; font-size: 12px; color: #73847F; line-height: 1.45;">
                Message automatique et confidentiel transmis par votre cabinet dentaire.
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
      text: `Bonjour ${message.recipientName},\n\n${message.clinicName} vous invite à consulter votre suivi médical sur votre espace privé OrthoFlow. Activez votre accès : ${message.activationUrl}\n\nCe lien sécurisé expire dans ${message.expiresInHours} heures.`,
      html: htmlContent,
    });
    return true;
  }

  async sendPortalPasswordReset(message: {
    recipient: string;
    recipientName: string;
    resetUrl: string;
    expiresInHours: number;
    clinicName: string;
  }): Promise<boolean> {
    if (!this.transporter || env.SMTP_FROM_ADDRESS === '') return false;
    const name = escapeHtml(message.recipientName);
    const clinic = escapeHtml(message.clinicName);
    const url = escapeHtml(message.resetUrl);
    const subject = `Réinitialisation de votre mot de passe · Portail Famille ${message.clinicName}`;

    const htmlContent = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(subject)}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #FBF9F5; font-family: 'Manrope', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased; color: #17201E;">
  <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #FBF9F5; padding: 36px 16px;">
    <tr>
      <td align="center">
        <!-- Main Card Container -->
        <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 580px; margin: 0 auto; background-color: #FFFFFF; border-radius: 18px; overflow: hidden; border: 1px solid #DCE6E1; box-shadow: 0 16px 40px rgba(13, 41, 37, 0.08);">

          <!-- Top Header with Deep Emerald Gradient -->
          <tr>
            <td style="background: linear-gradient(135deg, #0C332B 0%, #175447 100%); padding: 32px 36px; text-align: center; border-bottom: 3px solid #10B981;">
              <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0">
                <tr>
                  <td align="center">
                    <div style="display: inline-block; background: rgba(255, 255, 255, 0.1); border: 1px solid rgba(255, 255, 255, 0.18); border-radius: 12px; padding: 9px 24px; margin-bottom: 6px;">
                      <span style="font-size: 22px; font-weight: 800; color: #FFFFFF; letter-spacing: -0.3px;">${clinic}</span>
                    </div>
                    <div style="font-size: 12px; color: #D1EAE4; font-weight: 600; letter-spacing: 0.6px; text-transform: uppercase;">Portail Patient & Famille OrthoFlow</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Main Content -->
          <tr>
            <td style="padding: 36px 36px 28px 36px; text-align: left;">
              <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0">
                <tr>
                  <td>
                    <!-- Badge Pill -->
                    <span style="display: inline-block; background-color: #ECFDF5; color: #065F46; border: 1px solid #A7F3D0; font-size: 12px; font-weight: 700; padding: 5px 14px; border-radius: 20px; text-transform: uppercase; letter-spacing: 0.4px; margin-bottom: 16px;">
                      🔑 Réinitialisation de sécurité
                    </span>

                    <!-- Main Headline -->
                    <h1 style="margin: 0 0 14px 0; font-size: 22px; font-weight: 800; color: #0C332B; line-height: 1.35;">
                      Nouveau mot de passe de votre espace famille
                    </h1>

                    <!-- Body Paragraph -->
                    <p style="margin: 0 0 16px 0; font-size: 15px; color: #52635D; line-height: 1.65;">
                      Bonjour <strong>${name}</strong>,<br>
                      Une demande de réinitialisation de mot de passe a été initiée pour votre compte Portail Famille auprès du cabinet <strong>${clinic}</strong>.
                    </p>

                    <!-- CTA Button -->
                    <table role="presentation" border="0" cellspacing="0" cellpadding="0" style="margin: 28px 0 20px 0; width: 100%;">
                      <tr>
                        <td align="center">
                          <a href="${url}" style="display: inline-block; background: linear-gradient(135deg, #0C332B 0%, #175447 100%); color: #FFFFFF; font-weight: 700; font-size: 15px; padding: 15px 34px; border-radius: 12px; text-decoration: none; box-shadow: 0 6px 18px rgba(12, 51, 43, 0.25); letter-spacing: 0.2px;">
                            Choisir mon nouveau mot de passe →
                          </a>
                        </td>
                      </tr>
                    </table>

                    <!-- Security Notice Box -->
                    <div style="background-color: #F8FAF9; border-left: 3.5px solid #0C332B; border-radius: 0 10px 10px 0; padding: 14px 18px; margin: 24px 0 10px 0;">
                      <p style="margin: 0; font-size: 13px; color: #52635D; line-height: 1.55;">
                        🔒 <strong>Lien sécurisé :</strong> Ce lien à usage unique expire dans <strong>${message.expiresInHours} heures</strong>. Si vous n'êtes pas à l'origine de cette demande, vous pouvez ignorer cet e-mail en toute sécurité.
                      </p>
                    </div>

                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #F8FAF9; padding: 24px 36px; text-align: center; border-top: 1px solid #E2EAE6;">
              <p style="margin: 0 0 6px 0; font-size: 13px; font-weight: 700; color: #0C332B;">
                ${clinic} · OrthoFlow Famille
              </p>
              <p style="margin: 0; font-size: 12px; color: #768782; line-height: 1.45;">
                Accès privé et sécurisé pour le suivi des soins orthodontiques.
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
      text: `Bonjour ${message.recipientName},\n\nPour réinitialiser votre mot de passe pour le Portail Famille ${message.clinicName}, cliquez sur le lien suivant : ${message.resetUrl}\n\nCe lien expire dans ${message.expiresInHours} heures.`,
      html: htmlContent,
    });
    return true;
  }

  async sendStaffInvitation(message: StaffInvitationEmail): Promise<boolean> {
    if (!this.transporter || env.SMTP_FROM_ADDRESS === '') return false;
    const name = escapeHtml(message.recipientName);
    const clinic = escapeHtml(message.clinicName);
    const invitedBy = escapeHtml(message.invitedByName);
    const role = escapeHtml(message.roleName);
    const url = escapeHtml(message.loginUrl);
    const recipient = escapeHtml(message.recipient);
    const password = message.temporaryPassword ? escapeHtml(message.temporaryPassword) : null;
    const subject = `Invitation à rejoindre l'équipe de ${message.clinicName} · OrthoFlow`;

    const credentialsBox = message.isNewAccount && password
      ? `
        <!-- Credentials Card Box -->
        <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #F0F4F2; border: 1.5px dashed #173F38; border-radius: 14px; margin: 24px 0 24px 0; overflow: hidden;">
          <tr>
            <td style="padding: 22px 24px;">
              <div style="font-size: 12px; text-transform: uppercase; letter-spacing: 1.2px; color: #173F38; font-weight: 800; margin-bottom: 12px;">
                🔐 Vos identifiants de connexion
              </div>
              <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0">
                <tr>
                  <td style="padding: 5px 0; font-size: 14px; color: #56635F; width: 140px;">Identifiant (E-mail) :</td>
                  <td style="padding: 5px 0; font-size: 14px; font-weight: 700; color: #0D2925;">${recipient}</td>
                </tr>
                <tr>
                  <td style="padding: 5px 0; font-size: 14px; color: #56635F;">Mot de passe temporaire :</td>
                  <td style="padding: 5px 0; font-size: 15px; font-weight: 800; color: #C86445; font-family: monospace, 'Courier New', sans-serif; letter-spacing: 0.5px;">${password}</td>
                </tr>
              </table>
            </td>
          </tr>
        </table>`
      : `
        <!-- Existing Account Box -->
        <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #F0F4F2; border: 1px solid #173F38; border-radius: 12px; margin: 20px 0 24px 0; overflow: hidden;">
          <tr>
            <td style="padding: 16px 20px;">
              <p style="margin: 0; font-size: 14px; color: #0D2925; line-height: 1.5;">
                ℹ️ <strong>Compte déjà actif :</strong> Vous pouvez vous connecter directement avec votre adresse <strong>${recipient}</strong> et votre mot de passe habituel pour accéder aux dossiers du cabinet.
              </p>
            </td>
          </tr>
        </table>`;

    const htmlContent = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(subject)}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #F6F3EC; font-family: 'Manrope', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased; color: #17201E;">
  <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #F6F3EC; padding: 36px 16px;">
    <tr>
      <td align="center">
        <!-- Main Card Container -->
        <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 580px; margin: 0 auto; background-color: #FFFEFB; border-radius: 16px; overflow: hidden; border: 1px solid #DCE2DE; box-shadow: 0 12px 36px rgba(13, 41, 37, 0.07);">

          <!-- Top Header with Deep Pine Gradient -->
          <tr>
            <td style="background: linear-gradient(135deg, #0D2925 0%, #173F38 100%); padding: 32px 36px; text-align: center; border-bottom: 3px solid #C86445;">
              <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0">
                <tr>
                  <td align="center">
                    <div style="display: inline-block; background: rgba(255, 254, 251, 0.08); border: 1px solid rgba(255, 254, 251, 0.16); border-radius: 12px; padding: 9px 22px; margin-bottom: 6px;">
                      <span style="font-size: 22px; font-weight: 700; color: #FFFEFB; letter-spacing: -0.3px;">${clinic}<span style="color: #C86445;">.</span></span>
                    </div>
                    <div style="font-size: 12px; color: #DCE2DE; font-weight: 500; letter-spacing: 0.6px; text-transform: uppercase;">Cabinet Dentaire & Orthodontie</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Main Content -->
          <tr>
            <td style="padding: 36px 36px 28px 36px; text-align: left;">
              <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0">
                <tr>
                  <td>
                    <!-- Badge Pill -->
                    <span style="display: inline-block; background-color: #F7EBE8; color: #A94830; border: 1px solid #F3D2C9; font-size: 12px; font-weight: 700; padding: 5px 14px; border-radius: 20px; text-transform: uppercase; letter-spacing: 0.4px; margin-bottom: 16px;">
                      ✨ Invitation Cabinet & Équipe
                    </span>

                    <!-- Main Headline -->
                    <h1 style="margin: 0 0 14px 0; font-size: 22px; font-weight: 800; color: #0D2925; line-height: 1.35;">
                      Bienvenue dans l'équipe de ${clinic}
                    </h1>

                    <!-- Body Paragraph -->
                    <p style="margin: 0 0 16px 0; font-size: 15px; color: #56635F; line-height: 1.65;">
                      Bonjour <strong>${name}</strong>,<br>
                      <strong>${invitedBy}</strong> vous invite à rejoindre le cabinet <strong>${clinic}</strong> avec le rôle de <strong>${role}</strong> sur l'espace praticien et équipe OrthoFlow.
                    </p>

                    ${credentialsBox}

                    <!-- CTA Button -->
                    <table role="presentation" border="0" cellspacing="0" cellpadding="0" style="margin: 28px 0 20px 0; width: 100%;">
                      <tr>
                        <td align="center">
                          <a href="${url}" style="display: inline-block; background: linear-gradient(135deg, #0D2925 0%, #173F38 100%); color: #FFFFFF; font-weight: 700; font-size: 15px; padding: 15px 36px; border-radius: 12px; text-decoration: none; box-shadow: 0 6px 18px rgba(13, 41, 37, 0.22); letter-spacing: 0.2px;">
                            Accéder à l'espace cabinet →
                          </a>
                        </td>
                      </tr>
                    </table>

                    <!-- Security Notice Box -->
                    <div style="background-color: #F6F3EC; border-left: 3.5px solid #173F38; border-radius: 0 8px 8px 0; padding: 14px 18px; margin: 22px 0 10px 0;">
                      <p style="margin: 0; font-size: 13px; color: #56635F; line-height: 1.55;">
                        🔒 <strong>Sécurité &amp; Activation :</strong> Lors de votre première connexion, un code de vérification à 6 chiffres envoyé à votre adresse e-mail vous sera demandé pour activer définitivement votre accès.
                      </p>
                    </div>

                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #F6F3EC; padding: 24px 36px; text-align: center; border-top: 1px solid #DCE2DE;">
              <p style="margin: 0 0 6px 0; font-size: 13px; font-weight: 600; color: #173F38;">
                ${clinic} · OrthoFlow Pro
              </p>
              <p style="margin: 0; font-size: 12px; color: #73847F; line-height: 1.45;">
                Accès réservé aux praticiens et au personnel autorisé du cabinet.
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
      text: `Bonjour ${message.recipientName},\n\n${message.invitedByName} vous invite à rejoindre le cabinet ${message.clinicName} (${message.roleName}) sur OrthoFlow.\n\nAccédez à votre espace : ${message.loginUrl}\n${message.temporaryPassword ? `Mot de passe temporaire : ${message.temporaryPassword}\n` : ''}`,
      html: htmlContent,
    });
    return true;
  }
}

export const emailService = new SmtpEmailService();
