import { useEffect, useRef, useState } from "react";
import "./App.css";

type Seed = { id: string; text: string; x: number; y: number; image?: string };
type Board = { id: string; name: string; seeds: Seed[]; revision?: number };
const fresh = (): Board => ({
  id: crypto.randomUUID(),
  name: "My garden",
  seeds: [],
});
function App() {
  const [page, setPage] = useState<
    "home" | "auth" | "boards" | "board" | "account"
  >("home");
  const [board, setBoard] = useState<Board>(fresh);
  const [boards, setBoards] = useState<Board[]>([]);
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
  const [signup, setSignup] = useState(false);
  const [message, setMessage] = useState("");
  const [user, setUser] = useState("");
  const [paid, setPaid] = useState(false);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [recovery, setRecovery] = useState("");
  const [reset, setReset] = useState(false);
  const [saveStatus, setSaveStatus] = useState("");
  const surface = useRef<HTMLDivElement>(null);
  const pinch = useRef<{ distance: number; zoom: number } | null>(null);
  const revisions = useRef<Record<string, number>>({});
  const saveQueue = useRef<Promise<void>>(Promise.resolve());
  const update = (next: Board) => {
    setBoard(next);
    if (user) setBoards((old) => old.map((b) => (b.id === next.id ? next : b)));
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
  const openBoard = async (b: Board) => {
    try {
      const result = await api("boards/" + b.id);
      revisions.current[b.id] = result.revision;
      setBoard(result);
      setPage("board");
    } catch (error) {
      setMessage((error as Error).message);
    }
  };
  useEffect(() => {
    api("me")
      .then(async (data) => {
        setUser(data.username);
        setPaid(Boolean(data.paid));
        setBoards(await api("boards"));
      })
      .catch(() => {});
  }, []);
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
        setBoards((old) => old.map((b) => (b.id === next.id ? next : b)));
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
    <div className="app">
      <header>
        <button className="brand" onClick={() => setPage("home")}>
          <img src="/neu.svg" />
          myneu
        </button>
        <nav>
          {user && (
            <button onClick={() => setPage("boards")}>My gardens</button>
          )}
          <button onClick={() => setPage(user ? "account" : "auth")}>
            {user ? "Account" : "Sign in"}
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
                setPage("board");
              }}
            >
              Try a temporary garden ↗
            </button>
            <button
              className="secondary"
              onClick={() => {
                setSignup(true);
                setPage("auth");
              }}
            >
              Create an account
            </button>
          </div>
          <small>
            Guest gardens disappear when you leave. Create a free account to
            save yours.
          </small>
          <div className="preview">
            <div className="previewline" />
            <article>A thought worth keeping</article>
            <article>Something it reminds me of</article>
          </div>
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
                  setReset(false);
                  setMessage("Password changed. Please sign in.");
                  return;
                }
                setUser(data.username);
                const me = await api("me");
                setPaid(Boolean(me.paid));
                setBoards(await api("boards"));
                setPage("boards");
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
          <button className="textbutton" onClick={() => setSignup(!signup)}>
            {signup
              ? "Already have an account? Sign in"
              : "New here? Create an account"}
          </button>
          {!signup && (
            <button className="textbutton" onClick={() => setReset(!reset)}>
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
                  setBoards([...boards, b]);
                  setBoard(b);
                  setPage("board");
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
                <p>{b.seeds.length} thoughts</p>
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
                ? "Your subscription is active."
                : "Up to 20 boards with text seeds."}
            </p>
            {!paid && (
              <div className="actions">
                {[
                  ["year", "$88 / year"],
                  ["two-year", "$100 / two years"],
                ].map(([term, label]) => (
                  <button
                    key={term}
                    className="primary"
                    onClick={async () => {
                      try {
                        const result = await api("checkout", {
                          method: "POST",
                          body: JSON.stringify({ term }),
                        });
                        window.location.assign(result.url);
                      } catch (error) {
                        setMessage((error as Error).message);
                      }
                    }}
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
                setPage("home");
              }}
            >
              Sign out
            </button>
          </div>
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
