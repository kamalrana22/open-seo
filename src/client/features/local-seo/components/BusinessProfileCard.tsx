import { BadgeCheck, ExternalLink, Star } from "lucide-react";
import type { BusinessProfileData } from "@/client/features/local-seo/localSeoPageTypes";

type Props = {
  profile: BusinessProfileData;
};

export function BusinessProfileCard({ profile }: Props) {
  const breakdownTotal = profile.ratingDistribution.reduce(
    (sum, row) => sum + row.count,
    0,
  );

  const facts: Array<[string, string | null]> = [
    ["Address", profile.address],
    ["Phone", profile.phone],
    ["Open now", profile.currentStatus],
    [
      "Photos",
      profile.totalPhotos != null ? String(profile.totalPhotos) : null,
    ],
    ["CID", profile.cid],
  ];

  return (
    <div className="card border border-base-300 bg-base-100">
      <div className="card-body gap-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              {profile.title ?? "Business profile"}
              {profile.isClaimed == null ? null : profile.isClaimed ? (
                <span className="badge badge-success badge-sm gap-1">
                  <BadgeCheck className="size-3" /> claimed
                </span>
              ) : (
                <span className="badge badge-warning badge-sm">unclaimed</span>
              )}
            </h2>
            <p className="text-sm text-base-content/60">
              {profile.category}
              {profile.additionalCategories.length > 0
                ? ` · ${profile.additionalCategories.join(", ")}`
                : null}
            </p>
          </div>
          {profile.url ? (
            <a
              href={profile.url}
              target="_blank"
              rel="noreferrer"
              className="btn btn-ghost btn-sm gap-1"
            >
              Website <ExternalLink className="size-3.5" />
            </a>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-x-8 gap-y-4">
          <div>
            <p className="flex items-center gap-1 text-2xl font-semibold">
              <Star className="size-5 fill-warning text-warning" />
              {profile.rating ?? "—"}
            </p>
            <p className="text-xs text-base-content/60">
              {profile.reviewsCount != null
                ? `${profile.reviewsCount} Google reviews`
                : "no review count"}
            </p>
          </div>
          {breakdownTotal > 0 ? (
            <div className="min-w-56 flex-1 space-y-1">
              {profile.ratingDistribution.map(({ star, count }) => (
                <div key={star} className="flex items-center gap-2 text-xs">
                  <span className="w-6 text-base-content/60">{star}★</span>
                  <progress
                    className="progress progress-warning h-1.5 flex-1"
                    value={count}
                    max={breakdownTotal}
                  />
                  <span className="w-10 text-right text-base-content/60">
                    {count}
                  </span>
                </div>
              ))}
            </div>
          ) : null}
        </div>

        <dl className="grid gap-x-8 gap-y-1 text-sm sm:grid-cols-2">
          {facts
            .filter((fact): fact is [string, string] => fact[1] != null)
            .map(([label, value]) => (
              <div key={label} className="flex gap-2">
                <dt className="w-20 shrink-0 text-base-content/50">{label}</dt>
                <dd className="truncate">{value}</dd>
              </div>
            ))}
        </dl>
      </div>
    </div>
  );
}
