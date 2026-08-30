import { Link } from "@tanstack/react-router";
import { MapPin } from "lucide-react";
import {
  HISTORY_ITEM_LINK_CLASS,
  SearchHistorySection,
} from "@/client/features/ai-search/components/SearchHistorySection";
import type { LocalSeoSearchHistoryItem } from "@/client/hooks/useLocalSeoSearchHistory";

type Props = {
  projectId: string;
  history: LocalSeoSearchHistoryItem[];
  historyLoaded: boolean;
  onRemoveHistoryItem: (timestamp: number) => void;
};

export function LocalSeoHistorySection({ projectId, ...props }: Props) {
  return (
    <SearchHistorySection
      {...props}
      emptyIcon={MapPin}
      emptyMessage="Look up a business to audit its Google Business Profile"
      noun="lookup"
      renderItemLink={(item, content) => (
        <Link
          from="/p/$projectId/local"
          to="/p/$projectId/local"
          params={{ projectId }}
          search={{ q: item.query, near: item.near, cid: undefined }}
          replace
          className={HISTORY_ITEM_LINK_CLASS}
        >
          {content}
        </Link>
      )}
      renderItem={(item) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-base-content">{item.query}</p>
          {item.near ? (
            <p className="truncate text-xs text-base-content/50">
              near {item.near}
            </p>
          ) : null}
        </div>
      )}
    />
  );
}
