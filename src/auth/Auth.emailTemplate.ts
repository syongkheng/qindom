import { MailOptions, MailerUtilities } from "../utils/MailerUtilities.js";

// Pure builders for the auth emails, so tests can check recipients and escaping without SMTP.
// Each one takes plain text and escapes it itself.

const esc = MailerUtilities.escapeHtml;

const PASSWORD_CHANGED_SUBJECT = "Your Awense password has been changed";

/** Registration / resend email. `code` is the plain 6-digit OTP (only its SHA-256 is stored). */
export function verificationCodeMail(to: string, username: string, code: string, ttlMinutes: number): MailOptions {
  return {
    to,
    subject: `${code} is your verification code`,
    html: `
      <p>Hi <strong>${esc(username)}</strong>,</p>
      <p>Your verification code is:</p>
      <h2 style="letter-spacing:0.2em;">${esc(code)}</h2>
      <p>This code expires in <strong>${ttlMinutes} minutes</strong>. Do not share it with anyone.</p>
      <p>— no-reply</p>
    `,
  };
}

/**
 * Security notice sent after a password change. No timestamp: the backend deals in epoch ms only and
 * leaves time display to the client, so the email never shows a time in the server's timezone.
 */
export function passwordChangedMail(to: string, username: string): MailOptions {
  return {
    to,
    subject: PASSWORD_CHANGED_SUBJECT,
    html: `
      <p>Hi <strong>${esc(username)}</strong>,</p>
      <p>Your password was successfully changed.</p>
      <p>If you did not make this change, please contact us immediately and secure your account.</p>
      <p>— no-reply</p>
    `,
  };
}
