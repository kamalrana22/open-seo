import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AlertCircle, MessageSquareReply, Star } from "lucide-react";
import {
  collectBusinessReviews,
  startBusinessReviews,
} from "@/serverFunctions/local-seo";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import type { BusinessTarget } from "@/client/features/local-seo/localSeoPageTypes";

type Props = {
  projectId: string;
  target: BusinessTarget;
};

const COLLECT_POLL_MS = 4000;

export function BusinessReviewsSection({ projectId, target }: Props) {
  // The posted task's resumable id; collection polls for free until done.
  const [taskId, setTaskId] = useState<string | null>(null);

  const start = useMutation({
    mutationFn: () =>
      startBusinessReviews({
        data: {
          projectId,
          ...target.identifier,
          near: target.near ?? undefined,
        },
      }),
    onSuccess: (result) => setTaskId(result.taskId),
  });

  const collect = useQuery({
    queryKey: ["local-seo-reviews", projectId, taskId],
    queryFn: () =>
      collectBusinessReviews({ data: { projectId, taskId: taskId! } }),
    enabled: taskId != null,
    // Posting is the only metered step; polling collects for free until the
    // queued DataForSEO task settles.
    refetchInterval: (query) =>
      query.state.data?.status === "processing" ? COLLECT_POLL_MS : false,
    staleTime: Infinity,
    retry: false,
  });

  const errorMessage = start.isError
    ? getStandardErrorMessage(start.error)
    : collect.isError
      ? getStandardErrorMessage(collect.error)
      : null;
  const isWorking =
    start.isPending ||
    (taskId != null &&
      (collect.isPending || collect.data?.status === "processing"));
  const completed = collect.data?.status === "completed" ? collect.data : null;
  // The serialized union loses the status discriminant, so reviews stays
  // optional after narrowing; a completed outcome always carries the array.
  const reviews = completed?.reviews ?? [];

  return (
    <div className="card border border-base-300 bg-base-100">
      <div className="card-body gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-base-content/70">
            Reviews
          </h2>
          {completed == null ? (
            <button
              type="button"
              className="btn btn-sm"
              disabled={isWorking}
              onClick={() => start.mutate()}
            >
              {isWorking ? (
                <span className="loading loading-spinner loading-xs" />
              ) : null}
              {isWorking ? "Collecting…" : "Collect reviews (uses credits)"}
            </button>
          ) : null}
        </div>

        {errorMessage ? (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-lg border border-error/30 bg-error/10 p-3 text-sm text-error"
          >
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        ) : null}

        {completed == null && !isWorking && !errorMessage ? (
          <p className="text-xs text-base-content/50">
            Collect the latest Google reviews with rating, text, and whether the
            owner replied — unanswered reviews are quick wins.
          </p>
        ) : null}

        {isWorking && taskId != null ? (
          <p className="text-xs text-base-content/50">
            Google review collection is queued at the provider; this usually
            settles within a minute.
          </p>
        ) : null}

        {completed ? (
          <div className="space-y-3">
            {completed.totals?.reviewsCount != null ? (
              <p className="text-xs text-base-content/60">
                Showing {reviews.length} of {completed.totals.reviewsCount}{" "}
                reviews.
              </p>
            ) : null}
            {reviews.length === 0 ? (
              <p className="text-sm text-base-content/60">
                This profile has no reviews yet.
              </p>
            ) : (
              <ul className="space-y-3">
                {reviews.map((review, index) => (
                  <li
                    key={review.reviewId ?? index}
                    className="rounded-lg border border-base-300 p-3"
                  >
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="flex items-center gap-1 font-medium">
                        <Star className="size-3.5 fill-warning text-warning" />
                        {review.rating ?? "—"}
                      </span>
                      <span className="text-base-content/70">
                        {review.author}
                      </span>
                      <span className="text-xs text-base-content/50">
                        {review.timeAgo}
                      </span>
                      {review.ownerReplied ? (
                        <span className="badge badge-ghost badge-sm gap-1">
                          <MessageSquareReply className="size-3" /> owner
                          replied
                        </span>
                      ) : (
                        <span className="badge badge-warning badge-sm">
                          unanswered
                        </span>
                      )}
                    </div>
                    {review.text ? (
                      <p className="mt-1 text-sm text-base-content/80">
                        {review.text}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
