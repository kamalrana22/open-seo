import type { BillingCustomerContext } from "@/server/billing/subscription";
import {
  createDataforseoClient,
  fetchBusinessDataTaskResult,
  type BusinessTaskEndpoint,
} from "@/server/lib/dataforseo";
import { AppError } from "@/server/lib/errors";
import { readPath } from "@/server/mcp/table";
import {
  businessIdentifierKeyword,
  formatBusinessDataCoordinate,
  formatCoordinate,
  pickRowFields,
  resolveBusinessIdentifier,
} from "@/server/mcp/tools/local-seo-shared";

/**
 * Local SEO reads over DataForSEO's Business Data endpoints: business search,
 * Google Business Profile, Q&A, and review collection. Stateless — the MCP
 * tools and the Local SEO page's server functions share these functions so
 * defaults, row trimming, and task handling can't drift between the two.
 */

type ProjectMarket = { locationCode: number; languageCode: string };

type BusinessNear = {
  latitude: number;
  longitude: number;
  radiusKm?: number;
};

type BusinessIdentifierInput = {
  businessName?: string;
  cid?: string;
  placeId?: string;
};

type BusinessLocationInput = {
  near?: BusinessNear;
  locationCode?: number;
  languageCode?: string;
};

/** Coordinate when `near` is supplied, otherwise the project's market. */
function resolveBusinessLocation(
  input: BusinessLocationInput,
  market: ProjectMarket,
) {
  return {
    locationCoordinate: input.near
      ? formatBusinessDataCoordinate(input.near)
      : undefined,
    locationCode: input.near
      ? undefined
      : (input.locationCode ?? market.locationCode),
    languageCode: input.languageCode ?? market.languageCode,
  };
}

// ---------------------------------------------------------------------------
// Business search
// ---------------------------------------------------------------------------

type SearchLocalBusinessesInput = {
  query?: string;
  near: BusinessNear & { radiusKm: number };
  categories?: string[];
  minRating?: number;
  minReviews?: number;
  isClaimed?: boolean;
  sortBy?: "relevance" | "rating" | "reviews";
  limit?: number;
  offset?: number;
};

// Full Business Listings rows are ~9KB each (popular_times for every day,
// attribute trees, photo URLs) — 10 of them overflow MCP clients' tool-result
// budgets. Return only the fields a candidate list needs; getBusinessProfile
// serves the full shape for one business.
const LOCAL_BUSINESS_ROW_FIELDS = [
  "title",
  "description",
  "category",
  "additional_categories",
  "address",
  "phone",
  "url",
  "domain",
  "rating",
  "is_claimed",
  "cid",
  "place_id",
  "latitude",
  "longitude",
  "total_photos",
  "check_url",
] as const;

function pushAnd(filters: unknown[], condition: unknown[]) {
  if (filters.length > 0) filters.push("and");
  filters.push(condition);
}

function buildLocalBusinessFilters(input: {
  minRating?: number;
  minReviews?: number;
}) {
  const filters: unknown[] = [];
  if (input.minRating != null) {
    pushAnd(filters, ["rating.value", ">=", input.minRating]);
  }
  if (input.minReviews != null) {
    pushAnd(filters, ["rating.votes_count", ">=", input.minReviews]);
  }
  return filters.length > 0 ? filters : undefined;
}

function localBusinessOrderBy(
  sortBy: SearchLocalBusinessesInput["sortBy"],
): string[] | undefined {
  switch (sortBy) {
    case "rating":
      return ["rating.value,desc"];
    case "reviews":
      return ["rating.votes_count,desc"];
    default:
      return undefined;
  }
}

function formatBusinessListingsCoordinate(near: {
  latitude: number;
  longitude: number;
  radiusKm: number;
}) {
  // Business Listings rejects fractional radii ("Invalid Field:
  // 'location_coordinate'"), unlike the meter-based business_data radius.
  const radiusKm = Math.max(1, Math.round(near.radiusKm));
  return `${formatCoordinate(near.latitude)},${formatCoordinate(near.longitude)},${radiusKm}`;
}

async function searchLocalBusinesses(
  input: SearchLocalBusinessesInput,
  billingCustomer: BillingCustomerContext,
): Promise<Record<string, unknown>[]> {
  const client = createDataforseoClient(billingCustomer);
  const rows = await client.business.businessListings({
    categories: input.categories,
    title: input.query,
    locationCoordinate: formatBusinessListingsCoordinate(input.near),
    isClaimed: input.isClaimed,
    filters: buildLocalBusinessFilters(input),
    orderBy: localBusinessOrderBy(input.sortBy),
    limit: input.limit ?? 20,
    offset: input.offset,
  });
  return rows.map((row) => pickRowFields(row, LOCAL_BUSINESS_ROW_FIELDS));
}

// ---------------------------------------------------------------------------
// Business profile
// ---------------------------------------------------------------------------

type GetBusinessProfileInput = BusinessIdentifierInput & BusinessLocationInput;

async function getBusinessProfile(
  input: GetBusinessProfileInput,
  market: ProjectMarket,
  billingCustomer: BillingCustomerContext,
): Promise<Record<string, unknown> | null> {
  const identifier = resolveBusinessIdentifier(input);
  const client = createDataforseoClient(billingCustomer);
  return client.business.myBusinessInfo({
    keyword: businessIdentifierKeyword(identifier),
    ...resolveBusinessLocation(input, market),
  });
}

// ---------------------------------------------------------------------------
// Business questions (Q&A)
// ---------------------------------------------------------------------------

type GetBusinessQuestionsInput = BusinessIdentifierInput & {
  near: BusinessNear;
  depth?: number;
  languageCode?: string;
};

// Q&A rows carry a ~300-char uule URL plus avatar/contributor links on every
// question AND every nested answer; keep the text, author, and timing.
const BUSINESS_QUESTION_ROW_FIELDS = [
  "rank_absolute",
  "question_id",
  "question_text",
  "original_question_text",
  "profile_name",
  "time_ago",
  "timestamp",
] as const;

const BUSINESS_ANSWER_ROW_FIELDS = [
  "answer_id",
  "answer_text",
  "original_answer_text",
  "profile_name",
  "time_ago",
  "timestamp",
] as const;

function trimBusinessQuestionRow(row: unknown): Record<string, unknown> {
  const trimmed = pickRowFields(row, BUSINESS_QUESTION_ROW_FIELDS);
  const answers = readPath(row, "items");
  trimmed.items = Array.isArray(answers)
    ? answers.map((answer) => pickRowFields(answer, BUSINESS_ANSWER_ROW_FIELDS))
    : null;
  return trimmed;
}

async function getBusinessQuestions(
  input: GetBusinessQuestionsInput,
  market: ProjectMarket,
  billingCustomer: BillingCustomerContext,
): Promise<Record<string, unknown>[]> {
  const identifier = resolveBusinessIdentifier(input);
  const client = createDataforseoClient(billingCustomer);
  const rows = await client.business.questionsAnswers({
    // The questions endpoint shares the cid:/place_id: keyword prefixes.
    keyword: businessIdentifierKeyword(identifier),
    locationCoordinate: formatBusinessDataCoordinate(input.near),
    languageCode: input.languageCode ?? market.languageCode,
    depth: input.depth ?? 20,
  });
  return rows.map(trimBusinessQuestionRow);
}

// ---------------------------------------------------------------------------
// Business reviews (queued task: post once, collect for free)
// ---------------------------------------------------------------------------

type StartBusinessReviewsInput = BusinessIdentifierInput &
  BusinessLocationInput & {
    depth?: number;
    sortBy?: "newest" | "highest_rating" | "lowest_rating" | "relevant";
    includeOtherSources?: boolean;
  };

const REVIEWS_TASK_ID_PATTERN = /^(google|extended):(.+)$/;

function encodeReviewsTaskId(includeOtherSources: boolean, id: string): string {
  return `${includeOtherSources ? "extended" : "google"}:${id}`;
}

function parseReviewsTaskId(taskId: string): {
  endpoint: BusinessTaskEndpoint;
  taskId: string;
} {
  const match = REVIEWS_TASK_ID_PATTERN.exec(taskId);
  if (!match) {
    throw new AppError(
      "VALIDATION_ERROR",
      'taskId must be the value the reviews call returned, formatted as "google:<id>" or "extended:<id>".',
    );
  }
  return {
    endpoint: match[1] === "extended" ? "extended_reviews" : "reviews",
    taskId: match[2] ?? "",
  };
}

/**
 * Posts the metered review-collection task and returns the resumable public
 * taskId ("google:<id>" or "extended:<id>"); collectBusinessReviews reads the
 * outcome for free.
 */
async function startBusinessReviews(
  input: StartBusinessReviewsInput,
  market: ProjectMarket,
  billingCustomer: BillingCustomerContext,
): Promise<{ taskId: string }> {
  const includeOtherSources = input.includeOtherSources ?? false;
  const identifier = resolveBusinessIdentifier(input);
  const client = createDataforseoClient(billingCustomer);
  const postedId = await client.business.reviewsTaskPost({
    ...identifier,
    ...resolveBusinessLocation(input, market),
    depth: input.depth ?? 20,
    // The fetcher's extended branch has no sort_by and ignores this.
    sortBy: input.sortBy ?? "newest",
    includeOtherSources,
  });
  return { taskId: encodeReviewsTaskId(includeOtherSources, postedId) };
}

// Full review rows carry ~200-char base64 review URLs, avatar URLs, and
// xpaths; the fields below are what review-gap analysis actually reads.
const REVIEW_ROW_FIELDS = [
  "rank_absolute",
  "time_ago",
  "timestamp",
  "rating",
  "review_text",
  "original_review_text",
  "original_language",
  "profile_name",
  "local_guide",
  "reviews_count",
  "photos_count",
  "review_highlights",
  "source",
  "owner_answer",
  "owner_time_ago",
  "owner_timestamp",
  "review_id",
] as const;

type CollectBusinessReviewsResult =
  | { status: "processing" }
  | {
      status: "completed";
      reviews: Record<string, unknown>[];
      totals: Record<string, unknown> | null;
    };

/**
 * One free collection attempt for a posted reviews task. Callers own their
 * pacing: the MCP tool polls in-request, the page polls from the client.
 */
async function collectBusinessReviews(
  publicTaskId: string,
): Promise<CollectBusinessReviewsResult> {
  const task = parseReviewsTaskId(publicTaskId);
  let outcome;
  try {
    outcome = await fetchBusinessDataTaskResult(task);
  } catch (error) {
    // The task was already paid for at post; don't let a collection failure
    // discard the only handle to it.
    if (error instanceof AppError) {
      throw new AppError(
        error.code,
        `${error.message} The queued task is still collectable — call again with taskId "${publicTaskId}" at no extra cost.`,
      );
    }
    throw error;
  }
  if (outcome.status === "pending") return { status: "processing" };

  const items = outcome.result?.items;
  const reviews = (Array.isArray(items) ? items : []).map((row) =>
    pickRowFields(row, REVIEW_ROW_FIELDS),
  );
  const totals = outcome.result
    ? {
        title: outcome.result.title ?? null,
        reviews_count: outcome.result.reviews_count ?? null,
        rating: outcome.result.rating ?? null,
        cid: outcome.result.cid ?? null,
        place_id: outcome.result.place_id ?? null,
      }
    : null;
  return { status: "completed", reviews, totals };
}

export const LocalSeoService = {
  searchLocalBusinesses,
  getBusinessProfile,
  getBusinessQuestions,
  startBusinessReviews,
  collectBusinessReviews,
};
