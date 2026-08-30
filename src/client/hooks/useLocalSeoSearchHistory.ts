import { z } from "zod";
import { useTimestampedSearchHistory } from "@/client/hooks/useTimestampedSearchHistory";

const localSeoSearchBodySchema = z.object({
  query: z.string(),
  // The raw "lat, lng" text the user searched near, when they gave one.
  near: z.string().optional(),
});

type LocalSeoSearchBody = z.infer<typeof localSeoSearchBodySchema>;

export type LocalSeoSearchHistoryItem = LocalSeoSearchBody & {
  timestamp: number;
};

export function useLocalSeoSearchHistory(projectId: string) {
  return useTimestampedSearchHistory({
    storageKey: `local-seo-search-history:${projectId}`,
    bodySchema: localSeoSearchBodySchema,
    isSame: (a, b) => a.query === b.query && a.near === b.near,
  });
}
