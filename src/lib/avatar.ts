/** URL of a user's profile picture, or undefined when they haven't set one. */
export function avatarUrl(u: { id: string; avatarVersion?: number | null }) {
  return u.avatarVersion ? `/api/avatars/${u.id}?v=${u.avatarVersion}` : undefined;
}
