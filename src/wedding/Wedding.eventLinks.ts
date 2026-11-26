// Event details and the action links (Add to Calendar, Get Directions, Open Website)
// embedded in the RSVP confirmation emails. Rendered by Wedding.emailTemplate.ts.

const EVENT = {
  title: "Jessica & Yong Kheng's Wedding",
  venueName: "SAFRA Mount Faber Club",
  address: "SAFRA Mount Faber Club, 2 Telok Blangah Way, #02-05, Singapore 098803",
  // Sunday 28 March 2027, 12:30 PM Singapore time (UTC+8), 4 hours.
  startUtc: "20270328T043000Z",
  endUtc: "20270328T083000Z",
};

const GOOGLE_CALENDAR_URL = "https://calendar.google.com/calendar/render";
const GOOGLE_MAPS_DIRECTIONS_URL = "https://www.google.com/maps/dir/";
const WEBSITE_URL_ENV = "WEDDING_WEBSITE_URL";

/** The site's `q` param: 0 or absent = RSVP footer shown, 1 = footer hidden, 2 = RSVP modal opens straight away. */
const WebsiteMode = {
  FOOTER_HIDDEN: "1",
  OPEN_RSVP: "2",
} as const;
type WebsiteMode = (typeof WebsiteMode)[keyof typeof WebsiteMode];

export interface EventLinks {
  calendar: string;
  directions: string;
  /** Null when WEDDING_WEBSITE_URL isn't set or isn't a valid URL. */
  website: string | null;
}

// WEDDING_WEBSITE_URL (e.g. https://yoursite.com), read lazily (dotenv loads after imports).
// Any `q` already on it is overridden. Unset or invalid → the website links are left out.
function websiteLink(mode: WebsiteMode): string | null {
  const base = process.env[WEBSITE_URL_ENV]?.trim();
  if (!base) return null;
  try {
    const url = new URL(base);
    url.searchParams.set("q", mode);
    return url.toString();
  } catch {
    return null;
  }
}

/** "Submit the RSVP form again": opens the form to edit the response. */
export const buildRsvpUpdateLink = () => websiteLink(WebsiteMode.OPEN_RSVP);

export function buildEventLinks(): EventLinks {
  const calendar =
    `${GOOGLE_CALENDAR_URL}?` +
    new URLSearchParams({
      action: "TEMPLATE",
      text: EVENT.title,
      dates: `${EVENT.startUtc}/${EVENT.endUtc}`,
      location: EVENT.address,
      details: `Join us to celebrate at ${EVENT.venueName}.`,
    }).toString();

  const directions =
    `${GOOGLE_MAPS_DIRECTIONS_URL}?` + new URLSearchParams({ api: "1", destination: EVENT.address }).toString();

  // "Open Website": just visiting the site, so the RSVP footer is hidden.
  return { calendar, directions, website: websiteLink(WebsiteMode.FOOTER_HIDDEN) };
}
