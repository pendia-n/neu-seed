import { useEffect, useRef, useState } from "react";
import "./App.css";

type Seed = { id: string; text: string; x: number; y: number; image?: string };
type Board = { id: string; name: string; seeds: Seed[]; revision?: number };
type BoardSummary = { id: string; name: string; seed_count: number; revision?: number };
type Page = "home" | "auth" | "boards" | "board" | "pricing" | "account" | "not-found";
function pageForPath(path: string): Page {
  if (path === "/" || path === "/guest") return path === "/guest" ? "board" : "home";
  if (path === "/login" || path === "/signup" || path === "/forgot-password") return "auth";
  if (path === "/boards") return "boards";
  if (/^\/boards\/[^/]+$/.test(path)) return "board";
  if (path === "/pricing") return "pricing";
  if (path === "/account") return "account";
  return "not-found";
}
const fresh = (): Board => ({
  id: crypto.randomUUID(),
  name: "My garden",
  seeds: [],
});
function App() {
  const [path, setPath] = useState(() => window.location.pathname);
  const [page, setPage] = useState<Page>(() => pageForPath(window.location.pathname));
  const [board, setBoard] = useState<Board>(fresh);
  const [boards, setBoards] = useState<BoardSummary[]>([]);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [drag, setDrag] = useState<{
    id: string;
    x: number;
    y: number;
    startX: number;
    startY: number;
  } | null>(null);
  const [text, setText] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [signup, setSignup] = useState(window.location.pathname === "/signup");
  const [message, setMessage] = useState("");
  const [user, setUser] = useState("");
  const [paid, setPaid] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    try {
      return localStorage.getItem("myneu-theme") === "dark" ? "dark" : "light";
    } catch {
      return "light";
    }
  });
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [recovery, setRecovery] = useState("");
  const [reset, setReset] = useState(window.location.pathname === "/forgot-password");
  const [saveStatus, setSaveStatus] = useState("");
  const surface = useRef<HTMLDivElement>(null);
  const pinch = useRef<{ distance: number; zoom: number } | null>(null);
  const revisions = useRef<Record<string, number>>({});
  const saveQueue = useRef<Promise<void>>(Promise.resolve());
  const navigate = (path: string, replace = false) => {
    if (replace) window.history.replaceState(null, "", path);
    else window.history.pushState(null, "", path);
    setPath(path);
    setPage(pageForPath(path));
    setSignup(path === "/signup");
    setReset(path === "/forgot-password");
  };
  const startCheckout = async (term: "year" | "two-year") => {
    try {
      const result = await api("checkout", {
        method: "POST",
        body: JSON.stringify({ term }),
      });
      window.location.assign(result.url);
    } catch (error) {
      setMessage((error as Error).message);
    }
  };
  const update = (next: Board) => {
    setBoard(next);
    if (user)
      setBoards((old) => old.map((b) =>
        b.id === next.id ? { ...b, name: next.name, seed_count: next.seeds.length, revision: next.revision } : b,
      ));
  };
  const api = async (path: string, options?: RequestInit) => {
    const response = await fetch("/api/" + path, {
      ...options,
      headers: { "Content-Type": "application/json", ...options?.headers },
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Request failed");
    return data;
  };
  const openBoard = async (b: Pick<Board, "id">) => {
    try {
      const result = await api("boards/" + b.id);
      revisions.current[b.id] = result.revision;
      setBoard(result);
      navigate("/boards/" + b.id);
    } catch (error) {
      setMessage((error as Error).message);
    }
  };
  useEffect(() => {
    const syncLocation = () => {
      const path = window.location.pathname;
      setPath(path);
      setPage(pageForPath(path));
      setSignup(path === "/signup");
      setReset(path === "/forgot-password");
      if (path === "/guest") {
        setUser("");
        setBoard(fresh());
      }
    };
    window.addEventListener("popstate", syncLocation);
    api("me")
      .then(async (data) => {
        setUser(data.username);
        setPaid(Boolean(data.paid));
        setBoards(await api("boards"));
        const path = window.location.pathname;
        if (path === "/") navigate("/boards", true);
        else if (path === "/guest") navigate("/boards", true);
        else if (path === "/login" || path === "/signup") navigate("/boards", true);
      })
      .catch(() => {
        const path = window.location.pathname;
        if (path === "/guest") setBoard(fresh());
        else if (path === "/boards" || path.startsWith("/boards/") || path === "/account") navigate("/login", true);
        else if (path !== "/" && path !== "/login" && path !== "/signup" && path !== "/forgot-password" && path !== "/pricing") navigate("/", true);
      });
    return () => window.removeEventListener("popstate", syncLocation);
  }, []);
  useEffect(() => {
    document.documentElement.style.colorScheme = theme;
    try {
      localStorage.setItem("myneu-theme", theme);
    } catch {
      // Keep the selected theme for this session when storage is unavailable.
    }
  }, [theme]);
  useEffect(() => {
    if (!user || !path.startsWith("/boards/")) return;
    const id = path.slice("/boards/".length);
    if (id !== board.id) {
      api("boards/" + id)
        .then((savedBoard) => {
          revisions.current[id] = savedBoard.revision;
          setBoard(savedBoard);
        })
        .catch(() => navigate("/boards", true));
    }
  }, [user, path, board.id]);
  useEffect(() => {
    if (!user || page !== "board" || drag) return;
    const timer = setTimeout(() => {
      setSaveStatus("Saving…");
      saveQueue.current = saveQueue.current.then(async () => {
        try {
          const result = await api("boards/" + board.id, {
            method: "PUT",
            body: JSON.stringify({
              ...board,
              revision: revisions.current[board.id] ?? board.revision ?? 0,
            }),
          });
          revisions.current[board.id] = result.revision;
          setSaveStatus("Saved");
        } catch (error) {
          setSaveStatus((error as Error).message);
        }
      });
    }, 700);
    return () => clearTimeout(timer);
  }, [board, user, page, drag]);
  const add = () => {
    if (!text.trim()) return;
    const seeds = editing
      ? board.seeds.map((s) =>
          s.id === editing ? { ...s, text: text.trim() } : s,
        )
      : [
          ...board.seeds,
          {
            id: crypto.randomUUID(),
            text: text.trim(),
            x: (140 - pan.x) / zoom + board.seeds.length * 30,
            y: (130 - pan.y) / zoom + board.seeds.length * 30,
          },
        ];
    update({ ...board, seeds });
    setText("");
    setEditing(null);
    setAdding(false);
  };
  useEffect(() => {
    const move = (e: PointerEvent) => {
      if (!drag) return;
      const next = {
        ...board,
        seeds: board.seeds.map((s) =>
          s.id === drag.id
            ? {
                ...s,
                x: drag.startX + (e.clientX - drag.x) / zoom,
                y: drag.startY + (e.clientY - drag.y) / zoom,
              }
            : s,
        ),
      };
      setBoard(next);
      if (user)
        setBoards((old) => old.map((b) =>
          b.id === next.id ? { ...b, name: next.name, seed_count: next.seeds.length, revision: next.revision } : b,
        ));
    };
    const end = () => setDrag(null);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
    };
  }, [drag, board, zoom, user]);
  const lines = board.seeds.flatMap((a, i) =>
    board.seeds
      .slice(i + 1)
      .filter((b) => Math.hypot(a.x - b.x, a.y - b.y) < 220)
      .map((b) => (
        <line
          key={a.id + b.id}
          x1={a.x + 80}
          y1={a.y + 45}
          x2={b.x + 80}
          y2={b.y + 45}
        />
      )),
  );
  return (
    <div className="app" data-theme={theme}>
      <header>
        <button className="brand" onClick={() => navigate(user ? "/boards" : "/")}>
          <img src="/neu.svg" />
          myneu
        </button>
        <nav>
          {user && (
            <button onClick={() => navigate("/boards")}>My gardens</button>
          )}
          <button onClick={() => navigate("/pricing")}>Plans</button>
          <button onClick={() => navigate(user ? "/account" : "/login")}>
            {user ? "Account" : "Sign in"}
          </button>
          <button
            className="theme-toggle"
            aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            aria-pressed={theme === "dark"}
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          >
            <span aria-hidden="true">{theme === "dark" ? "☼" : "◐"}</span>
            {theme === "dark" ? "Light" : "Dark"}
          </button>
        </nav>
      </header>
      {page === "home" && (
        <main className="landing">
          <div className="eyebrow">A little space for your ideas</div>
          <h1>
            Give your thoughts
            <br />
            <em>room to grow.</em>
          </h1>
          <p>
            Capture a thought, move it closer to another, and see where your
            ideas connect.
          </p>
          <div className="actions">
            <button
              className="primary"
              onClick={() => {
                setUser("");
                setBoard(fresh());
                navigate("/guest");
              }}
            >
              Try a temporary garden ↗
            </button>
            <button
              className="secondary"
              onClick={() => {
                navigate("/signup");
              }}
            >
              Create an account
            </button>
          </div>
          <small>
            Guest gardens disappear when you leave. Create a free account to
            save yours.
          </small>
          <p className="plan-link">
            <button className="textbutton" onClick={() => navigate("/pricing")}>Compare free and paid plans →</button>
          </p>
          <div className="preview">
            <div className="previewline" />
            <article>A thought worth keeping</article>
            <article>Something it reminds me of</article>
          </div>
        </main>
      )}
      {page === "pricing" && (
        <main className="pricing-page">
          <div className="pricing-intro">
            <span className="eyebrow">ROOM FOR EVERY KIND OF THINKING</span>
            <h1>Start small. Keep growing.</h1>
            <p>See what is saved, what is temporary, and what a subscription adds.</p>
          </div>
          <div className="plan-grid">
            <article className="plan-card">
              <span className="eyebrow">JUST TRYING IT</span>
              <h2>Guest garden</h2>
              <div className="plan-price">Free</div>
              <ul>
                <li>One temporary board</li>
                <li>Text seeds only</li>
                <li>Ideas disappear when you leave</li>
              </ul>
              <button className="secondary" onClick={() => {
                setUser("");
                setBoard(fresh());
                navigate("/guest");
              }}>Try a temporary garden</button>
            </article>
            <article className="plan-card">
              <span className="eyebrow">SAVED TO YOUR ACCOUNT</span>
              <h2>Free account</h2>
              <div className="plan-price">$0</div>
              <ul>
                <li>Up to 20 boards</li>
                <li>Text seeds</li>
                <li>Boards saved to your account</li>
                <li>No image seeds</li>
              </ul>
              <button className="secondary" onClick={() => navigate(user ? "/boards" : "/signup")}>
                {user ? "Go to my gardens" : "Create a free account"}
              </button>
            </article>
            <article className="plan-card subscriber-card">
              <span className="eyebrow">MORE ROOM TO GROW</span>
              <h2>Subscriber</h2>
              <div className="plan-price">From $88</div>
              <ul>
                <li>Unlimited boards</li>
                <li>Text and image seeds</li>
                <li>Images up to 5 MB</li>
                <li>Boards and images saved to your account</li>
              </ul>
              {paid ? (
                <button className="primary" onClick={() => navigate("/account")}>Manage subscription</button>
              ) : (
                <div className="price-actions">
                  <button className="primary" onClick={() => user ? void startCheckout("year") : navigate("/signup")}>
                    $88 / year
                  </button>
                  <button className="primary" onClick={() => user ? void startCheckout("two-year") : navigate("/signup")}>
                    $100 / 2 years
                  </button>
                </div>
              )}
            </article>
          </div>
          <p className="billing-note">Your subscription renews every year or every two years, based on your choice. Cancel anytime from your account; paid features stay available through the end of the period you paid for. Payments are non-refundable, subject to applicable law.</p>
          <p className="checkout-message" role="status">{message}</p>
        </main>
      )}
      {page === "auth" && (
        <main className="narrow">
          <span className="eyebrow">YOUR GARDEN AWAITS</span>
          <h1>{signup ? "Plant your first garden." : "Welcome back."}</h1>
          <p>
            {signup
              ? "Create an account to keep your ideas close."
              : "Sign in to return to your thoughts."}
          </p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setMessage("");
              try {
                const data = await api(
                  reset
                    ? "auth/reset"
                    : signup
                      ? "auth/register"
                      : "auth/login",
                  {
                    method: "POST",
                    body: JSON.stringify({ username, password, recovery }),
                  },
                );
                if (reset) {
                  setMessage("Password changed. Please sign in.");
                  navigate("/login", true);
                  return;
                }
                setUser(data.username);
                const me = await api("me");
                setPaid(Boolean(me.paid));
                setBoards(await api("boards"));
                navigate("/boards", true);
              } catch (error) {
                setMessage((error as Error).message);
              }
            }}
          >
            <label>
              Username
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                autoComplete="username"
              />
            </label>
            <label>
              Password
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete={signup ? "new-password" : "current-password"}
              />
            </label>
            {(signup || reset) && (
              <label>
                Recovery code {signup && "(optional)"}
                <input
                  type="password"
                  value={recovery}
                  onChange={(e) => setRecovery(e.target.value)}
                  placeholder="At least 12 characters"
                />
              </label>
            )}
            <button className="primary">
              {reset ? "Reset password" : signup ? "Create account" : "Sign in"}
            </button>
          </form>
          <button className="textbutton" onClick={() => navigate(signup ? "/login" : "/signup")}>
            {signup ? "Already have an account? Sign in" : "New here? Create an account"}
          </button>
          {!signup && (
            <button className="textbutton" onClick={() => navigate(reset ? "/login" : "/forgot-password")}>
              {reset ? "Back to sign in" : "Forgot password?"}
            </button>
          )}
          <p className="notice">{message}</p>
        </main>
      )}
      {page === "boards" && (
        <main className="content">
          <span className="eyebrow">YOUR SPACE TO THINK</span>
          <div className="row">
            <h1>My gardens</h1>
            <button
              className="primary"
              onClick={async () => {
                const b = fresh();
                revisions.current[b.id] = 0;
                try {
                  await api("boards", {
                    method: "POST",
                    body: JSON.stringify(b),
                  });
                  setBoards([...boards, { id: b.id, name: b.name, revision: 0, seed_count: 0 }]);
                  setBoard(b);
                  navigate("/boards/" + b.id);
                } catch (error) {
                  setMessage((error as Error).message);
                }
              }}
            >
              + New board
            </button>
          </div>
          <p>{message}</p>
          <div className="grid">
            {boards.map((b) => (
              <button
                className="boardcard"
                key={b.id}
                onClick={() => openBoard(b)}
              >
                <span>✳</span>
                <h2>{b.name}</h2>
                <p>{b.seed_count ?? 0} {b.seed_count === 1 ? "thought" : "thoughts"}</p>
              </button>
            ))}
          </div>
        </main>
      )}
      {page === "board" && (
        <main className="boardpage">
          <div className="boardbar">
            <div>
              <span className="eyebrow">
                {user ? "YOUR GARDEN" : "TEMPORARY GUEST GARDEN"}
              </span>
              <input
                className="boardname"
                aria-label="Board name"
                value={board.name}
                maxLength={100}
                onChange={(e) => update({ ...board, name: e.target.value })}
              />
              {user && <small>{saveStatus}</small>}
            </div>
            <button className="primary" onClick={() => setAdding(true)}>
              + Plant a thought
            </button>
          </div>
          <div
            className="surface"
            ref={surface}
            onTouchStart={(e) => {
              if (e.touches.length === 2) {
                setDrag(null);
                pinch.current = {
                  distance: Math.hypot(
                    e.touches[0].clientX - e.touches[1].clientX,
                    e.touches[0].clientY - e.touches[1].clientY,
                  ),
                  zoom,
                };
              }
            }}
            onTouchMove={(e) => {
              if (e.touches.length === 2 && pinch.current) {
                const d = Math.hypot(
                  e.touches[0].clientX - e.touches[1].clientX,
                  e.touches[0].clientY - e.touches[1].clientY,
                );
                setZoom(
                  Math.max(
                    0.3,
                    Math.min(
                      2,
                      (pinch.current.zoom * d) / pinch.current.distance,
                    ),
                  ),
                );
              }
            }}
            onTouchEnd={() => {
              pinch.current = null;
            }}
            onPointerDown={(e) => {
              if (e.target === e.currentTarget) {
                const start = { x: e.clientX, y: e.clientY, pan };
                const move = (v: PointerEvent) =>
                  setPan({
                    x: start.pan.x + v.clientX - start.x,
                    y: start.pan.y + v.clientY - start.y,
                  });
                const end = () => {
                  window.removeEventListener("pointermove", move);
                  window.removeEventListener("pointerup", end);
                };
                window.addEventListener("pointermove", move);
                window.addEventListener("pointerup", end);
              }
            }}
          >
            <div
              className="world"
              style={{
                transform: `translate(${pan.x}px,${pan.y}px) scale(${zoom})`,
              }}
            >
              <svg className="connections">{lines}</svg>
              {board.seeds.map((s) => (
                <div
                  key={s.id}
                  className={"seed " + (zoom < 0.55 ? "dot" : "")}
                  style={{
                    left: s.x + (zoom < 0.55 ? 70 : 0),
                    top: s.y + (zoom < 0.55 ? 35 : 0),
                  }}
                  onDoubleClick={() => {
                    setEditing(s.id);
                    setText(s.text);
                    setAdding(true);
                  }}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    setDrag({
                      id: s.id,
                      x: e.clientX,
                      y: e.clientY,
                      startX: s.x,
                      startY: s.y,
                    });
                  }}
                >
                  {zoom >= 0.55 && (
                    <>
                      <span className="seedicon">✳</span>
                      {s.image && (
                        <img
                          className="seedimage"
                          src={"/api/images/" + encodeURIComponent(s.image)}
                          alt={s.text || "Image thought"}
                        />
                      )}
                      <p>{s.text}</p>
                      <button
                        className="editseed"
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={() => {
                          setEditing(s.id);
                          setText(s.text);
                          setAdding(true);
                        }}
                      >
                        Edit
                      </button>
                      <button
                        aria-label="Delete seed"
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={() =>
                          update({
                            ...board,
                            seeds: board.seeds.filter((v) => v.id !== s.id),
                          })
                        }
                      >
                        ×
                      </button>
                    </>
                  )}
                </div>
              ))}
            </div>
            {board.seeds.length === 0 && (
              <div className="empty">
                <span>✳</span>
                <h2>A little room to begin.</h2>
                <p>
                  Plant a thought, then move it close to another to connect
                  them.
                </p>
                <button className="secondary" onClick={() => setAdding(true)}>
                  Plant your first thought
                </button>
              </div>
            )}
            <div className="zoom">
              <button onClick={() => setZoom(Math.min(2, zoom + 0.2))}>
                +
              </button>
              <button onClick={() => setZoom(Math.max(0.3, zoom - 0.2))}>
                −
              </button>
              <button
                onClick={() => {
                  setZoom(1);
                  setPan({ x: 0, y: 0 });
                }}
              >
                ⌂
              </button>
            </div>
          </div>
        </main>
      )}
      {page === "account" && (
        <main className="narrow">
          <span className="eyebrow">YOUR ACCOUNT</span>
          <h1>Your garden, growing.</h1>
          <p>Manage your plan and account.</p>
          <div className="plan">
            <h2>{paid ? "Subscriber" : "Free garden"}</h2>
            <p>
              {paid
                ? "Your subscription is active. You can create unlimited boards and add image seeds."
                : "Your free account includes up to 20 saved text boards. Subscribers can create unlimited boards and add image seeds."}
            </p>
            <button className="textbutton" onClick={() => navigate("/pricing")}>Compare plans</button>
            {!paid && (
              <div className="actions">
                {[
                  ["year", "$88 / year"],
                  ["two-year", "$100 / two years"],
                ].map(([term, label]) => (
                  <button
                    key={term}
                    className="primary"
                    onClick={() => void startCheckout(term as "year" | "two-year")}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
            {paid && (
              <button
                className="secondary"
                onClick={async () => {
                  try {
                    const result = await api("billing-portal", {
                      method: "POST",
                    });
                    window.location.assign(result.url);
                  } catch (error) {
                    setMessage((error as Error).message);
                  }
                }}
              >
                Manage subscription
              </button>
            )}
            {!paid && (
              <small>
                Subscriptions renew automatically at the selected term. No
                refunds, subject to applicable law.
              </small>
            )}
            <p>{message}</p>
            <button
              className="textbutton"
              onClick={async () => {
                await api("auth/logout", { method: "POST" });
                setUser("");
                setPaid(false);
                setBoards([]);
                navigate("/", true);
              }}
            >
              Sign out
            </button>
          </div>
        </main>
      )}
      {page === "not-found" && (
        <main className="narrow">
          <span className="eyebrow">THIS PATH HAS NO GARDEN</span>
          <h1>Let’s find your way back.</h1>
          <button
            className="primary"
            onClick={() => navigate(user ? "/boards" : "/")}
          >
            {user ? "My gardens" : "Back to myneu"}
          </button>
        </main>
      )}
      {adding && (
        <div className="overlay">
          <div className="modal">
            <button
              className="close"
              onClick={() => {
                setAdding(false);
                setEditing(null);
                setText("");
              }}
            >
              ×
            </button>
            <span className="eyebrow">A NEW SEED</span>
            <h2>{editing ? "Edit your thought" : "What’s on your mind?"}</h2>
            {paid && !editing && (
              <label className="upload">
                Add an image
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    try {
                      const response = await fetch("/api/images", {
                        method: "POST",
                        headers: { "Content-Type": file.type },
                        body: file,
                      });
                      const data = await response.json();
                      if (!response.ok) throw new Error(data.error);
                      update({
                        ...board,
                        seeds: [
                          ...board.seeds,
                          {
                            id: crypto.randomUUID(),
                            text: file.name,
                            image: data.key,
                            x: (140 - pan.x) / zoom,
                            y: (130 - pan.y) / zoom,
                          },
                        ],
                      });
                      setAdding(false);
                    } catch (error) {
                      setMessage((error as Error).message);
                    }
                  }}
                />
              </label>
            )}
            <p>{message}</p>
            <textarea
              autoFocus
              placeholder="Let the thought come as it is…"
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
            <button className="primary" onClick={add}>
              {editing ? "Save thought" : "Plant this thought"}
            </button>
          </div>
        </div>
      )}
      {page !== "board" && (
        <footer>
          <img src="/neu.svg" /> <span>myneu · A little space to think.</span>
        </footer>
      )}
    </div>
  );
}
export default App;
