import {
  emailService,
  type EmailServiceContract,
} from '../../infrastructure/email/email.service.js';
import {
  ChannelDeliveryError,
  COMMUNICATION_CHANNELS,
  type ChannelSendRequest,
  type ChannelSendResult,
  type CommunicationChannel,
} from './communication.types.js';

export interface ChannelAdapter {
  readonly channel: CommunicationChannel;
  configured(): boolean;
  send(request: ChannelSendRequest): Promise<ChannelSendResult>;
}

export class EmailChannelAdapter implements ChannelAdapter {
  readonly channel = COMMUNICATION_CHANNELS.EMAIL;
  constructor(private readonly email: EmailServiceContract = emailService) {}
  configured(): boolean {
    return this.email.isConfigured?.() ?? false;
  }
  async send(request: ChannelSendRequest): Promise<ChannelSendResult> {
    if (!request.subject)
      throw new ChannelDeliveryError('Email subject is required', 'TEMPLATE_INVALID', true);
    if (!this.configured())
      throw new ChannelDeliveryError('SMTP is not configured', 'PROVIDER_NOT_CONFIGURED', true);
    try {
      const result = await this.email.sendTransactional!({
        recipient: request.destination,
        subject: request.subject,
        text: request.text,
        html: request.html,
      });
      return { providerMessageId: result.messageId, acceptedAt: new Date() };
    } catch (error) {
      if (error instanceof ChannelDeliveryError) throw error;
      const code =
        typeof error === 'object' && error && 'code' in error
          ? String(error.code)
          : 'SMTP_TEMPORARY_FAILURE';
      const permanent = ['EENVELOPE', 'EMESSAGE'].includes(code);
      throw new ChannelDeliveryError('SMTP delivery failed', code, permanent);
    }
  }
}

class DisabledChannelAdapter implements ChannelAdapter {
  constructor(readonly channel: CommunicationChannel) {}
  configured(): boolean {
    return false;
  }
  async send(_request: ChannelSendRequest): Promise<ChannelSendResult> {
    throw new ChannelDeliveryError(
      `${this.channel} provider is not configured`,
      'PROVIDER_NOT_CONFIGURED',
      true,
    );
  }
}

const adapters: ReadonlyMap<CommunicationChannel, ChannelAdapter> = new Map([
  [COMMUNICATION_CHANNELS.EMAIL, new EmailChannelAdapter()],
  [COMMUNICATION_CHANNELS.SMS, new DisabledChannelAdapter(COMMUNICATION_CHANNELS.SMS)],
  [COMMUNICATION_CHANNELS.WHATSAPP, new DisabledChannelAdapter(COMMUNICATION_CHANNELS.WHATSAPP)],
]);

export const channelAdapterRegistry = {
  get(channel: CommunicationChannel): ChannelAdapter {
    const adapter = adapters.get(channel);
    if (!adapter)
      throw new ChannelDeliveryError(
        'Unsupported communication channel',
        'CHANNEL_UNSUPPORTED',
        true,
      );
    return adapter;
  },
  status(): Record<CommunicationChannel, boolean> {
    return Object.fromEntries(
      [...adapters].map(([channel, adapter]) => [channel, adapter.configured()]),
    ) as Record<CommunicationChannel, boolean>;
  },
};
