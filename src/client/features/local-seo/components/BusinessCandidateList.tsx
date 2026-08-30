import { ChevronRight } from "lucide-react";
import type { LocalBusinessRow } from "@/client/features/local-seo/localSeoPageTypes";

type Props = {
  businesses: LocalBusinessRow[];
  onSelect: (cid: string) => void;
};

/** Candidate rows from a nearby business search; picking one opens its profile. */
export function BusinessCandidateList({ businesses, onSelect }: Props) {
  if (businesses.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-base-300 bg-base-100/70 p-6 text-center text-base-content/60">
        No businesses matched near that coordinate. Widen the search or check
        the name spelling.
      </div>
    );
  }

  return (
    <div className="card border border-base-300 bg-base-100">
      <div className="card-body gap-3">
        <h2 className="text-sm font-semibold text-base-content/70">
          {businesses.length} matching business
          {businesses.length === 1 ? "" : "es"} — pick one
        </h2>
        <div className="overflow-x-auto">
          <table className="table table-sm">
            <thead>
              <tr>
                <th>Business</th>
                <th>Category</th>
                <th>Rating</th>
                <th>Reviews</th>
                <th>Address</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {businesses.map((row, index) => (
                <tr
                  key={row.cid ?? index}
                  className={row.cid ? "cursor-pointer hover:bg-base-200" : ""}
                  onClick={row.cid ? () => onSelect(row.cid!) : undefined}
                >
                  <td className="font-medium">{row.title}</td>
                  <td>{row.category}</td>
                  <td>{row.rating ?? "—"}</td>
                  <td>{row.reviewsCount ?? "—"}</td>
                  <td className="max-w-xs truncate">{row.address}</td>
                  <td>
                    {row.cid ? (
                      <ChevronRight className="size-4 text-base-content/40" />
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
