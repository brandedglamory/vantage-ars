export const APP_NAME = "Vantage-ARS";
export const APP_URL = process.env.BETTER_AUTH_URL || "https://www.vantage-ars.co.za";
export const COMPANY_NAME = "Vantage-ARS (Pty) Ltd";
export const COMPANY_EMAIL = "info@vantage-ars.co.za";
export const SUPPORT_EMAIL = "support@vantage-ars.co.za";
export const FOUNDER_EMAIL = process.env.FOUNDER_EMAIL || "juanlouw.greyling@gmail.com";

export const CURRENCIES = {
  ZAR: "South African Rand",
} as const;

export const PAGINATION = {
  DEFAULT_PAGE_SIZE: 25,
  MAX_PAGE_SIZE: 100,
} as const;

export const RATE_LIMITS = {
  API: 100, // requests per minute
  AUTH: 10, // auth attempts per minute
} as const;

export const DATE_FORMATS = {
  SHORT: { year: "numeric", month: "short", day: "numeric" } as const,
  LONG: { year: "numeric", month: "long", day: "numeric" } as const,
  DATETIME: { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" } as const,
} as const;
