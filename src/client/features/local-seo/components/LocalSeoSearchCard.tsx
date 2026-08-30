import type { FormEvent } from "react";
import { MapPin, Search } from "lucide-react";
import { LOCAL_SEO_MAX_QUERY_LENGTH } from "@/types/schemas/local-seo";

type Props = {
  query: string;
  onQueryChange: (next: string) => void;
  near: string;
  onNearChange: (next: string) => void;
  onSubmit: (event: FormEvent) => void;
  isLoading: boolean;
  validationError: { field: "query" | "near"; message: string } | null;
};

export function LocalSeoSearchCard({
  query,
  onQueryChange,
  near,
  onNearChange,
  onSubmit,
  isLoading,
  validationError,
}: Props) {
  const queryError = validationError?.field === "query";
  const nearError = validationError?.field === "near";

  return (
    <div className="card border border-base-300 bg-base-100">
      <div className="card-body gap-4">
        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <label
              className={`input input-bordered flex flex-1 items-center gap-2 ${
                queryError ? "input-error" : ""
              }`}
            >
              <Search className="size-4 text-base-content/60" />
              <input
                type="text"
                placeholder="Business name as it appears on Google"
                value={query}
                maxLength={LOCAL_SEO_MAX_QUERY_LENGTH}
                onChange={(event) => onQueryChange(event.target.value)}
                aria-invalid={queryError || undefined}
                autoComplete="off"
                spellCheck={false}
                className="grow"
              />
            </label>
            <label
              className={`input input-bordered flex items-center gap-2 lg:w-72 ${
                nearError ? "input-error" : ""
              }`}
            >
              <MapPin className="size-4 text-base-content/60" />
              <input
                type="text"
                placeholder="Near: lat, lng (optional)"
                value={near}
                onChange={(event) => onNearChange(event.target.value)}
                aria-invalid={nearError || undefined}
                autoComplete="off"
                spellCheck={false}
                className="grow"
              />
            </label>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={isLoading}
            >
              {isLoading ? (
                <span className="loading loading-spinner loading-sm" />
              ) : null}
              Look up
            </button>
          </div>
          {validationError ? (
            <p className="text-sm text-error">{validationError.message}</p>
          ) : (
            <p className="text-xs text-base-content/50">
              Leave the coordinate empty to look the business up in your
              project&apos;s market; add a &quot;lat, lng&quot; center to search
              nearby listings instead. Lookups use credits.
            </p>
          )}
        </form>
      </div>
    </div>
  );
}
