// PM CONTROL TOWER — Avatar library: the 80 bundled 3D avatars (public/avatars).
// Users pick one via the account menu; only whitelisted /avatars/avatar-NN.png
// paths may be stored on the User row (validated on every write).

export const AVATAR_COUNT = 80;

/** Matches only the bundled avatar paths, e.g. "/avatars/avatar-07.png" (01–80). */
export const AVATAR_URL_RE = /^\/avatars\/avatar-(?:0[1-9]|[1-7][0-9]|80)\.png$/;

export function isAvatarUrl(v: unknown): v is string {
  return typeof v === "string" && AVATAR_URL_RE.test(v);
}

/** Public path for a picker index (1-based). */
export function avatarSrc(index: number): string {
  const n = Math.min(AVATAR_COUNT, Math.max(1, Math.round(index)));
  return `/avatars/avatar-${String(n).padStart(2, "0")}.png`;
}
