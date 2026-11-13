// Provider details shared by all free tools, remembered on this device only.
// The tax ID is deliberately never stored.
export type ProviderInfo = {
  providerName: string;
  businessName: string;
  providerAddress: string;
  providerContact: string;
  currency: string;
};

const KEY = "naptime-office:provider";
const OLD_KEY = "naptime-office:statement-provider";

export function emptyProvider(): ProviderInfo {
  return { providerName: "", businessName: "", providerAddress: "", providerContact: "", currency: "$" };
}

export function loadProvider(): Partial<ProviderInfo> & Record<string, unknown> {
  try {
    const raw = window.localStorage.getItem(KEY) ?? window.localStorage.getItem(OLD_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function saveProvider(p: Partial<ProviderInfo> & Record<string, unknown>) {
  try {
    const current = loadProvider();
    const keep: Record<string, unknown> = { ...current };
    for (const k of ["providerName", "businessName", "providerAddress", "providerContact", "currency", "country"]) {
      if (k in p) keep[k] = p[k];
    }
    window.localStorage.setItem(KEY, JSON.stringify(keep));
  } catch {
    // Storage blocked (private browsing): nothing to do.
  }
}

export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function slug(s: string, fallback = "family") {
  return s.trim().replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || fallback;
}
