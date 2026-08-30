import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { LocalSeoPage } from "@/client/features/local-seo/LocalSeoPage";
import { localSeoSearchSchema } from "@/types/schemas/local-seo";

export const Route = createFileRoute("/_project/p/$projectId/local")({
  validateSearch: localSeoSearchSchema,
  component: LocalSeoRoute,
});

function LocalSeoRoute() {
  const { projectId } = Route.useParams();
  const navigate = useNavigate({ from: Route.fullPath });
  const { q = "", near = "", cid } = Route.useSearch();

  return (
    <LocalSeoPage
      projectId={projectId}
      initialQuery={q}
      initialNear={near}
      initialCid={cid}
      onSearchChange={(nextQuery, nextNear) => {
        void navigate({
          search: {
            q: nextQuery.trim() || undefined,
            near: nextNear,
            // A new search always re-opens candidate picking.
            cid: undefined,
          },
          replace: true,
        });
      }}
      onSelectBusiness={(nextCid) => {
        void navigate({
          search: (prev) => ({ ...prev, cid: nextCid }),
          replace: true,
        });
      }}
    />
  );
}
