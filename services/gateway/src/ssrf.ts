import dns from 'node:dns/promises';

export interface SsrfCheckResult {
  valid: boolean;
  reason?: string;
}

function isPrivateIp(ip: string): boolean {
  // IPv4 private ranges: 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4) return false;
  if (parts[0] === 10) return true;
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
  if (parts[0] === 192 && parts[1] === 168) return true;
  return false;
}

function isDisallowedIp(ip: string): boolean {
  // Loopback (127.0.0.0/8, ::1)
  if (ip.startsWith('127.') || ip === '::1' || ip === '0.0.0.0') return true;
  // Link-local / AWS metadata (169.254.0.0/16)
  if (ip.startsWith('169.254.')) return true;
  return false;
}

export async function validateServerUrl(rawUrl: string): Promise<SsrfCheckResult> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { valid: false, reason: 'Invalid URL syntax' };
  }

  // Reject non-http(s)
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { valid: false, reason: `Unsupported protocol: ${parsed.protocol}` };
  }

  // Reject userinfo (e.g. http://user:pass@host)
  if (parsed.username || parsed.password) {
    return { valid: false, reason: 'URLs with userinfo credentials are not permitted' };
  }

  const hostname = parsed.hostname.toLowerCase();

  // Reject explicit localhost or cloud metadata hostnames
  if (
    hostname === 'localhost' ||
    hostname === '0.0.0.0' ||
    hostname === 'metadata.google.internal' ||
    hostname.startsWith('127.') ||
    hostname.startsWith('169.254.')
  ) {
    return { valid: false, reason: `Disallowed hostname: ${hostname}` };
  }

  // Allow DNS names ending in .svc.cluster.local (or in-cluster services)
  const isClusterLocal = hostname.endsWith('.svc.cluster.local') || hostname.endsWith('.svc');

  // Resolve hostname
  try {
    const addresses = await dns.lookup(hostname, { all: true });
    for (const addr of addresses) {
      if (isDisallowedIp(addr.address)) {
        return { valid: false, reason: `Host resolves to blocked IP: ${addr.address}` };
      }
      // In-cluster ClusterIP ranges allowed ONLY when hostname is *.svc.cluster.local
      if (isPrivateIp(addr.address) && !isClusterLocal) {
        return {
          valid: false,
          reason: `Private IP address ${addr.address} permitted only for *.svc.cluster.local domains`,
        };
      }
    }
  } catch (err: any) {
    // If it's a valid cluster.local hostname that simply hasn't spun up yet, allow it
    if (isClusterLocal) {
      return { valid: true };
    }
    return { valid: false, reason: `DNS resolution failed: ${err.message}` };
  }

  return { valid: true };
}
