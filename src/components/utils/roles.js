// Role ay galing sa app_metadata (hindi ma-edit ng user mismo).
export const ROLES = ["admin", "staff", "rider"];

export const getRole = (user) => user?.app_metadata?.role ?? null;

export const homeFor = (role) => (role === "rider" ? "/rider" : "/pos");