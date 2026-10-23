// Passkeys with the browser's native WebAuthn API (no library). The server sends options as JSON (base64url);
// newer browsers parse them natively, older ones use the small converters below.
/* eslint-disable @typescript-eslint/no-explicit-any */

const toBuf = (s: string) =>
  Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(s.length / 4) * 4, "=")), (c) => c.charCodeAt(0)).buffer;
const toB64u = (b: ArrayBuffer | null) =>
  b ? btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "") : null;
const ids = (list?: any[]) => (list ?? []).map((c) => ({ ...c, id: toBuf(c.id) }));

function toJSON(cred: any) {
  if (typeof cred.toJSON === "function") return cred.toJSON();
  const r = cred.response;
  const response: Record<string, unknown> = { clientDataJSON: toB64u(r.clientDataJSON) };
  if (r.attestationObject) Object.assign(response, { attestationObject: toB64u(r.attestationObject), transports: r.getTransports?.() ?? [] });
  else Object.assign(response, { authenticatorData: toB64u(r.authenticatorData), signature: toB64u(r.signature), userHandle: toB64u(r.userHandle) });
  return { id: cred.id, rawId: toB64u(cred.rawId), type: cred.type, response, clientExtensionResults: cred.getClientExtensionResults?.() ?? {} };
}

export const passkeysSupported = () => typeof window !== "undefined" && "PublicKeyCredential" in window;

export async function createPasskey(options: any) {
  const PKC = window.PublicKeyCredential as any;
  const publicKey = PKC.parseCreationOptionsFromJSON ? PKC.parseCreationOptionsFromJSON(options)
    : { ...options, challenge: toBuf(options.challenge), user: { ...options.user, id: toBuf(options.user.id) }, excludeCredentials: ids(options.excludeCredentials) };
  return toJSON(await navigator.credentials.create({ publicKey }));
}

export async function getPasskey(options: any) {
  const PKC = window.PublicKeyCredential as any;
  const publicKey = PKC.parseRequestOptionsFromJSON ? PKC.parseRequestOptionsFromJSON(options)
    : { ...options, challenge: toBuf(options.challenge), allowCredentials: ids(options.allowCredentials) };
  return toJSON(await navigator.credentials.get({ publicKey }));
}

/** Readable message for the common browser errors (user cancelled, wrong origin, no authenticator). */
export function passkeyError(e: unknown): string | null {
  if (e instanceof DOMException) {
    if (e.name === "NotAllowedError") return "Passkey prompt was cancelled or timed out.";
    if (e.name === "SecurityError") return "Passkeys need the app opened at http://localhost:5173 (not 127.0.0.1).";
    if (e.name === "InvalidStateError") return "This device already has a passkey for this account.";
    return `Passkey error: ${e.message}`;
  }
  return null;
}
