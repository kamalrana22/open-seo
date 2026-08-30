import { createServerFn } from "@tanstack/react-start";
import { LocalSeoService } from "@/server/features/local-seo/services/LocalSeoService";
import {
  mapBusinessProfileRow,
  mapBusinessQuestionRow,
  mapBusinessReviewRow,
  mapBusinessReviewTotals,
  mapLocalBusinessRow,
} from "@/server/features/local-seo/services/localSeoRowMappers";
import { requireProjectContext } from "@/serverFunctions/middleware";
import {
  collectBusinessReviewsInputSchema,
  getBusinessProfileInputSchema,
  getBusinessQuestionsInputSchema,
  searchLocalBusinessesInputSchema,
  startBusinessReviewsInputSchema,
} from "@/types/schemas/local-seo";

// Like keywords/backlinks, Local SEO has no paid-plan gate: DataForSEO spend
// is metered against the org's credit balance inside the shared client.

export const searchLocalBusinesses = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(searchLocalBusinessesInputSchema)
  .handler(async ({ data, context }) => {
    const rows = await LocalSeoService.searchLocalBusinesses(data, context);
    return rows.map(mapLocalBusinessRow);
  });

export const getBusinessProfile = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(getBusinessProfileInputSchema)
  .handler(async ({ data, context }) => {
    const profile = await LocalSeoService.getBusinessProfile(
      data,
      context.project,
      context,
    );
    return profile ? mapBusinessProfileRow(profile) : null;
  });

export const getBusinessQuestions = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(getBusinessQuestionsInputSchema)
  .handler(async ({ data, context }) => {
    const rows = await LocalSeoService.getBusinessQuestions(
      data,
      context.project,
      context,
    );
    return rows.map(mapBusinessQuestionRow);
  });

export const startBusinessReviews = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(startBusinessReviewsInputSchema)
  .handler(async ({ data, context }) => {
    return LocalSeoService.startBusinessReviews(data, context.project, context);
  });

export const collectBusinessReviews = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(collectBusinessReviewsInputSchema)
  .handler(async ({ data }) => {
    const outcome = await LocalSeoService.collectBusinessReviews(data.taskId);
    if (outcome.status === "processing") {
      return { status: "processing" as const };
    }
    return {
      status: "completed" as const,
      reviews: outcome.reviews.map(mapBusinessReviewRow),
      totals: outcome.totals ? mapBusinessReviewTotals(outcome.totals) : null,
    };
  });
