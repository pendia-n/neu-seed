interface AppEnv {
  DB: D1Database;
  IMAGES: R2Bucket;
  JWT_SECRET: string;
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
}
const encoder = new TextEncoder();
const b64 = (v: Uint8Array) =>
  btoa(String.fromCharCode(...v))
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
const encode = (v: unknown) => b64(encoder.encode(JSON.stringify(v)));
async function signature(value: string, secret: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return b64(
    new Uint8Array(
      await crypto.subtle.sign("HMAC", key, encoder.encode(value)),
    ),
  );
}
async function token(id: string, secret: string, version = 0) {
  const body = encode({
    sub: id,
    version,
    exp: Math.floor(Date.now() / 1000) + 604800,
  });
  const value = encode({ alg: "HS256", typ: "JWT" }) + "." + body;
  return value + "." + (await signature(value, secret));
}
async function identity(request: Request, secret: string) {
  const jwt = request.headers
    .get("Cookie")
    ?.match(/(?:^|; )session=([^;]+)/)?.[1];
  if (!jwt) return null;
  const parts = jwt.split(".");
  if (parts.length !== 3) return null;
  const value = parts[0] + "." + parts[1];
  const expected = await signature(value, secret);
  if (expected.length !== parts[2].length) return null;
  let difference = 0;
  for (let i = 0; i < expected.length; i++)
    difference |= expected.charCodeAt(i) ^ parts[2].charCodeAt(i);
  if (difference) return null;
  try {
    const body = JSON.parse(
      atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")),
    );
    return body.exp > Date.now() / 1000 ? body : null;
  } catch {
    return null;
  }
}
async function hashPassword(password: string, salt: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  return b64(
    new Uint8Array(
      await crypto.subtle.deriveBits(
        {
          name: "PBKDF2",
          hash: "SHA-256",
          salt: encoder.encode(salt),
          iterations: 100000,
        },
        key,
        256,
      ),
    ),
  );
}
const reply = (data: unknown, status = 200, headers: HeadersInit = {}) =>
  Response.json(data, { status, headers });
export default {
  async fetch(request: Request, env: AppEnv) {
    const url = new URL(request.url);
    const path = url.pathname;
    if (!path.startsWith("/api/"))
      return new Response("Not found", { status: 404 });
    if (!env.DB || !env.JWT_SECRET)
      return reply({ error: "Account service unavailable" }, 503);
    if (path === "/api/stripe/webhook" && request.method === "POST") {
      if (!env.STRIPE_WEBHOOK_SECRET || !env.STRIPE_SECRET_KEY)
        return reply({ error: "Billing unavailable" }, 503);
      const payload = await request.text();
      const header = request.headers.get("Stripe-Signature") || "";
      const fields = header.split(",");
      const timestamp = fields.find((v) => v.startsWith("t="))?.slice(2);
      const signatures = fields
        .filter((v) => v.startsWith("v1="))
        .map((v) => v.slice(3));
      if (!timestamp || Math.abs(Date.now() / 1000 - Number(timestamp)) > 300)
        return reply({ error: "Invalid signature" }, 400);
      const key = await crypto.subtle.importKey(
        "raw",
        encoder.encode(env.STRIPE_WEBHOOK_SECRET),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"],
      );
      const digest = Array.from(
        new Uint8Array(
          await crypto.subtle.sign(
            "HMAC",
            key,
            encoder.encode(timestamp + "." + payload),
          ),
        ),
      )
        .map((n) => n.toString(16).padStart(2, "0"))
        .join("");
      if (
        !signatures.some((candidate) => {
          if (candidate.length !== digest.length) return false;
          let diff = 0;
          for (let i = 0; i < digest.length; i++)
            diff |= candidate.charCodeAt(i) ^ digest.charCodeAt(i);
          return diff === 0;
        })
      )
        return reply({ error: "Invalid signature" }, 400);
      const event = JSON.parse(payload) as {
        type: string;
        data: { object: { id: string; subscription?: string } };
      };
      let subscriptionId: string | undefined;
      if (event.type.startsWith("customer.subscription."))
        subscriptionId = event.data.object.id;
      if (event.type === "checkout.session.completed")
        subscriptionId = event.data.object.subscription;
      if (subscriptionId) {
        const response = await fetch(
          "https://api.stripe.com/v1/subscriptions/" +
            encodeURIComponent(subscriptionId),
          { headers: { Authorization: "Bearer " + env.STRIPE_SECRET_KEY } },
        );
        if (!response.ok) return reply({ error: "Stripe unavailable" }, 502);
        const subscription = (await response.json()) as {
          id: string;
          customer: string;
          status: string;
          metadata: { user_id?: string };
          current_period_end?: number;
        };
        const owner = subscription.metadata?.user_id;
        if (owner)
          await env.DB.prepare(
            "INSERT INTO subscriptions (user_id,stripe_customer_id,stripe_subscription_id,status,period_end) VALUES (?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET stripe_customer_id=excluded.stripe_customer_id,stripe_subscription_id=excluded.stripe_subscription_id,status=excluded.status,period_end=excluded.period_end",
          )
            .bind(
              owner,
              subscription.customer,
              subscription.id,
              subscription.status,
              subscription.current_period_end || null,
            )
            .run();
      }
      return reply({ received: true });
    }
    if (
      request.method !== "GET" &&
      request.headers.get("Origin") !== url.origin
    )
      return reply({ error: "Invalid origin" }, 403);
    try {
      if (path === "/api/auth/register" && request.method === "POST") {
        const body = (await request.json()) as {
          username: string;
          password: string;
          recovery?: string;
        };
        const username = body.username?.trim();
        if (
          !/^[a-zA-Z0-9_]{3,32}$/.test(username || "") ||
          !body.password ||
          body.password.length < 10 ||
          body.password.length > 256
        )
          return reply(
            {
              error:
                "Use a 3–32 character username and a password of at least 10 characters.",
            },
            400,
          );
        if (body.recovery && body.recovery.length < 12)
          return reply(
            { error: "Recovery code must have at least 12 characters." },
            400,
          );
        const id = crypto.randomUUID(),
          salt = crypto.randomUUID(),
          rs = body.recovery ? crypto.randomUUID() : null;
        const passwordHash = await hashPassword(body.password, salt),
          recoveryHash = rs ? await hashPassword(body.recovery!, rs) : null;
        try {
          await env.DB.prepare(
            "INSERT INTO users (id,username,password_hash,password_salt,recovery_hash,recovery_salt,created_at) VALUES (?,?,?,?,?,?,?)",
          )
            .bind(
              id,
              username,
              passwordHash,
              salt,
              recoveryHash,
              rs,
              Date.now(),
            )
            .run();
        } catch {
          return reply({ error: "Username is unavailable." }, 409);
        }
        return reply({ username }, 200, {
          "Set-Cookie": `session=${await token(id, env.JWT_SECRET)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=604800`,
        });
      }
      if (
        (path === "/api/auth/login" ||
          path === "/api/auth/reset" ||
          path === "/api/auth/register") &&
        request.method === "POST"
      ) {
        const ip = request.headers.get("CF-Connecting-IP") || "local";
        const now = Date.now();
        const attempt = await env.DB.prepare(
          "INSERT INTO auth_attempts (key,attempts,window_start) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN window_start<? THEN 1 ELSE attempts+1 END,window_start=CASE WHEN window_start<? THEN excluded.window_start ELSE window_start END RETURNING attempts",
        )
          .bind(ip, now, now - 900000, now - 900000)
          .first<{ attempts: number }>();
        if ((attempt?.attempts || 0) > 25)
          return reply(
            { error: "Too many attempts. Please try again later." },
            429,
          );
      }
      if (path === "/api/auth/login" && request.method === "POST") {
        const body = (await request.json()) as {
          username: string;
          password: string;
        };
        const user = await env.DB.prepare(
          "SELECT * FROM users WHERE username = ? COLLATE NOCASE",
        )
          .bind(body.username?.trim())
          .first<{
            id: string;
            username: string;
            password_hash: string;
            password_salt: string;
            session_version: number;
          }>();
        if (
          !user ||
          (await hashPassword(body.password || "", user.password_salt)) !==
            user.password_hash
        )
          return reply({ error: "Incorrect username or password." }, 401);
        return reply({ username: user.username }, 200, {
          "Set-Cookie": `session=${await token(user.id, env.JWT_SECRET, user.session_version)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=604800`,
        });
      }
      if (path === "/api/auth/reset" && request.method === "POST") {
        const body = (await request.json()) as {
          username: string;
          recovery: string;
          password: string;
        };
        const user = await env.DB.prepare(
          "SELECT * FROM users WHERE username = ? COLLATE NOCASE",
        )
          .bind(body.username?.trim())
          .first<{
            id: string;
            recovery_hash: string;
            recovery_salt: string;
          }>();
        if (
          !user?.recovery_hash ||
          (await hashPassword(body.recovery || "", user.recovery_salt)) !==
            user.recovery_hash
        )
          return reply({ error: "Invalid username or recovery code." }, 400);
        if (
          !body.password ||
          body.password.length < 10 ||
          body.password.length > 256
        )
          return reply(
            { error: "Password must be at least 10 characters." },
            400,
          );
        const salt = crypto.randomUUID();
        await env.DB.prepare(
          "UPDATE users SET password_hash=?,password_salt=?,session_version=session_version+1 WHERE id=?",
        )
          .bind(await hashPassword(body.password, salt), salt, user.id)
          .run();
        return reply({ ok: true });
      }
      if (path === "/api/auth/logout" && request.method === "POST")
        return reply({ ok: true }, 200, {
          "Set-Cookie":
            "session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0",
        });
      const session = await identity(request, env.JWT_SECRET);
      if (!session) return reply({ error: "Sign in required." }, 401);
      const current = await env.DB.prepare(
        "SELECT session_version FROM users WHERE id=?",
      )
        .bind(session.sub)
        .first<{ session_version: number }>();
      if (!current || current.session_version !== session.version)
        return reply({ error: "Session expired." }, 401);
      const userId = session.sub as string;
      const subscription = await env.DB.prepare(
        "SELECT status FROM subscriptions WHERE user_id=?",
      )
        .bind(userId)
        .first<{ status: string }>();
      const paid =
        subscription?.status === "active" ||
        subscription?.status === "trialing";
      if (path === "/api/me") {
        const user = await env.DB.prepare(
          "SELECT username FROM users WHERE id=?",
        )
          .bind(userId)
          .first();
        return user
          ? reply({ ...user, paid })
          : reply({ error: "Not found" }, 401);
      }
      if (path === "/api/checkout" && request.method === "POST") {
        if (!env.STRIPE_SECRET_KEY)
          return reply({ error: "Subscriptions are not configured yet." }, 503);
        if (paid) return reply({ error: "Subscription already active." }, 409);
        const body = (await request.json()) as { term: string };
        if (body.term !== "year" && body.term !== "two-year")
          return reply({ error: "Invalid subscription" }, 400);
        const params = new URLSearchParams({
          mode: "subscription",
          success_url: url.origin + "/?checkout=success",
          cancel_url: url.origin + "/?checkout=cancelled",
          client_reference_id: userId,
          "metadata[name]": "myneu",
          "metadata[user_id]": userId,
          "subscription_data[metadata][name]": "myneu",
          "subscription_data[metadata][user_id]": userId,
          "line_items[0][quantity]": "1",
          "line_items[0][price_data][currency]": "usd",
          "line_items[0][price_data][unit_amount]":
            body.term === "year" ? "8800" : "10000",
          "line_items[0][price_data][recurring][interval]": "year",
          "line_items[0][price_data][recurring][interval_count]":
            body.term === "year" ? "1" : "2",
          "line_items[0][price_data][product_data][name]": "myneu subscription",
        });
        const result = await fetch(
          "https://api.stripe.com/v1/checkout/sessions",
          {
            method: "POST",
            headers: {
              Authorization: "Bearer " + env.STRIPE_SECRET_KEY,
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: params,
          },
        );
        const data = (await result.json()) as { url?: string };
        return result.ok
          ? reply({ url: data.url })
          : reply({ error: "Could not start checkout." }, 502);
      }
      if (path === "/api/billing-portal" && request.method === "POST") {
        if (!env.STRIPE_SECRET_KEY)
          return reply({ error: "Billing is not configured yet." }, 503);
        const account = await env.DB.prepare(
          "SELECT stripe_customer_id FROM subscriptions WHERE user_id=?",
        )
          .bind(userId)
          .first<{ stripe_customer_id: string }>();
        if (!account?.stripe_customer_id)
          return reply({ error: "No billing account found." }, 404);
        const params = new URLSearchParams({
          customer: account.stripe_customer_id,
          return_url: url.origin + "/",
        });
        const response = await fetch(
          "https://api.stripe.com/v1/billing_portal/sessions",
          {
            method: "POST",
            headers: {
              Authorization: "Bearer " + env.STRIPE_SECRET_KEY,
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: params,
          },
        );
        const data = (await response.json()) as { url?: string };
        return response.ok
          ? reply({ url: data.url })
          : reply({ error: "Could not open billing." }, 502);
      }
      if (path === "/api/images" && request.method === "POST") {
        if (!paid)
          return reply({ error: "Image seeds require a subscription." }, 403);
        const type = request.headers.get("Content-Type") || "";
        if (!["image/jpeg", "image/png", "image/webp"].includes(type))
          return reply({ error: "Choose a JPEG, PNG or WebP image." }, 400);
        const bytes = await request.arrayBuffer();
        if (bytes.byteLength > 5 * 1024 * 1024)
          return reply({ error: "Image must be 5 MB or less." }, 400);
        const key = userId + "/" + crypto.randomUUID();
        await env.IMAGES.put(key, bytes, {
          httpMetadata: { contentType: type },
        });
        return reply({ key });
      }
      if (path.startsWith("/api/images/") && request.method === "GET") {
        const key = decodeURIComponent(path.slice("/api/images/".length));
        if (!key.startsWith(userId + "/"))
          return reply({ error: "Not found" }, 404);
        const image = await env.IMAGES.get(key);
        if (!image) return reply({ error: "Not found" }, 404);
        return new Response(image.body, {
          headers: {
            "Content-Type":
              image.httpMetadata?.contentType || "application/octet-stream",
            "Cache-Control": "private, max-age=300",
            "X-Content-Type-Options": "nosniff",
          },
        });
      }
      if (path === "/api/boards" && request.method === "GET") {
        const rows = await env.DB.prepare(
          "SELECT b.id,b.name,b.revision,(SELECT COUNT(*) FROM seeds WHERE board_id=b.id) AS seed_count FROM boards b WHERE b.owner_id=? ORDER BY b.updated_at DESC",
        )
          .bind(userId)
          .all();
        return reply(rows.results);
      }
      if (path === "/api/boards" && request.method === "POST") {
        const body = (await request.json()) as { id: string; name: string };
        if (!/^[a-f0-9-]{36}$/.test(body.id))
          return reply({ error: "Invalid board" }, 400);
        const result = await env.DB.prepare(
          "INSERT INTO boards (id,owner_id,name,updated_at) SELECT ?,?,?,? WHERE ? OR (SELECT count(*) FROM boards WHERE owner_id=?)<20",
        )
          .bind(
            body.id,
            userId,
            (body.name || "My garden").slice(0, 100),
            Date.now(),
            paid ? 1 : 0,
            userId,
          )
          .run();
        if (!result.meta.changes)
          return reply(
            { error: "Free accounts can create up to 20 boards." },
            403,
          );
        return reply({ ok: true });
      }
      const match = path.match(/^\/api\/boards\/([a-z0-9-]+)$/);
      if (match) {
        const board = await env.DB.prepare(
          "SELECT id,name,revision FROM boards WHERE id=? AND owner_id=?",
        )
          .bind(match[1], userId)
          .first();
        if (!board) return reply({ error: "Board not found" }, 404);
        if (request.method === "GET") {
          const seeds = await env.DB.prepare(
            "SELECT id,text,x,y,image_key AS image FROM seeds WHERE board_id=?",
          )
            .bind(match[1])
            .all();
          return reply({ ...board, seeds: seeds.results });
        }
        if (request.method === "PUT") {
          const body = (await request.json()) as {
            name: string;
            revision: number;
            seeds: {
              id: string;
              text: string;
              x: number;
              y: number;
              image?: string;
            }[];
          };
          if (!Array.isArray(body.seeds) || body.seeds.length > 1000)
            return reply({ error: "Invalid board" }, 400);
          if (
            !Number.isInteger(body.revision) ||
            body.seeds.some(
              (seed) =>
                !Number.isFinite(seed.x) ||
                !Number.isFinite(seed.y) ||
                typeof seed.id !== "string",
            )
          )
            return reply({ error: "Invalid board" }, 400);
          const writeToken = crypto.randomUUID();
          const queries = [
            env.DB.prepare(
              "UPDATE boards SET name=?,updated_at=?,revision=revision+1,write_token=? WHERE id=? AND owner_id=? AND revision=?",
            ).bind(
              (body.name || "My garden").slice(0, 100),
              Date.now(),
              writeToken,
              match[1],
              userId,
              body.revision,
            ),
            env.DB.prepare(
              "DELETE FROM seeds WHERE board_id=? AND EXISTS (SELECT 1 FROM boards WHERE id=? AND write_token=?)",
            ).bind(match[1], match[1], writeToken),
            ...body.seeds.map((seed) =>
              env.DB.prepare(
                "INSERT INTO seeds (id,board_id,text,x,y,image_key,kind) SELECT ?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM boards WHERE id=? AND write_token=?)",
              ).bind(
                seed.id,
                match[1],
                String(seed.text).slice(0, 5000),
                seed.x,
                seed.y,
                seed.image?.startsWith(userId + "/") ? seed.image : null,
                seed.image ? "image" : "text",
                match[1],
                writeToken,
              ),
            ),
          ];
          const result = await env.DB.batch(queries);
          if (!result[0].meta.changes)
            return reply(
              {
                error: "This board changed elsewhere. Reopen it before saving.",
              },
              409,
            );
          return reply({ ok: true, revision: body.revision + 1 });
        }
      }
      return reply({ error: "Not found" }, 404);
    } catch {
      return reply({ error: "Unable to complete request" }, 500);
    }
  },
} satisfies ExportedHandler<AppEnv>;
