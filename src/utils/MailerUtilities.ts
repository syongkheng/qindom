import nodemailer from 'nodemailer'

// ─────────────────────────────────────────────────────────────────────────────
// Configuration
// Set SMTP_USER and SMTP_PASS in your .env file:
//   SMTP_USER=your-gmail-address@gmail.com
//   SMTP_PASS=your-16-character-app-password
// ─────────────────────────────────────────────────────────────────────────────

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
})

export interface MailOptions {
  to: string | string[]
  subject: string
  text?: string
  html?: string
}

export class MailerUtilities {
  static async sendMail(options: MailOptions): Promise<void> {
    await transporter.sendMail({
      from: `"no-reply-awense" <${process.env.SMTP_USER}>`,
      to: Array.isArray(options.to) ? options.to.join(', ') : options.to,
      subject: options.subject,
      text: options.text,
      html: options.html,
    })
  }

  static async verifyConnection(): Promise<boolean> {
    try {
      await transporter.verify()
      return true
    } catch {
      return false
    }
  }
}
