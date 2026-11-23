import { useEffect, useState } from "react";

type CommunityCounts = { users: number; boards: number; seeds: number };
const cooldown = 3 * 60 * 60 * 1000;
const shownThisSession = new Map<string, number>();

function lastShown(key: string) {
  const inMemory = shownThisSession.get(key) ?? 0;
  try {
    return Math.max(inMemory, Number(localStorage.getItem(key)) || 0);
  } catch {
    return inMemory;
  }
}

export function CommunityBanner({ username }: { username: string }) {
  const [counts, setCounts] = useState<CommunityCounts | null>(null);

  useEffect(() => {
    const key = username ? "myneu-community-banner:" + username : "";
    if (key && Date.now() - lastShown(key) < cooldown) return;

    const controller = new AbortController();
    let timer: number | undefined;
    fetch("/api/community-stats?include=seeds", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) return;
        const result: CommunityCounts | null = await response.json();
        if (controller.signal.aborted || !result ||
            !Number.isSafeInteger(result.users) || result.users < 0 ||
            !Number.isSafeInteger(result.boards) || result.boards < 0 ||
            !Number.isSafeInteger(result.seeds) || result.seeds < 0) return;
        const now = Date.now();
        if (key) {
          if (now - lastShown(key) < cooldown) return;
          shownThisSession.set(key, now);
          try {
            localStorage.setItem(key, String(now));
          } catch {
            // Use the in-memory cooldown when browser storage is unavailable.
          }
        }
        setCounts(result);
        timer = window.setTimeout(() => setCounts(null), username ? 10_000 : 5_000);
      })
      .catch(() => {
        // The page remains usable if the counts are unavailable.
      });

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [username]);

  return (
    <div className="community-banner-region" role="status">
      {counts && (
        <div className="community-banner">
          <span><strong>{counts.users.toLocaleString()}</strong> registered {counts.users === 1 ? "user" : "users"}</span>
          <span aria-hidden="true">·</span>
          <span><strong>{counts.boards.toLocaleString()}</strong> saved {counts.boards === 1 ? "board" : "boards"}</span>
          <span aria-hidden="true">·</span>
          <span><strong>{counts.seeds.toLocaleString()}</strong> saved {counts.seeds === 1 ? "seed" : "seeds"}</span>
        </div>
      )}
    </div>
  );
}
