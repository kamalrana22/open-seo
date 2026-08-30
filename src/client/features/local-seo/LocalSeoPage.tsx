import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle } from "lucide-react";
import {
  getBusinessProfile,
  searchLocalBusinesses,
} from "@/serverFunctions/local-seo";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { useLocalSeoSearchHistory } from "@/client/hooks/useLocalSeoSearchHistory";
import {
  LOCAL_SEO_MAX_QUERY_LENGTH,
  parseLatLng,
} from "@/types/schemas/local-seo";
import type { BusinessTarget } from "@/client/features/local-seo/localSeoPageTypes";
import { LocalSeoSearchCard } from "@/client/features/local-seo/components/LocalSeoSearchCard";
import { BusinessCandidateList } from "@/client/features/local-seo/components/BusinessCandidateList";
import { BusinessProfileCard } from "@/client/features/local-seo/components/BusinessProfileCard";
import { BusinessReviewsSection } from "@/client/features/local-seo/components/BusinessReviewsSection";
import { BusinessQuestionsSection } from "@/client/features/local-seo/components/BusinessQuestionsSection";
import { LocalSeoHistorySection } from "@/client/features/local-seo/components/LocalSeoHistorySection";

type Props = {
  projectId: string;
  initialQuery: string;
  initialNear: string;
  initialCid: string | undefined;
  onSearchChange: (nextQuery: string, nextNear: string | undefined) => void;
  onSelectBusiness: (cid: string) => void;
};

export function LocalSeoPage({
  projectId,
  initialQuery,
  initialNear,
  initialCid,
  onSearchChange,
  onSelectBusiness,
}: Props) {
  const [query, setQuery] = useState(initialQuery);
  const [near, setNear] = useState(initialNear);
  const [validationError, setValidationError] = useState<{
    field: "query" | "near";
    message: string;
  } | null>(null);

  const trimmedQuery = initialQuery.trim();
  const hasActiveQuery = trimmedQuery.length > 0;
  const parsedNear = useMemo(
    () => (initialNear ? parseLatLng(initialNear) : null),
    [initialNear],
  );

  // Two lookup shapes: a coordinate search lists candidates to pick from
  // (chains, ambiguous names); a plain name goes straight to the profile in
  // the project's market. A picked candidate (cid) is always a direct profile.
  const showCandidates = hasActiveQuery && parsedNear != null && !initialCid;
  const showProfile = initialCid != null || (hasActiveQuery && !parsedNear);

  const candidatesQuery = useQuery({
    queryKey: ["local-seo-candidates", projectId, trimmedQuery, initialNear],
    queryFn: () =>
      searchLocalBusinesses({
        data: { projectId, query: trimmedQuery, near: parsedNear! },
      }),
    enabled: showCandidates,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  const profileQuery = useQuery({
    queryKey: [
      "local-seo-profile",
      projectId,
      initialCid ?? "",
      trimmedQuery,
      initialNear,
    ],
    queryFn: () =>
      getBusinessProfile({
        data: initialCid
          ? {
              projectId,
              cid: initialCid,
              near: parsedNear ?? undefined,
            }
          : { projectId, businessName: trimmedQuery },
      }),
    enabled: showProfile,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  const {
    history,
    isLoaded: historyLoaded,
    addSearch,
    removeHistoryItem,
  } = useLocalSeoSearchHistory(projectId);

  // Dedup ref prevents repeat adds — `addSearch` identity is not stable
  // across renders, so we'd otherwise re-write the same item every render.
  const lastAddedKeyRef = useRef<string | null>(null);
  const lookupSucceeded =
    (showProfile && profileQuery.isSuccess) ||
    (showCandidates && candidatesQuery.isSuccess);
  useEffect(() => {
    if (!hasActiveQuery || !lookupSucceeded) return;
    const addedKey = `${trimmedQuery}::${initialNear}`;
    if (lastAddedKeyRef.current === addedKey) return;
    lastAddedKeyRef.current = addedKey;
    addSearch({ query: trimmedQuery, near: initialNear || undefined });
  }, [hasActiveQuery, lookupSucceeded, trimmedQuery, initialNear, addSearch]);

  // Keep the form in sync with the URL source of truth (back button, links).
  useEffect(() => {
    setQuery(initialQuery);
    setNear(initialNear);
    setValidationError(null);
  }, [initialQuery, initialNear]);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = query.trim();
    if (trimmed.length === 0) {
      setValidationError({ field: "query", message: "Enter a business name" });
      return;
    }
    if (trimmed.length > LOCAL_SEO_MAX_QUERY_LENGTH) {
      setValidationError({
        field: "query",
        message: `Keep it under ${LOCAL_SEO_MAX_QUERY_LENGTH} characters`,
      });
      return;
    }
    const trimmedNear = near.trim();
    if (trimmedNear !== "" && parseLatLng(trimmedNear) === null) {
      setValidationError({
        field: "near",
        message: 'Coordinates look like "40.7128, -74.0060"',
      });
      return;
    }
    setValidationError(null);
    onSearchChange(trimmed, trimmedNear || undefined);
  };

  const profile = showProfile ? (profileQuery.data ?? null) : null;
  const targetCid = profile?.cid ?? initialCid;
  const target: BusinessTarget | null = profile
    ? {
        identifier: targetCid
          ? { cid: targetCid }
          : { businessName: trimmedQuery },
        near:
          profile.latitude != null && profile.longitude != null
            ? { latitude: profile.latitude, longitude: profile.longitude }
            : parsedNear,
      }
    : null;

  const isLoading =
    (showProfile && profileQuery.isPending) ||
    (showCandidates && candidatesQuery.isPending);
  const errorMessage =
    showProfile && profileQuery.isError
      ? getStandardErrorMessage(profileQuery.error)
      : showCandidates && candidatesQuery.isError
        ? getStandardErrorMessage(candidatesQuery.error)
        : null;

  return (
    <div className="px-4 py-4 pb-24 overflow-auto md:px-6 md:py-6 md:pb-8">
      <div className="mx-auto max-w-5xl space-y-4">
        <div>
          <h1 className="text-2xl font-semibold">Local SEO</h1>
          <p className="text-sm text-base-content/70">
            Audit any Google Business Profile — yours or a competitor&apos;s:
            profile health, reviews, and Q&amp;A.
          </p>
        </div>

        <LocalSeoSearchCard
          query={query}
          onQueryChange={(next) => {
            setQuery(next);
            if (validationError) setValidationError(null);
          }}
          near={near}
          onNearChange={(next) => {
            setNear(next);
            if (validationError) setValidationError(null);
          }}
          onSubmit={handleSubmit}
          isLoading={isLoading}
          validationError={validationError}
        />

        {errorMessage ? (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-lg border border-error/30 bg-error/10 p-3 text-sm text-error"
          >
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        ) : null}

        {isLoading ? (
          <div className="flex items-center justify-center rounded-2xl border border-base-300 bg-base-100 p-10">
            <span className="loading loading-spinner loading-md" />
          </div>
        ) : showCandidates && candidatesQuery.isSuccess ? (
          <BusinessCandidateList
            businesses={candidatesQuery.data}
            onSelect={onSelectBusiness}
          />
        ) : showProfile && profileQuery.isSuccess ? (
          profile ? (
            <>
              <BusinessProfileCard profile={profile} />
              {target ? (
                <BusinessReviewsSection projectId={projectId} target={target} />
              ) : null}
              {target?.near ? (
                <BusinessQuestionsSection
                  projectId={projectId}
                  target={{ ...target, near: target.near }}
                />
              ) : null}
            </>
          ) : (
            <div className="rounded-2xl border border-dashed border-base-300 bg-base-100/70 p-6 text-center text-base-content/60">
              No Google Business Profile matched that name. Add a &quot;lat,
              lng&quot; coordinate to search nearby listings instead.
            </div>
          )
        ) : !errorMessage && !hasActiveQuery ? (
          <LocalSeoHistorySection
            projectId={projectId}
            history={history}
            historyLoaded={historyLoaded}
            onRemoveHistoryItem={removeHistoryItem}
          />
        ) : null}
      </div>
    </div>
  );
}
