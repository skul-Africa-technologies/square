export interface VerificationEmailData {
  code: string;
  email: string;
  expiresInMinutes: number;
  assetBaseUrl: string;
  verifyUrl?: string;
}

const FONT = "'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

/**
 * Splits a 6-digit code into six table cells (with spacers) for the boxed
 * display. If the code is not exactly 6 digits, falls back to a single cell
 * showing the whole code. Purely presentational — the code value is unchanged.
 */
export function codeCells(code: string): string {
  const digits = /^[0-9]{6}$/.test(code) ? code.split("") : [code];
  const cell = (value: string) =>
    `<td width="38" height="52" align="center" bgcolor="#0a0e0c" style="width:38px;height:52px;background-color:#0a0e0c;border:1px solid #2a6b8c;border-radius:12px;font-family:${FONT};font-size:22px;font-weight:700;color:#a6ff1a;">${value}</td>`;
  const spacer = `<td width="6" style="width:6px;font-size:0;line-height:0;">&nbsp;</td>`;
  return digits.map(cell).join(spacer);
}

export function verificationEmailText(data: VerificationEmailData): string {
  return [
    `Your Square sign-in code is ${data.code}. It expires in ${data.expiresInMinutes} minutes.`,
    `We sent this code to ${data.email}. Enter it in Square to continue.`,
    "Never share this code with anyone. Square will never ask you for it.",
    "Didn't request this? You can safely ignore this email, and no one can log in without the code.",
  ].join("\n");
}

export function verificationEmailHtml(data: VerificationEmailData): string {
  const { code, email, expiresInMinutes, assetBaseUrl, verifyUrl } = data;
  const base = assetBaseUrl.replace(/\/$/, "");
  const cells = codeCells(code);

  const buttonRow = verifyUrl
    ? `<tr><td align="center" style="padding:18px 28px 4px 28px;">
<!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" href="${verifyUrl}" style="height:46px;v-text-anchor:middle;width:240px;" arcsize="22%" stroke="f" fillcolor="#a6ff1a"><w:anchorlock/><center style="color:#0a0e0c;font-family:Arial,sans-serif;font-size:15px;font-weight:bold;">Verify and log in</center></v:roundrect><![endif]-->
<!--[if !mso]><!-->
<a href="${verifyUrl}" style="display:inline-block;background-color:#a6ff1a;color:#0a0e0c;font-family:${FONT};font-size:15px;font-weight:700;text-decoration:none;padding:13px 34px;border-radius:12px;">Verify and log in</a>
<!--<![endif]-->
</td></tr>`
    : "";

  return `<!doctype html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="dark light">
<meta name="supported-color-schemes" content="dark light">
<title>Your Square verification code</title>
</head>
<body style="margin:0;padding:0;background-color:#070a09;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#070a09;font-size:1px;line-height:1px;">Your Square code is ${code}. It expires in ${expiresInMinutes} minutes.&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#070a09" style="background-color:#070a09;">
<tr><td align="center" style="padding:28px 12px;">

<table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" bgcolor="#0f1512" style="width:100%;max-width:560px;background-color:#0f1512;border:1px solid #222c27;border-top:2px solid #38c0ff;border-left:2px solid #38c0ff;border-radius:26px 16px 16px 16px;">

<tr><td style="padding:26px 28px 0 28px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr>
<td valign="middle" style="font-family:${FONT};font-size:18px;font-weight:700;color:#e6ece8;"><img src="${base}/email/square-logo.png" width="36" height="40" alt="" style="display:inline-block;vertical-align:middle;border:0;margin-right:10px;">Square</td>
<td align="right" valign="middle"><img src="${base}/email/robot-verify.png" width="72" height="72" alt="Square robot" style="display:block;border:0;border-radius:16px;"></td></tr></table>
</td></tr>

<tr><td style="padding:18px 28px 0 28px;font-family:${FONT};">
<h1 style="margin:0;font-size:26px;line-height:1.25;font-weight:600;color:#ffffff;">Verify and log in</h1>
<p style="margin:10px 0 0 0;font-size:15px;line-height:1.5;color:#9aa8a0;">We sent this code to <span style="color:#e6ece8;">${email}</span>. Enter it in Square to continue. It expires in ${expiresInMinutes} minutes.</p>
</td></tr>

<tr><td align="center" style="padding:24px 10px 6px 10px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
${cells}
</tr></table>
</td></tr>
${buttonRow}
<tr><td style="padding:22px 28px 0 28px;font-family:${FONT};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#12303f" style="background-color:#12303f;border:1px solid #2a6b8c;border-radius:12px;"><tr>
<td style="padding:12px 14px;font-size:13px;line-height:1.5;color:#bfe6f7;">Never share this code with anyone. Square will never ask you for it.</td>
</tr></table>
<p style="margin:14px 0 0 0;font-size:13px;line-height:1.5;color:#7f8c85;">Didn&rsquo;t request this? You can safely ignore this email, and no one can log in without the code.</p>
</td></tr>

<tr><td style="padding:22px 28px 26px 28px;font-family:${FONT};">
<div style="border-top:1px solid #222c27;padding-top:14px;font-size:12px;line-height:1.5;color:#7f8c85;"><span style="color:#a6ff1a;font-weight:600;">Square</span> &middot; Your campus, connected.</div>
</td></tr>

</table>
</td></tr></table>
</body></html>`;
}