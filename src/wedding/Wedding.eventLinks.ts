// Event details and the three action links (Add to Calendar, Get Directions,
// Open Website) embedded in the RSVP confirmation emails.

const EVENT = {
  title: "Jessica & Yong Kheng's Wedding",
  venueName: "SAFRA Mount Faber Club",
  address: "SAFRA Mount Faber Club, 2 Telok Blangah Way, #02-05, Singapore 098803",
  // Sunday 28 March 2027, 12:30 PM Singapore time (UTC+8), 4 hours.
  startUtc: "20270328T043000Z",
  endUtc: "20270328T083000Z",
};

// Set WEDDING_WEBSITE_URL in the environment (e.g. https://yoursite.com/?q=0).
// When unset, the "Open Website" button is left out rather than linking nowhere.
const websiteUrl = () => process.env.WEDDING_WEBSITE_URL?.trim() || null;

// Website link that opens the RSVP form straight away (`q=2`; the site treats
// q=0 as no RSVP footer, q=1 as footer shown, q=2 as modal open). Null when
// WEDDING_WEBSITE_URL isn't set or isn't a valid URL.
export function buildRsvpUpdateLink(): string | null {
  const base = websiteUrl();
  if (!base) return null;
  try {
    const url = new URL(base);
    url.searchParams.set("q", "2");
    return url.toString();
  } catch {
    return null;
  }
}

export function buildEventLinks(): { calendar: string; directions: string; website: string | null } {
  const calendar =
    "https://calendar.google.com/calendar/render?" +
    new URLSearchParams({
      action: "TEMPLATE",
      text: EVENT.title,
      dates: `${EVENT.startUtc}/${EVENT.endUtc}`,
      location: EVENT.address,
      details: `Join us to celebrate at ${EVENT.venueName}.`,
    }).toString();

  const directions =
    "https://www.google.com/maps/dir/?" +
    new URLSearchParams({ api: "1", destination: EVENT.address }).toString();

  return { calendar, directions, website: websiteUrl() };
}

// Bulletproof email buttons: table-based with inline styles, since email
// clients ignore most CSS. Stacked in a column, each full width.
export function renderEventActionButtons(): string {
  const links = buildEventLinks();
  const buttons: Array<[string, string]> = [
    ["Add to Calendar", links.calendar],
    ["Get Directions", links.directions],
  ];
  if (links.website) buttons.push(["Open Website", links.website]);

  const rows = buttons
    .map(
      ([label, href]) => `
        <tr><td style="padding:0 0 10px;">
          <a href="${href.replace(/&/g, "&amp;")}" target="_blank"
             style="display:block;padding:12px 18px;background:#A52A2A;color:#ffffff;text-align:center;
                    text-decoration:none;border-radius:4px;font-weight:600;font-size:15px;
                    font-family:'Cormorant Garamond',Georgia,serif;letter-spacing:0.05em;">
            ${label}
          </a>
        </td></tr>`,
    )
    .join("");

  return `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:20px 0 8px;">${rows}</table>`;
}
