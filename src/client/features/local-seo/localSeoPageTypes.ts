import type {
  getBusinessProfile,
  searchLocalBusinesses,
} from "@/serverFunctions/local-seo";

export type LocalBusinessRow = Awaited<
  ReturnType<typeof searchLocalBusinesses>
>[number];

export type BusinessProfileData = NonNullable<
  Awaited<ReturnType<typeof getBusinessProfile>>
>;

/**
 * The business the reviews/Q&A sections act on: a precise identifier (cid
 * when the profile carries one, otherwise the searched name) plus the
 * profile's coordinate for endpoints that require one.
 */
export type BusinessTarget = {
  identifier: { cid: string } | { businessName: string };
  near: { latitude: number; longitude: number } | null;
};
