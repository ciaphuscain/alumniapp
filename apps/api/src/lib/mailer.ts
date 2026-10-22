export interface MailMessage {
  to: string;
  subject: string;
  text: string;
}

export interface Mailer {
  send(msg: MailMessage): Promise<void>;
}

/**
 * Development/test mailer: keeps messages in memory (exposed through the dev-only
 * mailbox route) and logs a one-line notice without the message body, since bodies
 * contain single-use tokens.
 */
export class MemoryMailer implements Mailer {
  readonly sent: MailMessage[] = [];
  constructor(private readonly log: (msg: string) => void = () => {}) {}
  async send(msg: MailMessage): Promise<void> {
    this.sent.push(msg);
    if (this.sent.length > 500) this.sent.shift();
    this.log(`mail queued: "${msg.subject}"`);
  }
  latestFor(to: string): MailMessage | undefined {
    return this.sent.filter((m) => m.to === to.toLowerCase()).at(-1);
  }
}
