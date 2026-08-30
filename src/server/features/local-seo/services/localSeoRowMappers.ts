import { readPath } from "@/server/mcp/table";

/**
 * Typed page-facing shapes over the loose provider rows LocalSeoService
 * returns (the MCP tools keep the loose rows; the page's server functions
 * return these so the client gets real types over the serialization
 * boundary, matching backlinksRowMappers).
 */

function str(source: unknown, ...path: string[]): string | null {
  const value = readPath(source, ...path);
  return typeof value === "string" && value !== "" ? value : null;
}

function num(source: unknown, ...path: string[]): number | null {
  const value = readPath(source, ...path);
  return typeof value === "number" ? value : null;
}

function bool(source: unknown, ...path: string[]): boolean | null {
  const value = readPath(source, ...path);
  return typeof value === "boolean" ? value : null;
}

function strings(source: unknown, ...path: string[]): string[] {
  const value = readPath(source, ...path);
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}

export function mapLocalBusinessRow(row: Record<string, unknown>) {
  return {
    title: str(row, "title"),
    category: str(row, "category"),
    address: str(row, "address"),
    phone: str(row, "phone"),
    url: str(row, "url"),
    rating: num(row, "rating", "value"),
    reviewsCount: num(row, "rating", "votes_count"),
    isClaimed: bool(row, "is_claimed"),
    cid: str(row, "cid"),
    placeId: str(row, "place_id"),
    latitude: num(row, "latitude"),
    longitude: num(row, "longitude"),
  };
}

export function mapBusinessProfileRow(row: Record<string, unknown>) {
  const distribution = readPath(row, "rating_distribution");
  return {
    ...mapLocalBusinessRow(row),
    additionalCategories: strings(row, "additional_categories"),
    ratingDistribution: [5, 4, 3, 2, 1].map((star) => ({
      star,
      count: num(distribution, String(star)) ?? 0,
    })),
    currentStatus: str(row, "work_time", "work_hours", "current_status"),
    totalPhotos: num(row, "total_photos"),
  };
}

export function mapBusinessReviewRow(row: Record<string, unknown>) {
  return {
    reviewId: str(row, "review_id"),
    rating: num(row, "rating", "value"),
    author: str(row, "profile_name"),
    timeAgo: str(row, "time_ago"),
    text: str(row, "review_text"),
    source: str(row, "source", "title"),
    ownerReplied: readPath(row, "owner_answer") != null,
  };
}

export function mapBusinessReviewTotals(totals: Record<string, unknown>) {
  return {
    title: str(totals, "title"),
    reviewsCount: num(totals, "reviews_count"),
    rating: num(totals, "rating", "value"),
  };
}

export function mapBusinessQuestionRow(row: Record<string, unknown>) {
  const answers = readPath(row, "items");
  return {
    questionId: str(row, "question_id"),
    text: str(row, "question_text"),
    author: str(row, "profile_name"),
    timeAgo: str(row, "time_ago"),
    answers: (Array.isArray(answers) ? answers : []).map((answer) => ({
      answerId: str(answer, "answer_id"),
      text: str(answer, "answer_text"),
      author: str(answer, "profile_name"),
      timeAgo: str(answer, "time_ago"),
    })),
  };
}
