/** Public legal pages required by Google Play: privacy policy and an account/data deletion page. */
const CONTACT = process.env.SUPPORT_EMAIL || 'support@paisaduniya.in';
const UPDATED = '6 November 2026';

const page = (title: string, body: string) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} – Paisa</title>
<style>:root{color-scheme:light dark}body{font:16px/1.6 system-ui,sans-serif;max-width:720px;margin:0 auto;padding:24px 16px 64px}h1{font-size:26px}h2{font-size:18px;margin-top:28px}small{opacity:.7}</style></head>
<body><h1>${title}</h1><small>Last updated: ${UPDATED}</small>${body}</body></html>`;

export const privacyHtml = () => page('Privacy Policy', `
<p>Paisa (“the app”, package <code>in.paisa.tracker</code>) is a personal expense tracker. This policy explains what we collect and why.</p>
<h2>What we collect</h2>
<ul>
<li><b>Account details</b>: your name, email address (verified with a one-time code), optional mobile number, optional profile photo, and a salted password hash. We never store your password.</li>
<li><b>One-time codes</b>: sign-up, email-change and password-reset codes are emailed to you, stored only as a hash, and expire after 10 minutes.</li>
<li><b>Transactions</b>: amount, date and time, direction (debit/credit), merchant or payee name, category, and the source (manual, payment-app notification). These are backed up to your account so you can restore them on a new phone.</li>
<li><b>Payment-app notifications</b> (only if you enable Notification Access): the app reads payment notifications from Google Pay, PhonePe, Paytm and BHIM to detect payments and tag the app used. Only the parsed transaction is kept. Other notifications are ignored and not stored.</li>
<li><b>Bank SMS</b> (only in the directly distributed version, not on Google Play): messages are read on your device to extract debit/credit alerts. OTPs are ignored and message text is not uploaded.</li>
</ul>
<h2>What we do not do</h2>
<ul><li>We do not sell or share your data with advertisers or third parties, and we show no ads.</li>
<li>We do not read contacts, photos, location or files.</li></ul>
<h2>How data is protected</h2>
<p>All traffic uses HTTPS. Passwords are hashed. The app can be locked with your fingerprint or face. Data on the device is kept in app-private storage.</p>
<h2>Retention and deletion</h2>
<p>Your data is kept until you delete it. In the app go to <b>Profile → Delete all my data</b> to permanently remove your account and every transaction from our server and your phone. You can also request deletion at <a href="/delete-account">/delete-account</a>.</p>
<h2>Children</h2><p>The app is not directed to children under 13.</p>
<h2>Contact</h2><p>Questions or requests: <a href="mailto:${CONTACT}">${CONTACT}</a>.</p>`);

export const deleteHtml = () => page('Delete your Paisa account', `
<p>You can delete your account and all associated data at any time.</p>
<h2>In the app</h2><ol><li>Open Paisa → <b>Profile</b>.</li><li>Tap <b>Delete all my data</b> and confirm.</li></ol>
<p>This permanently removes your account and every transaction from our servers and from your phone, immediately.</p>
<h2>Can’t open the app?</h2>
<p>Email <a href="mailto:${CONTACT}">${CONTACT}</a> from the address or number you registered with, subject “Delete my account”. We will delete your data within 7 days.</p>`);
