
const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...headers
    }
  });

const corsHeaders = {
  "cache-control": "no-store",
  "x-content-type-options": "nosniff"
};

function b64url(bytes) {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);

  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function fromB64url(value) {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - base64.length % 4) % 4);
  const binary = atob(padded);

  return Uint8Array.from(binary, c => c.charCodeAt(0));
}

async function sign(value, secret) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  return b64url(
    new Uint8Array(
      await crypto.subtle.sign(
        "HMAC",
        key,
        new TextEncoder().encode(value)
      )
    )
  );
}

async function createSession(env) {
  const payload = b64url(
    new TextEncoder().encode(
      JSON.stringify({
        admin: true,
        exp: Math.floor(Date.now() / 1000) + 60 * 60 * 12
      })
    )
  );

  return `${payload}.${await sign(payload, env.SESSION_SECRET)}`;
}

async function isAdmin(request, env) {
  const cookie = request.headers.get("Cookie") || "";
  const match = cookie.match(/(?:^|;\s*)spft_admin=([^;]+)/);

  if (!match || !env.SESSION_SECRET) return false;

  const parts = match[1].split(".");
  if (parts.length !== 2) return false;

  const expected = await sign(parts[0], env.SESSION_SECRET);

  if (expected !== parts[1]) return false;

  try {
    const payload = JSON.parse(
      new TextDecoder().decode(fromB64url(parts[0]))
    );

    return (
      payload.admin === true &&
      payload.exp > Math.floor(Date.now() / 1000)
    );
  } catch {
    return false;
  }
}

const cookieHeaders = (value, maxAge) => ({
  "set-cookie":
    `spft_admin=${value}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${maxAge}`
});

async function requireAdmin(request, env) {
  return await isAdmin(request, env);
}

async function readBody(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

function safeProduct(row) {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    price: row.price,
    description: row.description,
    image_url: row.image_url,
    active: !!row.active
  };
}

async function deleteD1Image(env, imageUrl) {
  if (!imageUrl || !imageUrl.startsWith("/media/")) return;

  const id = decodeURIComponent(
    imageUrl.slice("/media/".length)
  );

  if (id && /^[a-f0-9-]{36}$/i.test(id)) {
    await env.DB.prepare(
      "DELETE FROM product_images WHERE id = ?"
    ).bind(id).run();
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    try {

      // =====================================
      // DISPLAY PRODUCT IMAGE FROM D1
      // =====================================

      if (path.startsWith("/media/") && method === "GET") {
        const id = path.slice("/media/".length).trim();

        if (!/^[a-f0-9-]{36}$/i.test(id)) {
          return new Response("Invalid image ID", {
            status: 400
          });
        }

        const image = await env.DB.prepare(
          "SELECT mime_type, data FROM product_images WHERE id = ?"
        ).bind(id).first();

        if (!image || !image.data) {
          return new Response("Image not found in D1", {
            status: 404
          });
        }

        const bytes =
          image.data instanceof ArrayBuffer
            ? new Uint8Array(image.data)
            : image.data;

        return new Response(bytes, {
          status: 200,
          headers: {
            "Content-Type": image.mime_type || "image/jpeg",
            "Cache-Control": "public, max-age=3600",
            "X-Content-Type-Options": "nosniff"
          }
        });
      }

      // =====================================
      // PUBLIC PRODUCTS
      // =====================================

      if (path === "/api/products" && method === "GET") {
        const { results } = await env.DB.prepare(
          "SELECT * FROM products WHERE active = 1 ORDER BY created_at DESC"
        ).all();

        return json(results.map(safeProduct), 200, corsHeaders);
      }

      // =====================================
      // PUBLIC CATEGORIES
      // =====================================

      if (path === "/api/categories" && method === "GET") {
        const { results } = await env.DB.prepare(
          "SELECT name FROM categories ORDER BY name"
        ).all();

        return json(results.map(r => r.name), 200, corsHeaders);
      }

      // =====================================
      // ADMIN LOGIN
      // =====================================

      if (path === "/api/admin/login" && method === "POST") {
        const body = await readBody(request);

        if (
          !body ||
          !env.ADMIN_USERNAME ||
          !env.ADMIN_PASSWORD ||
          !env.SESSION_SECRET
        ) {
          return json(
            { error: "Admin login is not configured." },
            500
          );
        }

        if (
          body.username !== env.ADMIN_USERNAME ||
          body.password !== env.ADMIN_PASSWORD
        ) {
          return json(
            { error: "Username किंवा password चुकीचा आहे." },
            401
          );
        }

        const token = await createSession(env);

        return json(
          { ok: true },
          200,
          {
            ...cookieHeaders(token, 60 * 60 * 12),
            ...corsHeaders
          }
        );
      }

      // =====================================
      // ADMIN LOGOUT
      // =====================================

      if (path === "/api/admin/logout" && method === "POST") {
        return json(
          { ok: true },
          200,
          {
            ...cookieHeaders("", 0),
            ...corsHeaders
          }
        );
      }

      // =====================================
      // CHECK ADMIN SESSION
      // =====================================

      if (path === "/api/admin/me" && method === "GET") {
        return json({
          authenticated: await isAdmin(request, env)
        });
      }

      // =====================================
      // ADMIN API
      // =====================================

      if (path.startsWith("/api/admin/")) {

        if (!(await requireAdmin(request, env))) {
          return json({ error: "Unauthorized" }, 401);
        }

        // GET ALL PRODUCTS

        if (
          path === "/api/admin/products" &&
          method === "GET"
        ) {
          const { results } = await env.DB.prepare(
            "SELECT * FROM products ORDER BY created_at DESC"
          ).all();

          return json(results.map(safeProduct));
        }

        // ADD PRODUCT

        if (
          path === "/api/admin/products" &&
          method === "POST"
        ) {
          const body = await readBody(request);

          if (
            !body?.name?.trim() ||
            !body?.category?.trim()
          ) {
            return json(
              { error: "Product name आणि category आवश्यक आहेत." },
              400
            );
          }

          const price = Number(body.price);

          if (!Number.isFinite(price) || price < 0) {
            return json({ error: "किंमत योग्य भरा." }, 400);
          }

          const result = await env.DB.prepare(
            `INSERT INTO products
            (name, category, price, description, image_url, active)
            VALUES (?, ?, ?, ?, ?, ?)`
          ).bind(
            body.name.trim(),
            body.category.trim(),
            price,
            String(body.description || ""),
            String(body.image_url || ""),
            body.active === false ? 0 : 1
          ).run();

          return json({
            ok: true,
            id: result.meta.last_row_id
          });
        }

        const productMatch = path.match(
          /^\/api\/admin\/products\/(\d+)$/
        );

        // EDIT PRODUCT

        if (productMatch && method === "PUT") {
          const id = Number(productMatch[1]);
          const body = await readBody(request);

          if (
            !body?.name?.trim() ||
            !body?.category?.trim()
          ) {
            return json(
              { error: "Product name आणि category आवश्यक आहेत." },
              400
            );
          }

          const price = Number(body.price);

          if (!Number.isFinite(price) || price < 0) {
            return json({ error: "किंमत योग्य भरा." }, 400);
          }

          const old = await env.DB.prepare(
            "SELECT image_url FROM products WHERE id = ?"
          ).bind(id).first();

          if (!old) {
            return json(
              { error: "Product सापडला नाही." },
              404
            );
          }

          await env.DB.prepare(
            `UPDATE products SET
            name=?, category=?, price=?, description=?,
            image_url=?, active=?, updated_at=CURRENT_TIMESTAMP
            WHERE id=?`
          ).bind(
            body.name.trim(),
            body.category.trim(),
            price,
            String(body.description || ""),
            String(body.image_url || ""),
            body.active === false ? 0 : 1,
            id
          ).run();

          if (
            old.image_url &&
            old.image_url !== body.image_url
          ) {
            await deleteD1Image(env, old.image_url);
          }

          return json({ ok: true });
        }

        // DELETE PRODUCT

        if (productMatch && method === "DELETE") {
          const id = Number(productMatch[1]);

          const old = await env.DB.prepare(
            "SELECT image_url FROM products WHERE id = ?"
          ).bind(id).first();

          if (!old) {
            return json(
              { error: "Product सापडला नाही." },
              404
            );
          }

          await env.DB.prepare(
            "DELETE FROM products WHERE id = ?"
          ).bind(id).run();

          await deleteD1Image(env, old.image_url);

          return json({ ok: true });
        }

        // ADD CATEGORY

        if (
          path === "/api/admin/categories" &&
          method === "POST"
        ) {
          const body = await readBody(request);
          const name = String(body?.name || "").trim();

          if (!name || name.length > 40) {
            return json(
              { error: "Category नाव 1 ते 40 अक्षरांत असावे." },
              400
            );
          }

          try {
            await env.DB.prepare(
              "INSERT INTO categories (name) VALUES (?)"
            ).bind(name).run();
          } catch {
            return json(
              { error: "ही Category आधीपासून आहे." },
              409
            );
          }

          return json({ ok: true });
        }

        // =====================================
        // UPLOAD IMAGE TO D1
        // =====================================

        if (
          path === "/api/admin/upload" &&
          method === "POST"
        ) {
          const form = await request.formData();
          const file = form.get("image");

          if (
            !file ||
            typeof file.arrayBuffer !== "function"
          ) {
            return json(
              { error: "Image file द्या." },
              400
            );
          }

          if (!file.type.startsWith("image/")) {
            return json(
              { error: "फक्त image upload करा." },
              400
            );
          }

          if (file.size > 1024 * 1024) {
            return json(
              {
                error:
                  "D1 मध्ये साठवण्यासाठी image 1 MB पेक्षा लहान असावी. आधी compress करा."
              },
              400
            );
          }

          const allowed = [
            "image/jpeg",
            "image/png",
            "image/webp",
            "image/gif"
          ];

          if (!allowed.includes(file.type)) {
            return json(
              {
                error:
                  "JPG, PNG, WEBP किंवा GIF image वापरा."
              },
              400
            );
          }

          const id = crypto.randomUUID();
          const bytes = await file.arrayBuffer();

          await env.DB.prepare(
            `INSERT INTO product_images
            (id, mime_type, data, size_bytes)
            VALUES (?, ?, ?, ?)`
          ).bind(
            id,
            file.type,
            bytes,
            file.size
          ).run();

          return json({
            image_url: `/media/${id}`
          });
        }
      }

      // =====================================
      // FRONTEND ASSETS
      // =====================================

      return env.ASSETS.fetch(request);

    } catch (error) {
      console.error("Worker Error:", error);

      return json(
        {
          error: "Server error. Cloudflare logs तपासा."
        },
        500
      );
    }
  }
};
