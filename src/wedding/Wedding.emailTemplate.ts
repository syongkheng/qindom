// Shared HTML shell for the wedding emails, styled after the website's theme
// (see jessikheng/src/theme.js): warm cream page, white card, gold accents,
// sage green details and a serif face.
//
// Email clients ignore most CSS, so this is table-based with inline styles.
// Web fonts rarely load in mail clients — Georgia is the safe serif fallback.

const COLORS = {
  page: "#fdf8f3",
  card: "#ffffff",
  gold: "#c9a15a",
  goldDark: "#9c7a3e",
  sage: "#8a9a5b",
  sageDark: "#5f6d3c",
  text: "#3d3733",
  textMuted: "#7a7168",
  red: "#A52A2A",
};

const SERIF = "'Cormorant Garamond', Georgia, 'Times New Roman', serif";

const ornament = (glyph = "&#10086;") => `
  <table role="presentation" cellpadding="0" cellspacing="0" align="center" style="margin:0 auto;">
    <tr>
      <td style="width:60px;border-top:1px solid ${COLORS.gold};font-size:0;line-height:0;">&nbsp;</td>
      <td style="padding:0 12px;color:${COLORS.goldDark};font-size:20px;line-height:1;">${glyph}</td>
      <td style="width:60px;border-top:1px solid ${COLORS.gold};font-size:0;line-height:0;">&nbsp;</td>
    </tr>
  </table>`;

// A small gold-ruled heading for a block inside the card.
export const emailSectionTitle = (label: string) => `
  <p style="margin:24px 0 8px;font-family:${SERIF};font-size:13px;letter-spacing:0.2em;
            text-transform:uppercase;color:${COLORS.goldDark};font-weight:700;">${label}</p>`;

// Label/value rows on a cream panel with a sage accent bar.
export const emailDetailsPanel = (rows: Array<[string, string]>) => `
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%"
         style="background:${COLORS.page};border-left:3px solid ${COLORS.sage};border-radius:4px;">
    <tr><td style="padding:12px 16px;">
      ${rows
        .map(
          ([label, value]) => `
        <p style="margin:4px 0;font-family:${SERIF};font-size:16px;color:${COLORS.text};">
          <span style="color:${COLORS.textMuted};">${label}:</span> <strong>${value}</strong>
        </p>`,
        )
        .join("")}
    </td></tr>
  </table>`;

export function renderEmail(opts: { heading: string; bodyHtml: string }): string {
  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:${COLORS.page};">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:${COLORS.page};">
      <tr><td align="center" style="padding:24px 12px;">
        <table role="presentation" cellpadding="0" cellspacing="0" width="100%"
               style="max-width:560px;background:${COLORS.card};border-radius:8px;overflow:hidden;
                      border:1px solid #efe6da;box-shadow:0 4px 16px rgba(0,0,0,0.06);">

          <tr><td style="height:6px;background:${COLORS.sage};font-size:0;line-height:0;">&nbsp;</td></tr>

          <tr><td align="center" style="padding:32px 24px 8px;">
            <p style="margin:0;font-family:${SERIF};font-size:12px;letter-spacing:0.3em;
                      text-transform:uppercase;color:${COLORS.goldDark};">Wedding of</p>
            <h1 style="margin:10px 0 4px;font-family:${SERIF};font-size:34px;font-weight:600;
                       color:${COLORS.text};">Yong Kheng &amp; Jessica</h1>
            <p style="margin:0 0 16px;font-family:${SERIF};font-size:15px;color:${COLORS.textMuted};">
              Sunday, 28 March 2027 &middot; SAFRA Mount Faber Club
            </p>
            ${ornament()}
          </td></tr>

          <tr><td style="padding:16px 32px 8px;font-family:${SERIF};font-size:17px;line-height:1.6;color:${COLORS.text};">
            <h2 style="margin:8px 0 16px;font-family:${SERIF};font-size:22px;font-weight:600;
                       color:${COLORS.sageDark};text-align:center;">${opts.heading}</h2>
            ${opts.bodyHtml}
          </td></tr>

          <tr><td align="center" style="padding:8px 24px 28px;">
            ${ornament("&#10047;")}
            <p style="margin:12px 0 0;font-family:${SERIF};font-size:13px;color:${COLORS.textMuted};">
              &mdash; no-reply-awense
            </p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
}

export { COLORS, SERIF };
