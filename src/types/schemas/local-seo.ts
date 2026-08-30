import { z } from "zod";

/**
 * Input + URL schemas for the Local SEO page (business search, Google
 * Business Profile, reviews, Q&A). The page's server functions validate with
 * these; the behavior they gate lives in LocalSeoService, which the MCP
 * local-SEO tools share.
 */

export const LOCAL_SEO_MAX_QUERY_LENGTH = 200;

const latLngSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});

const nearSchema = latLngSchema.extend({
  radiusKm: z.number().min(0.2).max(500).optional(),
});

// Exactly-one-of is enforced by LocalSeoService.resolveBusinessIdentifier —
// same rule and error as the MCP tools.
const businessIdentifierFields = {
  businessName: z
    .string()
    .trim()
    .min(1)
    .max(LOCAL_SEO_MAX_QUERY_LENGTH)
    .optional(),
  cid: z.string().min(1).max(64).optional(),
  placeId: z.string().min(1).max(256).optional(),
} as const;

export const searchLocalBusinessesInputSchema = z.object({
  projectId: z.string().min(1),
  query: z.string().trim().min(1).max(LOCAL_SEO_MAX_QUERY_LENGTH),
  near: latLngSchema.extend({
    radiusKm: z.number().min(1).max(500).default(10),
  }),
  limit: z.number().int().min(1).max(50).default(20),
});

export const getBusinessProfileInputSchema = z.object({
  projectId: z.string().min(1),
  ...businessIdentifierFields,
  near: nearSchema.optional(),
});

export const getBusinessQuestionsInputSchema = z.object({
  projectId: z.string().min(1),
  ...businessIdentifierFields,
  near: nearSchema,
  depth: z.number().int().min(1).max(100).default(20),
});

export const startBusinessReviewsInputSchema = z.object({
  projectId: z.string().min(1),
  ...businessIdentifierFields,
  near: nearSchema.optional(),
  depth: z.number().int().min(10).max(200).default(20),
  sortBy: z
    .enum(["newest", "highest_rating", "lowest_rating", "relevant"])
    .default("newest"),
});

export const collectBusinessReviewsInputSchema = z.object({
  projectId: z.string().min(1),
  taskId: z.string().min(1).max(128),
});

/**
 * /p/$projectId/local query params. `q` is the business name, `near` an
 * optional raw "lat, lng" string (parsed with parseLatLng), `cid` the picked
 * candidate's Google CID.
 */
export const localSeoSearchSchema = z.object({
  q: z.string().optional(),
  near: z.string().optional(),
  cid: z.string().optional(),
});

/** Parse a pasted "lat, lng" pair; null when it isn't one. */
export function parseLatLng(
  raw: string,
): { latitude: number; longitude: number } | null {
  const match =
    /^\s*(-?\d{1,3}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)\s*$/.exec(raw);
  if (!match) return null;
  const latitude = Number(match[1]);
  const longitude = Number(match[2]);
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  return { latitude, longitude };
}
