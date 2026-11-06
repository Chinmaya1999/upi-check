import nodemailer from 'nodemailer';

/**
 * Outgoing email (OTP codes). Configure with env vars — never hard-code credentials:
 *   SMTP_USER   Gmail address that sends the mail
 *   SMTP_PASS   Gmail *app password* (Google Account → Security → App passwords)
 * Optional: SMTP_HOST (default smtp.gmail.com), SMTP_PORT (465), MAIL_FROM_NAME (Paisa).
 * Without SMTP_USER/SMTP_PASS the code is printed to the server log instead (local development only).
 */
const FROM_NAME = process.env.MAIL_FROM_NAME || 'Paisa';
const user = process.env.SMTP_USER;
const pass = (process.env.SMTP_PASS || '').replace(/\s+/g, '');

const transport = user && pass
  ? nodemailer.createTransport({ host: process.env.SMTP_HOST || 'smtp.gmail.com', port: Number(process.env.SMTP_PORT || 465), secure: true, auth: { user, pass } })
  : null;

export const mailConfigured = !!transport;

export type OtpPurpose = 'register' | 'reset' | 'change_email';

const COPY: Record<OtpPurpose, { subject: string; title: string; lead: string; icon: string }> = {
  register: { subject: 'Verify your email to join Paisa', title: 'Verify your email', lead: 'Welcome to Paisa! Enter this code in the app to finish creating your account.', icon: '✉' },
  reset: { subject: 'Reset your Paisa password', title: 'Reset your password', lead: 'We got a request to reset your Paisa password. Enter this code in the app to choose a new one.', icon: '🔑' },
  change_email: { subject: 'Confirm your new email for Paisa', title: 'Confirm your new email', lead: 'Enter this code in the app to confirm this address for your Paisa account.', icon: '✉' },
};

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

/** Table-based, inline-styled HTML so it renders the same in Gmail, Outlook and Apple Mail (light and dark). */
export function otpEmail(purpose: OtpPurpose, code: string, name: string | undefined, minutes: number) {
  const c = COPY[purpose];
  const hello = name ? `Hi ${esc(name.split(' ')[0]!)},` : 'Hi,';
  const digits = code.split('').map((d) =>
    `<td style="padding:0 4px"><div style="width:44px;height:56px;line-height:56px;text-align:center;font:700 28px/56px 'SF Mono',Menlo,Consolas,monospace;color:#0B1220;background:#ECFDF5;border:1.5px solid #A7F3D0;border-radius:12px">${d}</div></td>`).join('');
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${esc(c.subject)}</title></head>
<body style="margin:0;padding:0;background:#EEF2F6">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">Your Paisa code is ${code}. It expires in ${minutes} minutes.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#EEF2F6"><tr><td align="center" style="padding:28px 12px">
 <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#FFFFFF;border-radius:20px;overflow:hidden;box-shadow:0 8px 30px rgba(11,18,32,.10)">
  <tr><td style="background:#0B1220;background-image:linear-gradient(135deg,#0B1220 0%,#0F2A22 100%);padding:28px 32px">
    <table role="presentation" cellpadding="0" cellspacing="0"><tr>
      <td style="width:40px;height:40px;background:#10B981;border-radius:12px;text-align:center;font:800 22px/40px -apple-system,Segoe UI,Roboto,sans-serif;color:#052E1F">₹</td>
      <td style="padding-left:12px;font:800 24px/1 -apple-system,Segoe UI,Roboto,sans-serif;color:#FFFFFF;letter-spacing:-.5px">Paisa</td>
    </tr></table>
    <div style="margin-top:18px;font:500 13px/1.4 -apple-system,Segoe UI,Roboto,sans-serif;color:#6EE7B7">Every rupee, one clear view</div>
  </td></tr>
  <tr><td style="padding:34px 32px 8px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
    <div style="font-size:26px;line-height:1.2;font-weight:800;color:#0B1220;letter-spacing:-.6px">${c.title}</div>
    <p style="margin:14px 0 0;font-size:16px;line-height:1.6;color:#334155">${hello}<br>${c.lead}</p>
  </td></tr>
  <tr><td align="center" style="padding:22px 32px 6px">
    <table role="presentation" cellpadding="0" cellspacing="0"><tr>${digits}</tr></table>
    <div style="margin-top:14px;font:600 13px/1.4 -apple-system,Segoe UI,Roboto,sans-serif;color:#047857">⏱ Expires in ${minutes} minutes</div>
  </td></tr>
  <tr><td style="padding:22px 32px 30px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
    <div style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:12px;padding:14px 16px;font-size:13.5px;line-height:1.6;color:#475569">
      <b style="color:#0B1220">Keep it private.</b> Paisa will never call or message you asking for this code. If you didn’t request it, you can safely ignore this email — nothing will change.
    </div>
  </td></tr>
  <tr><td style="padding:18px 32px 26px;background:#F8FAFC;border-top:1px solid #E2E8F0;font:12.5px/1.6 -apple-system,Segoe UI,Roboto,sans-serif;color:#64748B;text-align:center">
    Sent by Paisa · your personal expense tracker<br>This is an automated message, please don’t reply.
  </td></tr>
 </table>
</td></tr></table></body></html>`;
  const text = `${c.title}\n\n${hello}\n${c.lead}\n\nYour code: ${code}\nIt expires in ${minutes} minutes.\n\nPaisa will never ask you for this code. If you didn't request it, ignore this email.\n— Paisa`;
  return { subject: c.subject, html, text };
}

export async function sendOtp(to: string, purpose: OtpPurpose, code: string, name?: string, minutes = 10): Promise<void> {
  const m = otpEmail(purpose, code, name, minutes);
  if (!transport) { console.log(`[mail disabled] ${purpose} code for ${to}: ${code}`); return; }
  await transport.sendMail({ from: `"${FROM_NAME}" <${user}>`, to, subject: m.subject, html: m.html, text: m.text });
}

/** "Was this you?" alerts after sensitive account changes, sent to the (old) email on file. */
export async function sendNotice(to: string, kind: 'password_changed' | 'email_changed', detail?: string): Promise<void> {
  const c = kind === 'password_changed'
    ? { subject: 'Your Paisa password was changed', title: 'Password changed', body: 'The password for your Paisa account was just changed, and you were signed out on all devices.' }
    : { subject: 'Your Paisa email was changed', title: 'Email changed', body: `The email on your Paisa account was just changed to ${esc(detail ?? 'a new address')}.` };
  const html = `<!doctype html><html><body style="margin:0;background:#EEF2F6"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:28px 12px">
<table role="presentation" width="100%" style="max-width:520px;background:#fff;border-radius:20px;overflow:hidden;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif">
<tr><td style="background:#0B1220;padding:24px 32px;color:#fff;font:800 22px/1 -apple-system,Segoe UI,Roboto,sans-serif"><span style="display:inline-block;width:36px;height:36px;line-height:36px;text-align:center;background:#10B981;color:#052E1F;border-radius:10px;margin-right:10px">₹</span>Paisa</td></tr>
<tr><td style="padding:30px 32px"><div style="font-size:24px;font-weight:800;color:#0B1220">${c.title}</div>
<p style="font-size:16px;line-height:1.6;color:#334155">${c.body}</p>
<div style="background:#FEF2F2;border:1px solid #FECACA;border-radius:12px;padding:14px 16px;font-size:14px;line-height:1.6;color:#7F1D1D"><b>Wasn’t you?</b> Reset your password right away from the app (Log in → Forgot password) and contact support.</div></td></tr>
<tr><td style="padding:16px 32px;background:#F8FAFC;font-size:12.5px;color:#64748B;text-align:center">Automated security message from Paisa.</td></tr></table></td></tr></table></body></html>`;
  const text = `${c.title}\n\n${c.body.replace(/&amp;/g, '&')}\n\nWasn't you? Reset your password from the app right away.`;
  if (!transport) { console.log(`[mail disabled] ${kind} notice for ${to}`); return; }
  try { await transport.sendMail({ from: `"${FROM_NAME}" <${user}>`, to, subject: c.subject, html, text }); } catch (e) { console.error('notice mail failed', e); }
}
