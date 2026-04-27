const BRANDFETCH_CLIENT_ID = "1bxslgajlsi6kg3c82drbf3z0eaQApbQkPa";
const STRIPPABLE_SUBDOMAINS = new Set(["www", "api", "app", "mcp"]);

function isLocalHostname(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname.endsWith(".local")
  );
}

function isIpHostname(hostname: string): boolean {
  return /^(\d{1,3}\.){3}\d{1,3}$/.test(hostname) || hostname.includes(":");
}

function reduceHostnameToBrandDomain(hostname: string): string | null {
  if (isLocalHostname(hostname) || isIpHostname(hostname)) {
    return null;
  }

  const labels = hostname
    .toLowerCase()
    .split(".")
    .map((label) => label.trim())
    .filter(Boolean);

  if (labels.length < 2) {
    return null;
  }

  while (labels.length > 2 && STRIPPABLE_SUBDOMAINS.has(labels[0] ?? "")) {
    labels.shift();
  }

  if (labels.length <= 2) {
    return labels.join(".");
  }

  const topLevelDomain = labels.at(-1) ?? "";
  const secondLevelDomain = labels.at(-2) ?? "";
  if (topLevelDomain.length === 2 && secondLevelDomain.length <= 3 && labels.length >= 3) {
    return labels.slice(-3).join(".");
  }

  return labels.slice(-2).join(".");
}

function titleCaseLabel(value: string): string {
  return value
    .split(/[\s-]+/)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

export function inferBrandNameFromDomain(domain: string): string | null {
  const labels = domain
    .toLowerCase()
    .split(".")
    .map((label) => label.trim())
    .filter(Boolean);

  if (labels.length < 2) {
    return null;
  }

  const topLevelDomain = labels.at(-1) ?? "";
  const secondLevelDomain = labels.at(-2) ?? "";
  const brandLabels =
    topLevelDomain.length === 2 && secondLevelDomain.length <= 3 && labels.length >= 3
      ? labels.slice(0, -2)
      : labels.slice(0, -1);

  const brandLabel = brandLabels.join("-").trim();
  if (!brandLabel) {
    return null;
  }

  return titleCaseLabel(brandLabel);
}

export function getBrandfetchDomainFromEndpoint(endpoint: string): string | null {
  try {
    const hostname = new URL(endpoint).hostname;
    return reduceHostnameToBrandDomain(hostname);
  } catch {
    return null;
  }
}

export function getBrandfetchLogoUrl(endpoint: string): string | null {
  const domain = getBrandfetchDomainFromEndpoint(endpoint);
  if (!domain) {
    return null;
  }

  return `https://cdn.brandfetch.io/${encodeURIComponent(domain)}/w/80/h/80/icon.png?c=${BRANDFETCH_CLIENT_ID}`;
}

export function inferBrandNameFromEndpoint(endpoint: string): string | null {
  const domain = getBrandfetchDomainFromEndpoint(endpoint);
  if (!domain) {
    return null;
  }

  return inferBrandNameFromDomain(domain);
}
