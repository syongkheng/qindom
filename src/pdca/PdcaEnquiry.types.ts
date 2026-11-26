/** Validated contact-form body. Optional fields are "" when not given. */
export interface PdcaEnquiryBody {
  name: string;
  clinic: string;
  phone: string;
  email: string;
  message: string;
  consent: true;
  /** Honeypot: hidden on the site, so anything typed here means a bot. */
  website: string;
}

/** Same answer for real and honeypot submissions, so bots can't tell them apart. */
export interface PdcaEnquiryReceivedDto {
  message: "Received";
}
