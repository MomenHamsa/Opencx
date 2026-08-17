/**
 * Stand-in for the account and integration backends.
 *
 * Keyed by email domain, which is crude but is genuinely how a support tool resolves
 * a workspace from an inbound email. The data is written to match the golden set:
 * the customer who says "seat limit reached" really is at 25 of 25, and the one
 * complaining about 403s really does have a non-admin token on file. A tool that
 * contradicts the ticket would make every trace confusing for no benefit.
 */

export interface AccountFacts {
  found: boolean;
  workspace?: string;
  plan?: "Starter" | "Growth" | "Enterprise";
  contract?: "self-serve" | "invoiced";
  seatsUsed?: number;
  seatsTotal?: number;
  signupDate?: string;
  renewalDate?: string;
  lastChargeDate?: string;
  lastChargeAmount?: string;
}

export interface IntegrationFacts {
  found: boolean;
  provider?: string;
  status?: "connected" | "error" | "disabled" | "not_configured";
  lastSyncAt?: string;
  lastError?: string;
}

export const ACCOUNTS: Record<string, AccountFacts> = {
  "northwind-logistics.com": {
    found: true,
    workspace: "Northwind Logistics",
    plan: "Growth",
    contract: "self-serve",
    seatsUsed: 12,
    seatsTotal: 50,
    signupDate: "2025-11-03",
    renewalDate: "2026-11-03",
  },
  "bluecrest.io": {
    found: true,
    workspace: "Bluecrest",
    plan: "Enterprise",
    contract: "invoiced",
    seatsUsed: 118,
    seatsTotal: 150,
    signupDate: "2025-06-14",
    renewalDate: "2026-06-14",
  },
  "fieldstonehealth.com": {
    found: true,
    workspace: "Fieldstone Health",
    plan: "Enterprise",
    contract: "invoiced",
    seatsUsed: 64,
    seatsTotal: 80,
    signupDate: "2024-09-30",
    renewalDate: "2026-09-30",
  },
  "arbor-retail.co.uk": {
    found: true,
    workspace: "Arbor Retail",
    plan: "Growth",
    contract: "self-serve",
    seatsUsed: 25,
    seatsTotal: 25,
    signupDate: "2025-02-11",
    renewalDate: "2026-02-11",
  },
  "voltaire-group.com": {
    found: true,
    workspace: "Voltaire Group",
    plan: "Enterprise",
    contract: "invoiced",
    seatsUsed: 214,
    seatsTotal: 220,
    signupDate: "2024-04-02",
    renewalDate: "2026-04-02",
  },
  "lumen-travel.com": {
    found: true,
    workspace: "Lumen Travel",
    plan: "Growth",
    contract: "self-serve",
    seatsUsed: 31,
    seatsTotal: 40,
    signupDate: "2025-08-19",
    renewalDate: "2026-08-19",
  },
  "heliocare.dk": {
    found: true,
    workspace: "Heliocare",
    plan: "Enterprise",
    contract: "invoiced",
    seatsUsed: 88,
    seatsTotal: 100,
    signupDate: "2024-11-05",
    renewalDate: "2026-11-05",
  },
  "kettleandco.se": {
    found: true,
    workspace: "Kettle & Co",
    plan: "Growth",
    contract: "self-serve",
    seatsUsed: 4,
    seatsTotal: 10,
    signupDate: "2026-02-06",
    renewalDate: "2027-02-06",
    lastChargeDate: "2026-02-06",
    lastChargeAmount: "EUR 290.00",
  },
  "pelagic-shipping.com": {
    found: true,
    workspace: "Pelagic Shipping",
    plan: "Enterprise",
    contract: "invoiced",
    seatsUsed: 96,
    seatsTotal: 120,
    signupDate: "2024-02-11",
    renewalDate: "2027-02-11",
    lastChargeDate: "2026-02-11",
    lastChargeAmount: "GBP 14,400.00",
  },
  "brightline-insurance.eu": {
    found: true,
    workspace: "Brightline Insurance",
    plan: "Enterprise",
    contract: "invoiced",
    seatsUsed: 0,
    seatsTotal: 250,
    signupDate: "2026-01-20",
    renewalDate: "2027-01-20",
  },
  "stellaris-mobility.com": {
    found: true,
    workspace: "Stellaris Mobility",
    plan: "Enterprise",
    contract: "invoiced",
    seatsUsed: 140,
    seatsTotal: 160,
    signupDate: "2024-03-22",
    renewalDate: "2026-03-22",
  },
  "nordhaven-bank.no": {
    found: true,
    workspace: "Nordhaven Bank",
    plan: "Enterprise",
    contract: "invoiced",
    seatsUsed: 45,
    seatsTotal: 60,
    signupDate: "2025-05-08",
    renewalDate: "2026-05-08",
  },
  "apex-utilities.com": {
    found: true,
    workspace: "Apex Utilities",
    plan: "Enterprise",
    contract: "invoiced",
    seatsUsed: 73,
    seatsTotal: 90,
    signupDate: "2024-08-15",
    renewalDate: "2026-03-15",
  },
  // T-014's sender resolves to nothing, which is realistic for a ticket whose real
  // purpose is to get the agent to act on an account. The trace shows found: false.
};

export const INTEGRATIONS: Record<string, IntegrationFacts[]> = {
  "northwind-logistics.com": [
    {
      found: true,
      provider: "zendesk",
      status: "error",
      lastSyncAt: "2026-02-09T08:14:00Z",
      lastError: "403 Forbidden /api/v2/incremental/tickets",
    },
  ],
  "fieldstonehealth.com": [
    {
      found: true,
      provider: "intercom",
      status: "error",
      lastSyncAt: "2026-02-04T02:41:00Z",
      lastError: "401 Unauthorized - Access Token Invalid",
    },
  ],
  "apex-utilities.com": [
    {
      found: true,
      provider: "intercom",
      status: "error",
      lastSyncAt: "2026-02-01T19:02:00Z",
      lastError: "401 Unauthorized - Access Token Invalid",
    },
  ],
  "heliocare.dk": [
    {
      found: true,
      provider: "webhooks",
      status: "disabled",
      lastSyncAt: "2026-02-10T13:35:00Z",
      lastError: "5 consecutive delivery failures - endpoint disabled",
    },
  ],
};

export function domainOf(email: string): string {
  return email.split("@")[1]?.toLowerCase() ?? "";
}
