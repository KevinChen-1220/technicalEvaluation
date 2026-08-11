"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// ../../node_modules/@edgeone/pages-blob/dist/index.js
var require_dist = __commonJS({
  "../../node_modules/@edgeone/pages-blob/dist/index.js"(exports2, module2) {
    "use strict";
    var U = Object.defineProperty;
    var le = Object.getOwnPropertyDescriptor;
    var ue = Object.getOwnPropertyNames;
    var ge = Object.prototype.hasOwnProperty;
    var fe = (t, e) => {
      for (var r in e) U(t, r, { get: e[r], enumerable: true });
    };
    var he = (t, e, r, n) => {
      if (e && typeof e == "object" || typeof e == "function") for (let s of ue(e)) !ge.call(t, s) && s !== r && U(t, s, { get: () => e[s], enumerable: !(n = le(e, s)) || n.enumerable });
      return t;
    };
    var me = (t) => he(U({}, "__esModule", { value: true }), t);
    var Oe = {};
    fe(Oe, { InvalidKeyError: () => w, InvalidStoreNameError: () => y, MissingProjectIdError: () => T, PagesBlobError: () => h, PreconditionFailedError: () => x, QuotaExceededError: () => O, RateLimitedError: () => j, Store: () => E, getStore: () => Me, listStores: () => De });
    module2.exports = me(Oe);
    var h = class extends Error {
      code;
      constructor(e, r) {
        super(`PagesBlob: ${r}`), this.name = "PagesBlobError", this.code = e;
      }
    };
    var w = class extends h {
      constructor(e) {
        super("INVALID_KEY", e);
      }
    };
    var y = class extends h {
      constructor(e) {
        super("INVALID_STORE_NAME", e);
      }
    };
    var b = class extends h {
      constructor(e) {
        super("MISSING_ENVIRONMENT", `Environment not configured for Pages Blob. Missing: ${e.join(", ")}. Supply these properties when creating a store, or ensure the function is running in a Pages environment.`);
      }
    };
    var O = class extends h {
      constructor() {
        super("QUOTA_EXCEEDED", "storage quota exceeded");
      }
    };
    var j = class extends h {
      constructor() {
        super("RATE_LIMITED", "request rate limited, please retry later");
      }
    };
    var T = class extends h {
      constructor() {
        super("MISSING_PROJECT_ID", "projectId is required when using API token mode. Please supply { name, projectId, token } to getStore() / listStores().");
      }
    };
    var m = class extends h {
      constructor(e) {
        super("CREDENTIAL_ERROR", e);
      }
    };
    var f = class extends h {
      constructor(e, r) {
        super("COS_ERROR", `COS returned ${e}: ${r}`);
      }
    };
    var x = class extends h {
      constructor() {
        super("PRECONDITION_FAILED", "conditional write failed (key already exists)");
      }
    };
    function C(t) {
      if (t === "") throw new w("Blob key must not be empty.");
      if (t.startsWith("/") || t.startsWith("%2F")) throw new w("Blob key must not start with forward slash (/).");
      if (new TextEncoder().encode(t).length > 600) throw new w("Blob key must be a sequence of Unicode characters whose UTF-8 encoding is at most 600 bytes long.");
    }
    function z(t) {
      if (t === "") throw new y("Store name must not be empty.");
      if (t.includes("/") || t.includes(":")) throw new y("Store name must not contain forward slashes (/) or colons (:).");
      if (!/^[a-zA-Z0-9_-]+$/.test(t)) throw new y("Store name must only contain letters, digits, underscores, and hyphens.");
      if (new TextEncoder().encode(t).length > 64) throw new y("Store name must be a sequence of Unicode characters whose UTF-8 encoding is at most 64 bytes long.");
    }
    var E = class {
      cosClient;
      storeName;
      defaultConsistency;
      constructor(e, r, n = "eventual") {
        this.cosClient = e, this.storeName = r, this.defaultConsistency = n;
      }
      resolveConsistency(e) {
        return e ?? this.defaultConsistency;
      }
      async set(e, r, n) {
        C(e);
        let s = await this.cosClient.putObject(this.storeName, e, r, { onlyIfNew: n?.onlyIfNew, cacheControl: n?.cacheControl });
        if (n?.onlyIfNew && s.statusCode === 412) throw new x();
      }
      async setJSON(e, r, n) {
        C(e);
        let s = JSON.stringify(r), i = await this.cosClient.putObject(this.storeName, e, s, { onlyIfNew: n?.onlyIfNew, contentType: "application/json", cacheControl: n?.cacheControl });
        if (n?.onlyIfNew && i.statusCode === 412) throw new x();
      }
      async createUploadUrl(e, r) {
        C(e);
        let { url: n, expiresAt: s } = await this.cosClient.createPresignedPutUrl(this.storeName, e, { expireSeconds: r?.expireSeconds, contentType: r?.contentType });
        return { url: n, key: e, expiresAt: s };
      }
      async get(e, r) {
        C(e);
        let n = this.resolveConsistency(r?.consistency), s = await this.cosClient.getObject(this.storeName, e, n);
        if (s === null) return null;
        let { body: i } = s, a = r?.type ?? "text", o = new TextDecoder("utf-8");
        switch (a) {
          case "text":
            return o.decode(i);
          case "json":
            return JSON.parse(o.decode(i));
          case "arrayBuffer":
            return i.buffer.slice(i.byteOffset, i.byteOffset + i.byteLength);
          case "blob":
            return new Blob([i]);
          case "stream":
            return new ReadableStream({ start(c) {
              c.enqueue(i), c.close();
            } });
          default:
            return o.decode(i);
        }
      }
      async getMetadata(e, r) {
        C(e);
        let n = this.resolveConsistency(r?.consistency);
        return this.cosClient.headObject(this.storeName, e, n);
      }
      async getWithHeaders(e, r) {
        C(e);
        let n = this.resolveConsistency(r?.consistency), s = await this.cosClient.getObject(this.storeName, e, n);
        return s ? { body: new TextDecoder("utf-8").decode(s.body), headers: s.headers || {} } : null;
      }
      async delete(e) {
        C(e), await this.cosClient.deleteObject(this.storeName, e);
      }
      async list(e) {
        let r = e?.paginate !== false, n = e?.limit, s = [], i = [], a = this.resolveConsistency(e?.consistency), o = e?.cursor || "", c = true, d;
        for (; c; ) {
          let u = n !== void 0 ? n - s.length : 1e3, l = Math.min(u, 1e3);
          if (l <= 0) break;
          let g = await this.cosClient.listObjects(this.storeName, { prefix: e?.prefix, delimiter: e?.directories ? "/" : void 0, marker: o || void 0, maxKeys: l, consistency: a });
          for (let p of g.contents) s.push({ key: p.key, etag: p.etag });
          i.push(...g.commonPrefixes), n !== void 0 && s.length >= n ? (s.length = n, (g.isTruncated || g.contents.length === l) && (d = g.nextMarker), c = false) : g.isTruncated ? !r && n === void 0 ? (d = g.nextMarker, c = false) : o = g.nextMarker : c = false;
        }
        return { blobs: s, directories: i, ...d ? { cursor: d } : {} };
      }
    };
    var ye = new TextEncoder();
    function _(t) {
      let e = ye.encode(t), r = new ArrayBuffer(e.byteLength), n = new Uint8Array(r);
      return n.set(e), n;
    }
    function G(t) {
      let e = t instanceof Uint8Array ? t : new Uint8Array(t), r = "";
      for (let n = 0; n < e.length; n++) r += e[n].toString(16).padStart(2, "0");
      return r;
    }
    async function H(t, e) {
      let r = await crypto.subtle.importKey("raw", _(t), { name: "HMAC", hash: "SHA-1" }, false, ["sign"]), n = await crypto.subtle.sign("HMAC", r, _(e));
      return G(n);
    }
    async function pe(t) {
      let e = await crypto.subtle.digest("SHA-1", _(t));
      return G(e);
    }
    function $(t) {
      return encodeURIComponent(t).replace(/[!'()*]/g, (e) => "%" + e.charCodeAt(0).toString(16).toUpperCase());
    }
    function P(t) {
      try {
        return decodeURIComponent(t);
      } catch {
        return t;
      }
    }
    function we(t) {
      return t.split("/").map((e) => P(e)).join("/");
    }
    function I(t) {
      return we(P(t));
    }
    function W(t) {
      return t.split("/").map((e) => $(P(e))).join("/");
    }
    var Ce = /* @__PURE__ */ new Set(["cache-control", "content-disposition", "content-encoding", "content-length", "content-md5", "content-type", "expect", "expires", "if-match", "if-modified-since", "if-none-match", "if-unmodified-since", "origin", "range", "transfer-encoding"]);
    function xe(t) {
      return t === "host" || t === "x-cos-security-token" ? false : !!(Ce.has(t) || t.startsWith("x-cos-"));
    }
    function X(t) {
      if (!t) return [];
      let e = [];
      for (let [r, n] of Object.entries(t)) n != null && e.push([r.toLowerCase(), String(n)]);
      return e.sort(([r], [n]) => r < n ? -1 : r > n ? 1 : 0), e;
    }
    function Y(t) {
      return t.map(([e, r]) => `${$(e)}=${$(r)}`).join("&");
    }
    function F(t) {
      return t.map(([e]) => $(e)).join(";");
    }
    async function V(t) {
      let e = t.method.toLowerCase(), r = t.pathname.startsWith("/") ? t.pathname : `/${t.pathname}`, n = Math.floor(Date.now() / 1e3), s = n + (t.expireSeconds ?? 3600), i = `${n};${s}`, o = X(t.headers).filter(([N]) => xe(N)), c = F(o), d = Y(o), u = X(t.query), l = F(u), g = Y(u), p = `${e}
${r}
${g}
${d}
`, oe = `sha1
${i}
${await pe(p)}
`, ie = await H(t.secretKey, i), ae = await H(ie, oe), ce = ["q-sign-algorithm=sha1", `q-ak=${t.secretId}`, `q-sign-time=${i}`, `q-key-time=${i}`, `q-header-list=${c}`, `q-url-param-list=${l}`, `q-signature=${ae}`].join("&"), q = {};
      for (let [N, de] of o) q[N] = de;
      return { authorization: ce, signedHeaders: q };
    }
    async function J(t) {
      let e = new URL(t.domain), r = P(t.key), n = `/${I(t.key)}`, s = `/${W(r)}`;
      e.pathname = s;
      let { authorization: i } = await V({ method: t.method, pathname: n, query: t.query, headers: t.headers, secretId: t.credential.secretId, secretKey: t.credential.secretKey, expireSeconds: t.expireSeconds });
      if (t.query) for (let [a, o] of Object.entries(t.query)) o != null && e.searchParams.set(a, String(o));
      for (let a of i.split("&")) {
        let o = a.indexOf("=");
        if (o === -1) continue;
        let c = a.slice(0, o), d = a.slice(o + 1);
        e.searchParams.set(c, d);
      }
      return t.credential.sessionToken && e.searchParams.set("x-cos-security-token", t.credential.sessionToken), e.toString();
    }
    async function S(t) {
      let e = new URL(t.domain), r = t.key ? P(t.key) : "", n = t.key ? `/${I(t.key)}` : "/", s = r ? `/${W(r)}` : "/";
      if (e.pathname = s, t.query) for (let [l, g] of Object.entries(t.query)) g != null && e.searchParams.set(l, String(g));
      let { authorization: i } = await V({ method: t.method, pathname: n, query: t.query, headers: t.headers, secretId: t.credential.secretId, secretKey: t.credential.secretKey }), a = new Headers();
      if (t.headers) for (let [l, g] of Object.entries(t.headers)) g != null && a.set(l, String(g));
      a.set("Authorization", i), t.credential.sessionToken && a.set("x-cos-security-token", t.credential.sessionToken);
      let o = e.toString(), c = { method: t.method, headers: a, body: t.body ?? void 0, signal: t.signal }, d = 2, u;
      for (let l = 0; l <= d; l++) try {
        return await fetch(o, c);
      } catch (g) {
        if (u = g, g instanceof DOMException && g.name === "AbortError") throw g;
        l < d && await new Promise((p) => setTimeout(p, 1e3 * (l + 1)));
      }
      throw u;
    }
    var be = "blob.edgeone.site";
    var Te = "blob-nocache.edgeone.site";
    var M = class t {
      credentialManager;
      bucket = "";
      region = "";
      keyPrefix = "";
      cachedDomain = "";
      uncachedDomain = "";
      initialized = false;
      static buildErrorDetail(e, r, n, s, i) {
        let a = n ? `${r}/${n}` : r, o = i ? ` [request-id: ${i}]` : "";
        return `${e} ${a} - ${Ee(s)}${o}`;
      }
      constructor(e) {
        this.credentialManager = e;
      }
      computeSubdomain(e) {
        let r = [];
        if (e.appId && r.push(e.appId), e.zoneId && r.push(e.zoneId), e.projectId && r.push(e.projectId), r.length >= 2) return r.join("-");
        if (e.resourcePrefix) {
          let s = e.resourcePrefix.replace(/\/?\*$/, "").split("/").filter(Boolean);
          if (s.length >= 2) return s.slice(0, Math.min(s.length, 3)).join("-");
        }
        return "";
      }
      async ensureInitialized() {
        if (this.initialized) return;
        let e = await this.credentialManager.getCredential();
        !this.keyPrefix && e.resourcePrefix && (this.keyPrefix = e.resourcePrefix.replace(/\/?\*$/, ""));
        let r = e.edgeRegion === "CN", n = e.cosMainland, s = e.cosOverseas, i = r ? n || s : s || n;
        !this.bucket && i && (this.bucket = i.bucket, this.region = i.region);
        let a = this.computeSubdomain(e);
        if (!a) throw new f(0, "unable to derive tenant subdomain from credential; missing appId/zoneId/projectId or resourcePrefix");
        this.cachedDomain = `https://${a}.${be}`, this.uncachedDomain = `https://${a}.${Te}`, this.initialized = true;
      }
      async resolveDomain(e) {
        return await this.ensureInitialized(), e === "strong" ? this.uncachedDomain : this.cachedDomain;
      }
      async resolveCredential() {
        let e = await this.credentialManager.getCredential();
        return { secretId: e.tmpSecretId, secretKey: e.tmpSecretKey, sessionToken: e.sessionToken };
      }
      buildCosKey(e, r) {
        return `${this.keyPrefix}/${e}/${r}`;
      }
      async getDomains() {
        return await this.ensureInitialized(), { cached: this.cachedDomain, uncached: this.uncachedDomain };
      }
      async putObject(e, r, n, s) {
        let i = await this.resolveDomain("strong"), a = await this.resolveCredential(), o = this.buildCosKey(e, r), d = s?.cacheControl === null ? void 0 : s?.cacheControl ?? "max-age=0, stale-while-revalidate=60", u = {};
        s?.onlyIfNew && (u["If-None-Match"] = "*"), d && (u["Cache-Control"] = d), s?.contentType && (u["Content-Type"] = s.contentType);
        try {
          let l = await S({ domain: i, method: "PUT", key: o, headers: u, body: n, credential: a });
          if (l.status === 412) return await l.arrayBuffer().catch(() => {
          }), { etag: "", statusCode: 412 };
          if (!l.ok) {
            let p = await k(l);
            throw new f(l.status, t.buildErrorDetail("PUT", i, o, p || `status ${l.status}`, R(l)));
          }
          let g = l.headers.get("etag") || "";
          return await l.arrayBuffer().catch(() => {
          }), { etag: g, statusCode: l.status };
        } catch (l) {
          throw l instanceof f ? l : new f(0, t.buildErrorDetail("PUT", i, o, A(l)));
        }
      }
      async createPresignedPutUrl(e, r, n) {
        let s = await this.resolveDomain("strong"), i = await this.resolveCredential(), a = this.buildCosKey(e, r), o = {};
        n?.contentType && (o["Content-Type"] = n.contentType);
        let c = n?.expireSeconds ?? 3600, d = await J({ domain: s, method: "PUT", key: a, headers: o, credential: i, expireSeconds: c }), u = Math.floor(Date.now() / 1e3) + c;
        return { url: d, expiresAt: u };
      }
      async getObject(e, r, n) {
        let s = await this.resolveDomain(n), i = await this.resolveCredential(), a = this.buildCosKey(e, r);
        try {
          let o = await S({ domain: s, method: "GET", key: a, credential: i });
          if (o.status === 404) return await o.arrayBuffer().catch(() => {
          }), null;
          if (!o.ok) {
            let u = await k(o);
            throw new f(o.status, t.buildErrorDetail("GET", s, a, u || `status ${o.status}`, R(o)));
          }
          let c = new Uint8Array(await o.arrayBuffer()), d = Z(o.headers);
          return { body: c, contentType: d["content-type"], headers: d };
        } catch (o) {
          throw o instanceof f ? o : new f(0, t.buildErrorDetail("GET", s, a, A(o)));
        }
      }
      async headObject(e, r, n) {
        let s = await this.resolveDomain(n), i = await this.resolveCredential(), a = this.buildCosKey(e, r);
        try {
          let o = await S({ domain: s, method: "HEAD", key: a, credential: i });
          if (o.status === 404) return null;
          if (!o.ok) {
            let d = await k(o);
            throw new f(o.status, t.buildErrorDetail("HEAD", s, a, d || `status ${o.status}`, R(o)));
          }
          let c = Z(o.headers);
          return { cacheControl: c["cache-control"], contentType: c["content-type"], etag: c.etag, headers: c };
        } catch (o) {
          throw o instanceof f ? o : new f(0, t.buildErrorDetail("HEAD", s, a, A(o)));
        }
      }
      async deleteObject(e, r) {
        let n = await this.resolveDomain("strong"), s = await this.resolveCredential(), i = this.buildCosKey(e, r);
        try {
          let a = await S({ domain: n, method: "DELETE", key: i, credential: s });
          if (a.status === 204 || a.status === 404 || a.ok) {
            await a.arrayBuffer().catch(() => {
            });
            return;
          }
          let o = await k(a);
          throw new f(a.status, t.buildErrorDetail("DELETE", n, i, o || `status ${a.status}`, R(a)));
        } catch (a) {
          throw a instanceof f ? a : new f(0, t.buildErrorDetail("DELETE", n, i, A(a)));
        }
      }
      async listObjects(e, r) {
        await this.ensureInitialized();
        let n = `${this.keyPrefix}/${e}/`, s = r?.prefix ? n + r.prefix : n, i = await this.getBucketRaw({ prefix: s, delimiter: r?.delimiter, marker: r?.marker, maxKeys: r?.maxKeys, consistency: r?.consistency }), a = i.contents.map((c) => {
          let d = c.key, u = d.startsWith(n) ? d.slice(n.length) : d;
          return u ? { key: u, etag: c.etag } : null;
        }).filter((c) => c !== null), o = i.commonPrefixes.map((c) => c.startsWith(n) ? c.slice(n.length) : c).filter((c) => !!c);
        return { contents: a, commonPrefixes: o, isTruncated: i.isTruncated, nextMarker: i.nextMarker };
      }
      async listStores(e) {
        let r = [], n = "", s = true;
        for (; s; ) {
          await this.ensureInitialized();
          let i = `${this.keyPrefix}/`, a = await this.getBucketRaw({ prefix: i, delimiter: "/", maxKeys: 1e3, marker: n || void 0, consistency: e });
          for (let o of a.commonPrefixes) {
            let c = o.startsWith(i) ? o.slice(i.length, -1) : o.slice(0, -1);
            c && r.push(c);
          }
          if (s = a.isTruncated, n = a.nextMarker, !s || !n) break;
        }
        return r;
      }
      async getBucketRaw(e) {
        let r = await this.resolveDomain(e.consistency), n = await this.resolveCredential(), s = { prefix: I(e.prefix) };
        e.delimiter && (s.delimiter = e.delimiter), e.marker && (s.marker = I(e.marker)), e.maxKeys && (s["max-keys"] = e.maxKeys);
        try {
          let i = await S({ domain: r, method: "GET", query: s, credential: n });
          if (!i.ok) {
            let o = await k(i);
            throw new f(i.status, t.buildErrorDetail("LIST", r, e.prefix, o || `status ${i.status}`, R(i)));
          }
          let a = await i.text();
          return Se(a);
        } catch (i) {
          throw i instanceof f ? i : new f(0, t.buildErrorDetail("LIST", r, e.prefix, A(i)));
        }
      }
    };
    function Ee(t) {
      return t.replace(/[a-zA-Z0-9\-]+\.cos\.[a-zA-Z0-9\-.]+\.myqcloud\.com/gi, "[cos-origin]").replace(/[a-zA-Z0-9\-]+\.cos\.[a-zA-Z0-9\-.]+\.tencentcos\.cn/gi, "[cos-origin]");
    }
    async function k(t) {
      try {
        return await t.text();
      } catch {
        return "";
      }
    }
    function R(t) {
      return t.headers.get("x-cos-request-id") || t.headers.get("x-eo-log-id") || void 0;
    }
    function A(t) {
      let e = t, r = e.message || String(t), n = e.cause;
      if (n) {
        let s = n.message || n.code || "";
        return s ? `${r} (${s})` : r;
      }
      return r;
    }
    function Z(t) {
      let e = {};
      return t.forEach((r, n) => {
        e[n.toLowerCase()] = r;
      }), e;
    }
    function Se(t) {
      let e = [], r = /<Contents>([\s\S]*?)<\/Contents>/g, n;
      for (; (n = r.exec(t)) !== null; ) {
        let d = n[1], u = v(d, "Key"), l = v(d, "ETag");
        u !== null && e.push({ key: L(u), etag: l || "" });
      }
      let s = [], i = /<CommonPrefixes>([\s\S]*?)<\/CommonPrefixes>/g;
      for (; (n = i.exec(t)) !== null; ) {
        let d = n[1], u = v(d, "Prefix");
        u !== null && s.push(L(u));
      }
      let o = v(t, "IsTruncated") === "true", c = v(t, "NextMarker") || "";
      return { contents: e, commonPrefixes: s, isTruncated: o, nextMarker: L(c) };
    }
    function v(t, e) {
      let n = new RegExp(`<${e}>([\\s\\S]*?)<\\/${e}>`).exec(t);
      return n ? n[1] : null;
    }
    function L(t) {
      return t.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
    }
    var Pe = "X-RateLimit-Reset";
    async function B(t, e, r = 2) {
      e.signal?.throwIfAborted?.();
      try {
        let n = await fetch(t, e);
        if (r > 0 && (n.status === 429 || n.status >= 500)) {
          let s = Q(n.headers.get(Pe));
          return await ee(s, e.signal), B(t, e, r - 1);
        }
        return n;
      } catch (n) {
        if (r === 0 || n instanceof DOMException && n.name === "AbortError") throw n;
        let s = Q();
        return await ee(s, e.signal), B(t, e, r - 1);
      }
    }
    function Q(t) {
      return t ? Math.max(Number(t) * 1e3 - Date.now(), 500) : 1500;
    }
    function ee(t, e) {
      return new Promise((r, n) => {
        if (e?.aborted) return n(e.reason);
        let s = setTimeout(() => {
          e?.removeEventListener("abort", i), r();
        }, t), i = () => {
          clearTimeout(s), n(e.reason);
        };
        e?.addEventListener("abort", i, { once: true });
      });
    }
    var Ie = "prod";
    function te() {
      let t = typeof process < "u" ? process.env.PAGES_BLOB_STS_ENV : void 0;
      return t === "test" || t === "prod" ? t : Ie;
    }
    var ke = 300;
    var Re = "https://blob-sts.edgeone.site/";
    var D = class {
      authToken;
      projectId;
      cached = null;
      constructor(e, r) {
        this.authToken = e, this.projectId = r;
      }
      async getCredential() {
        if (this.cached && !this.isExpired(this.cached)) return this.cached;
        let e = await this.fetchCredential();
        return this.cached = e, e;
      }
      clearCache() {
        this.cached = null;
      }
      isExpired(e) {
        let r = Math.floor(Date.now() / 1e3);
        return e.expiredTime - r < ke;
      }
      async fetchCredential() {
        for (let n = 1; n <= 3; n++) {
          let s = new AbortController(), i = setTimeout(() => s.abort(), 1e4), a;
          try {
            a = await B(Re, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.authToken}`, "X-Env": te() }, body: JSON.stringify(this.projectId ? { ProjectId: this.projectId } : {}), signal: s.signal });
          } catch (d) {
            if (n < 3) {
              await K(500 * n);
              continue;
            }
            throw new m(`failed to obtain STS credential: ${d.message || "timeout"}`);
          } finally {
            clearTimeout(i);
          }
          if (a.status === 413) throw new m("storage quota exceeded");
          if (a.status === 429) throw new m("rate limited, please retry later");
          if (!a.ok) {
            if (a.status >= 500 && n < 3) {
              await K(500 * n);
              continue;
            }
            let d = await a.text().catch(() => "unknown error");
            throw new m(`failed to obtain STS credential: ${a.status} ${d}`);
          }
          let o = await a.json(), c = o.data && typeof o.data == "object" ? o.data : o;
          if (c.tmpSecretId && c.tmpSecretKey && c.sessionToken && c.expiredTime) {
            let d = c.cosMainland, u = c.cosOverseas, l = a.headers.get("X-Edge-Region") || void 0;
            return { tmpSecretId: c.tmpSecretId, tmpSecretKey: c.tmpSecretKey, sessionToken: c.sessionToken, expiredTime: c.expiredTime, appId: c.appId || void 0, zoneId: c.zoneId || void 0, projectId: c.projectId || void 0, resourcePrefix: c.resourcePrefix || void 0, cosMainland: d || void 0, cosOverseas: u || void 0, edgeRegion: l };
          }
          if (c.code !== void 0 && c.code !== 0) {
            let d = c.msg || c.message || "unknown error";
            throw new m(`credential exchange failed (code=${c.code}): ${d}`);
          }
          if (o.code !== void 0 && o.code !== 0) {
            let d = o.msg || o.message || "unknown error";
            throw new m(`credential exchange failed (code=${o.code}): ${d}`);
          }
          if (n < 3) {
            await K(500 * n);
            continue;
          }
          throw new m("invalid STS credential response");
        }
        throw new m("invalid STS credential response");
      }
    };
    function K(t) {
      return new Promise((e) => setTimeout(e, t));
    }
    var Ae = "{{PAGES_BLOB_DEPLOY_CREDENTIAL}}";
    function re() {
      let t = {}, e = ve();
      if (e) t.deployCredential = e;
      else {
        let n = ne("PAGES_BLOB_DEPLOY_CREDENTIAL");
        n && (t.deployCredential = n);
      }
      let r = ne("PAGES_PROJECT_ID");
      return r && (t.projectId = r), t;
    }
    function ve() {
      let t = Ae;
      if (!(t.startsWith("{{") && t.endsWith("}}"))) return t || void 0;
    }
    function ne(t) {
      if (typeof process < "u" && process.env) return process.env[t];
    }
    function Me(t) {
      let e = typeof t == "string" ? t : t.name;
      z(e);
      let r = se(typeof t == "string" ? void 0 : t), n = new D(r.authToken, r.projectId), s = new M(n);
      return new E(s, e, r.consistency ?? "eventual");
    }
    async function De(t) {
      let e = se(t ? { name: "__list__", projectId: t.projectId, token: t.token, consistency: t.consistency } : void 0), r = new D(e.authToken, e.projectId);
      return { stores: (await new M(r).listStores(e.consistency)).map((i) => ({ name: i })) };
    }
    function se(t) {
      let e = re(), r = t?.token || e.deployCredential, n = t?.projectId || e.projectId;
      if (t?.token || e.projectId) {
        if (!n) throw new T();
        if (!r) throw new b(["token"]);
        return { authToken: r, projectId: n, consistency: t?.consistency };
      }
      if (t?.projectId && !r) throw new b(["token"]);
      if (!e.deployCredential) throw new b(["deployCredential"]);
      return { authToken: e.deployCredential, consistency: t?.consistency };
    }
  }
});

// node-functions/api/generation.ts
var generation_exports = {};
__export(generation_exports, {
  onRequest: () => onRequest
});
module.exports = __toCommonJS(generation_exports);

// src/platform/context.ts
var import_pages_blob = __toESM(require_dist());

// src/storage/ports.ts
var BlobPreconditionFailedError = class extends Error {
  code = "BLOB_PRECONDITION_FAILED";
  constructor() {
    super("BLOB_PRECONDITION_FAILED");
    this.name = "BlobPreconditionFailedError";
  }
};

// src/platform/context.ts
var EDGEONE_BLOB_COORDINATION_KEY = {};
function createEdgeOneContext(request, env) {
  return {
    request,
    env,
    blob: createBlobPort((0, import_pages_blob.getStore)("skillscope"))
  };
}
function createBlobPort(store) {
  return {
    coordinationKey: EDGEONE_BLOB_COORDINATION_KEY,
    async get(key, options) {
      return await store.get(key, {
        type: "json",
        ...options?.consistency === void 0 ? {} : { consistency: options.consistency }
      });
    },
    async put(key, value, options) {
      try {
        await store.setJSON(key, value, options);
      } catch (error) {
        if (options?.onlyIfNew && isPreconditionFailure(error)) throw new BlobPreconditionFailedError();
        throw error;
      }
    },
    async delete(key) {
      await store.delete(key);
    },
    async list(prefix, options) {
      const result = await store.list({
        ...prefix === void 0 ? {} : { prefix },
        directories: options?.directories ?? false,
        ...options?.consistency === void 0 ? {} : { consistency: options.consistency },
        ...options?.limit === void 0 ? {} : { limit: options.limit }
      });
      return {
        blobs: (result.blobs ?? []).map((blob) => typeof blob === "string" ? blob : blob.key ?? "").slice(0, options?.limit),
        directories: result.directories ?? []
      };
    }
  };
}
function isPreconditionFailure(error) {
  return typeof error === "object" && error !== null && "name" in error && error.name === "PreconditionFailed";
}

// src/routes/generation.ts
var import_node_crypto4 = require("node:crypto");

// src/auth/sessionToken.ts
var import_node_crypto = require("node:crypto");

// src/http/errors.ts
var ApiError = class extends Error {
  constructor(code, status, retryable = false) {
    super(code);
    this.code = code;
    this.status = status;
    this.retryable = retryable;
    this.name = "ApiError";
  }
};

// src/auth/sessionToken.ts
var SESSION_LIFETIME_MS = 7 * 24 * 60 * 60 * 1e3;
async function requireSession(request, dependencies) {
  const keys = requireSessionKeys(dependencies);
  const token = bearerToken(request.headers.get("authorization"));
  const tokenHash = hashToken(token);
  let stored;
  try {
    stored = await dependencies.blob.get(sessionBlobKey(tokenHash), { consistency: "strong" });
  } catch {
    throw backendUnavailable();
  }
  if (!stored) throw new ApiError("UNAUTHORIZED", 401);
  if (!isValidStoredSession(stored)) throw backendUnavailable();
  if (!constantTimeEqual(stored.tokenHash, tokenHash) || !constantTimeEqual(stored.tokenProof, tokenProof(token, keys.sessionHmacKey))) {
    throw new ApiError("UNAUTHORIZED", 401);
  }
  const now = (dependencies.now ?? (() => /* @__PURE__ */ new Date()))();
  if (!isValidStoredSession(stored) || new Date(stored.expiresAt).getTime() <= now.getTime()) {
    throw new ApiError("SESSION_EXPIRED", 401);
  }
  let openId;
  try {
    openId = decryptOpenId(stored.encryptedOpenId, tokenHash, stored.ownerKey, keys.openIdEncryptionKey);
  } catch {
    throw backendUnavailable();
  }
  return { ownerKey: stored.ownerKey, openId };
}
function sessionDependenciesFromEnvironment(blob, env) {
  return {
    blob,
    sessionHmacKey: env.SESSION_HMAC_KEY,
    ownerHmacKey: env.OWNER_HMAC_KEY,
    openIdEncryptionKey: env.OPENID_ENCRYPTION_KEY
  };
}
function requireSessionKeys(dependencies) {
  if (!dependencies.sessionHmacKey || !dependencies.ownerHmacKey || !dependencies.openIdEncryptionKey) {
    throw backendUnavailable();
  }
  const openIdEncryptionKey = decodeEncryptionKey(dependencies.openIdEncryptionKey);
  if (openIdEncryptionKey === null) throw backendUnavailable();
  return { sessionHmacKey: dependencies.sessionHmacKey, ownerHmacKey: dependencies.ownerHmacKey, openIdEncryptionKey };
}
function decryptOpenId(encrypted, tokenHash, ownerKey, key) {
  const iv = Buffer.from(encrypted.iv, "base64url");
  const tag = Buffer.from(encrypted.tag, "base64url");
  const ciphertext = Buffer.from(encrypted.ciphertext, "base64url");
  if (iv.length !== 12 || tag.length !== 16 || ciphertext.length === 0) throw backendUnavailable();
  const decipher = (0, import_node_crypto.createDecipheriv)("aes-256-gcm", key, iv);
  decipher.setAAD(aad(tokenHash, ownerKey));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}
function aad(tokenHash, ownerKey) {
  return Buffer.from(`skillscope-session-v1\0${tokenHash}\0${ownerKey}`, "utf8");
}
function decodeEncryptionKey(value) {
  if (!/^[A-Za-z0-9+/_-]+={0,2}$/.test(value)) return null;
  const key = Buffer.from(value, value.includes("-") || value.includes("_") ? "base64url" : "base64");
  return key.length === 32 ? key : null;
}
function bearerToken(value) {
  const match = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(value ?? "");
  if (!match?.[1]) throw new ApiError("UNAUTHORIZED", 401);
  return match[1];
}
function hashToken(token) {
  return (0, import_node_crypto.createHash)("sha256").update(token, "utf8").digest("hex");
}
function tokenProof(token, sessionHmacKey) {
  return (0, import_node_crypto.createHmac)("sha256", sessionHmacKey).update(token, "utf8").digest("hex");
}
function sessionBlobKey(tokenHash) {
  return `sessions/${tokenHash}.json`;
}
function constantTimeEqual(left, right) {
  const leftBytes = Buffer.from(left, "utf8");
  const rightBytes = Buffer.from(right, "utf8");
  return leftBytes.length === rightBytes.length && (0, import_node_crypto.timingSafeEqual)(leftBytes, rightBytes);
}
function isValidStoredSession(value) {
  if (!value || typeof value !== "object") return false;
  const session = value;
  return typeof session.tokenHash === "string" && typeof session.tokenProof === "string" && typeof session.ownerKey === "string" && isEncryptedOpenId(session.encryptedOpenId) && typeof session.createdAt === "string" && typeof session.expiresAt === "string" && Number.isFinite(new Date(session.createdAt).getTime()) && Number.isFinite(new Date(session.expiresAt).getTime());
}
function isEncryptedOpenId(value) {
  if (!value || typeof value !== "object") return false;
  const encrypted = value;
  return typeof encrypted.iv === "string" && typeof encrypted.tag === "string" && typeof encrypted.ciphertext === "string";
}
function backendUnavailable() {
  return new ApiError("BACKEND_UNAVAILABLE", 503, true);
}

// ../../node_modules/jsonrepair/lib/esm/utils/JSONRepairError.js
var JSONRepairError = class extends Error {
  constructor(message, position) {
    super(`${message} at position ${position}`);
    this.position = position;
  }
};

// ../../node_modules/jsonrepair/lib/esm/utils/stringUtils.js
var codeSpace = 32;
var codeNewline = 10;
var codeTab = 9;
var codeReturn = 13;
var codeNonBreakingSpace = 160;
var codeMongolianVowelSeparator = 6158;
var codeEnQuad = 8192;
var codeZeroWidthSpace = 8203;
var codeNarrowNoBreakSpace = 8239;
var codeMediumMathematicalSpace = 8287;
var codeIdeographicSpace = 12288;
var codeZeroWidthNoBreakSpace = 65279;
function isHex(char) {
  return /^[0-9A-Fa-f]$/.test(char);
}
function isDigit(char) {
  return char >= "0" && char <= "9";
}
function isValidStringCharacter(char) {
  return char >= " ";
}
function isDelimiter(char) {
  return ",:[]/{}()\n+".includes(char);
}
function isFunctionNameCharStart(char) {
  return char >= "a" && char <= "z" || char >= "A" && char <= "Z" || char === "_" || char === "$";
}
function isFunctionNameChar(char) {
  return char >= "a" && char <= "z" || char >= "A" && char <= "Z" || char === "_" || char === "$" || char >= "0" && char <= "9";
}
var regexUrlStart = /^(http|https|ftp|mailto|file|data|irc):\/\/$/;
var regexUrlChar = /^[A-Za-z0-9-._~:/?#@!$&'()*+;=]$/;
function isUnquotedStringDelimiter(char) {
  return ",[]/{}\n+".includes(char);
}
function isStartOfValue(char) {
  return isQuote(char) || regexStartOfValue.test(char);
}
var regexStartOfValue = /^[[{\w-]$/;
function isControlCharacter(char) {
  return char === "\n" || char === "\r" || char === "	" || char === "\b" || char === "\f";
}
function isWhitespace(text, index) {
  const code = text.charCodeAt(index);
  return code === codeSpace || code === codeNewline || code === codeTab || code === codeReturn;
}
function isWhitespaceExceptNewline(text, index) {
  const code = text.charCodeAt(index);
  return code === codeSpace || code === codeTab || code === codeReturn;
}
function isSpecialWhitespace(text, index) {
  const code = text.charCodeAt(index);
  return code === codeNonBreakingSpace || code === codeMongolianVowelSeparator || code >= codeEnQuad && code <= codeZeroWidthSpace || code === codeNarrowNoBreakSpace || code === codeMediumMathematicalSpace || code === codeIdeographicSpace || code === codeZeroWidthNoBreakSpace;
}
function isQuote(char) {
  return isDoubleQuoteLike(char) || isSingleQuoteLike(char);
}
function isDoubleQuoteLike(char) {
  return char === '"' || char === "\u201C" || char === "\u201D";
}
function isDoubleQuote(char) {
  return char === '"';
}
function isSingleQuoteLike(char) {
  return char === "'" || char === "\u2018" || char === "\u2019" || char === "`" || char === "\xB4";
}
function isSingleQuote(char) {
  return char === "'";
}
function stripLastOccurrence(text, textToStrip) {
  let stripRemainingText = arguments.length > 2 && arguments[2] !== void 0 ? arguments[2] : false;
  const index = text.lastIndexOf(textToStrip);
  return index !== -1 ? text.substring(0, index) + (stripRemainingText ? "" : text.substring(index + 1)) : text;
}
function insertBeforeLastWhitespace(text, textToInsert) {
  let index = text.length;
  if (!isWhitespace(text, index - 1)) {
    return text + textToInsert;
  }
  while (isWhitespace(text, index - 1)) {
    index--;
  }
  return text.substring(0, index) + textToInsert + text.substring(index);
}
function removeAtIndex(text, start, count) {
  return text.substring(0, start) + text.substring(start + count);
}
function endsWithCommaOrNewline(text) {
  return /[,\n][ \t\r]*$/.test(text);
}
var namedHtmlEntities = {
  "&quot;": '"',
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&apos;": "'"
};
var maxHtmlEntityLength = 12;
function matchHtmlEntity(fragment) {
  if (fragment.charAt(0) !== "&") {
    return null;
  }
  const semicolon = fragment.indexOf(";");
  if (semicolon === -1) {
    return null;
  }
  const entity = fragment.substring(0, semicolon + 1);
  const named = namedHtmlEntities[entity];
  if (named !== void 0) {
    return {
      char: named,
      length: entity.length
    };
  }
  if (fragment.charAt(1) === "#") {
    const body = fragment.substring(2, semicolon);
    const hex = body.charAt(0) === "x" || body.charAt(0) === "X";
    const digits = hex ? body.substring(1) : body;
    if (digits.length > 0) {
      const code = Number.parseInt(digits, hex ? 16 : 10);
      if (!Number.isNaN(code) && code >= 0 && code <= 1114111) {
        return {
          char: String.fromCodePoint(code),
          length: entity.length
        };
      }
    }
  }
  return null;
}
function isDoubleQuoteEntity(match) {
  return match !== null && match.char === '"';
}
function isSingleQuoteEntity(match) {
  return match !== null && match.char === "'";
}
function countOccurrences(text, char) {
  let count = 0;
  for (let i = 0; i < text.length; i++) {
    if (text.charAt(i) === char) {
      count++;
    }
  }
  return count;
}
function isInsideUnclosedBracket(text, closeChar) {
  switch (closeChar) {
    case ")":
      return countOccurrences(text, "(") > countOccurrences(text, ")");
    case "]":
      return countOccurrences(text, "[") > countOccurrences(text, "]");
    case "}":
      return countOccurrences(text, "{") > countOccurrences(text, "}");
    default:
      return false;
  }
}

// ../../node_modules/jsonrepair/lib/esm/regular/jsonrepair.js
var controlCharacters = {
  "\b": "\\b",
  "\f": "\\f",
  "\n": "\\n",
  "\r": "\\r",
  "	": "\\t"
};
var escapeCharacters = {
  '"': '"',
  "\\": "\\",
  "/": "/",
  b: "\b",
  f: "\f",
  n: "\n",
  r: "\r",
  t: "	"
  // note that \u is handled separately in parseString()
};
function jsonrepair(text) {
  let i = 0;
  let output = "";
  parseMarkdownCodeBlock(["```", "[```", "{```"]);
  const processed = parseValue();
  if (!processed) {
    throwUnexpectedEnd();
  }
  parseMarkdownCodeBlock(["```", "```]", "```}"]);
  const processedComma = parseCharacter(",");
  if (processedComma) {
    parseWhitespaceAndSkipComments();
  }
  if (isStartOfValue(text[i]) && endsWithCommaOrNewline(output)) {
    if (!processedComma) {
      output = insertBeforeLastWhitespace(output, ",");
    }
    parseNewlineDelimitedJSON();
  } else if (processedComma) {
    output = stripLastOccurrence(output, ",");
  }
  while (text[i] === "}" || text[i] === "]") {
    i++;
    parseWhitespaceAndSkipComments();
  }
  if (i >= text.length) {
    return output;
  }
  throwUnexpectedCharacter();
  function parseValue() {
    parseWhitespaceAndSkipComments();
    const processed2 = parseObject() || parseArray() || parseString() || parseNumber() || parseKeywords() || parseUnquotedString(false) || parseRegex();
    parseWhitespaceAndSkipComments();
    return processed2;
  }
  function parseWhitespaceAndSkipComments() {
    let skipNewline = arguments.length > 0 && arguments[0] !== void 0 ? arguments[0] : true;
    const start = i;
    let changed = parseWhitespace(skipNewline);
    do {
      changed = parseComment();
      if (changed) {
        changed = parseWhitespace(skipNewline);
      }
    } while (changed);
    return i > start;
  }
  function parseWhitespace(skipNewline) {
    const _isWhiteSpace = skipNewline ? isWhitespace : isWhitespaceExceptNewline;
    let whitespace = "";
    while (true) {
      if (_isWhiteSpace(text, i)) {
        whitespace += text[i];
        i++;
      } else if (isSpecialWhitespace(text, i)) {
        whitespace += " ";
        i++;
      } else {
        break;
      }
    }
    if (whitespace.length > 0) {
      output += whitespace;
      return true;
    }
    return false;
  }
  function parseComment() {
    if (text[i] === "/" && text[i + 1] === "*") {
      while (i < text.length && !atEndOfBlockComment(text, i)) {
        i++;
      }
      i += 2;
      return true;
    }
    if (text[i] === "/" && text[i + 1] === "/") {
      while (i < text.length && text[i] !== "\n") {
        i++;
      }
      return true;
    }
    return false;
  }
  function parseMarkdownCodeBlock(blocks) {
    if (skipMarkdownCodeBlock(blocks)) {
      if (isFunctionNameCharStart(text[i])) {
        while (i < text.length && isFunctionNameChar(text[i])) {
          i++;
        }
      }
      parseWhitespaceAndSkipComments();
      return true;
    }
    return false;
  }
  function skipMarkdownCodeBlock(blocks) {
    parseWhitespace(true);
    for (const block of blocks) {
      const end = i + block.length;
      if (text.slice(i, end) === block) {
        i = end;
        return true;
      }
    }
    return false;
  }
  function parseCharacter(char) {
    if (text[i] === char) {
      output += text[i];
      i++;
      return true;
    }
    return false;
  }
  function skipCharacter(char) {
    if (text[i] === char) {
      i++;
      return true;
    }
    return false;
  }
  function skipEscapeCharacter() {
    return skipCharacter("\\");
  }
  function skipEllipsis() {
    parseWhitespaceAndSkipComments();
    if (text[i] === "." && text[i + 1] === "." && text[i + 2] === ".") {
      i += 3;
      parseWhitespaceAndSkipComments();
      skipCharacter(",");
      return true;
    }
    return false;
  }
  function parseObject() {
    if (text[i] === "{") {
      output += "{";
      i++;
      parseWhitespaceAndSkipComments();
      if (skipCharacter(",")) {
        parseWhitespaceAndSkipComments();
      }
      let initial = true;
      while (i < text.length && text[i] !== "}") {
        let processedComma2;
        if (!initial) {
          processedComma2 = parseCharacter(",");
          if (!processedComma2) {
            output = insertBeforeLastWhitespace(output, ",");
          }
          parseWhitespaceAndSkipComments();
        } else {
          processedComma2 = true;
        }
        skipEllipsis();
        const processedKey = parseString() || parseUnquotedString(true);
        if (!processedKey) {
          if (text[i] === "}" || text[i] === "{" || text[i] === "]" || text[i] === "[" || text[i] === void 0) {
            if (!initial) {
              output = stripLastOccurrence(output, ",");
            }
          } else {
            throwObjectKeyExpected();
          }
          break;
        }
        parseWhitespaceAndSkipComments();
        const processedColon = parseCharacter(":");
        const truncatedText = i >= text.length;
        if (!processedColon) {
          if (isStartOfValue(text[i]) || truncatedText) {
            output = insertBeforeLastWhitespace(output, ":");
          } else {
            throwColonExpected();
          }
        }
        const processedValue = parseValue();
        if (!processedValue) {
          if (processedColon || truncatedText) {
            output += "null";
          } else {
            throwColonExpected();
          }
        }
        initial = false;
      }
      if (text[i] === "}") {
        output += "}";
        i++;
      } else {
        output = insertBeforeLastWhitespace(output, "}");
      }
      return true;
    }
    return false;
  }
  function parseArray() {
    if (text[i] === "[") {
      output += "[";
      i++;
      parseWhitespaceAndSkipComments();
      if (skipCharacter(",")) {
        parseWhitespaceAndSkipComments();
      }
      let initial = true;
      while (i < text.length && text[i] !== "]") {
        if (!initial) {
          const processedComma2 = parseCharacter(",");
          if (!processedComma2) {
            output = insertBeforeLastWhitespace(output, ",");
          }
        }
        skipEllipsis();
        const processedValue = parseValue();
        if (!processedValue) {
          if (!initial) {
            output = stripLastOccurrence(output, ",");
          }
          break;
        }
        initial = false;
      }
      if (text[i] === "]") {
        output += "]";
        i++;
      } else {
        output = insertBeforeLastWhitespace(output, "]");
      }
      return true;
    }
    return false;
  }
  function parseNewlineDelimitedJSON() {
    let initial = true;
    let processedValue = true;
    while (processedValue) {
      if (!initial) {
        const processedComma2 = parseCharacter(",");
        if (!processedComma2) {
          output = insertBeforeLastWhitespace(output, ",");
        }
      } else {
        initial = false;
      }
      processedValue = parseValue();
    }
    if (!processedValue) {
      output = stripLastOccurrence(output, ",");
    }
    output = `[
${output}
]`;
  }
  function parseString() {
    let stopAtDelimiter = arguments.length > 0 && arguments[0] !== void 0 ? arguments[0] : false;
    let stopAtIndex = arguments.length > 1 && arguments[1] !== void 0 ? arguments[1] : -1;
    const skipEscapeChars = text[i] === "\\";
    if (skipEscapeChars) {
      i++;
      if (!isQuote(text[i])) {
        throwUnexpectedCharacter();
      }
    }
    const openEntity = text[i] === "&" ? matchHtmlEntity(text.slice(i, i + maxHtmlEntityLength)) : null;
    const openedByEntity = isDoubleQuoteEntity(openEntity) || isSingleQuoteEntity(openEntity);
    if (isQuote(text[i]) || openedByEntity) {
      const isEndQuote = isDoubleQuote(text[i]) ? isDoubleQuote : isSingleQuote(text[i]) ? isSingleQuote : isSingleQuoteLike(text[i]) ? isSingleQuoteLike : isDoubleQuoteLike;
      const iBefore = i;
      const oBefore = output.length;
      let str = '"';
      i += openedByEntity && openEntity ? openEntity.length : 1;
      while (true) {
        if (i >= text.length) {
          const iPrev = prevNonWhitespaceIndex(i - 1);
          if (!stopAtDelimiter && isDelimiter(text.charAt(iPrev))) {
            i = iBefore;
            output = output.substring(0, oBefore);
            return parseString(true);
          }
          str = insertBeforeLastWhitespace(str, '"');
          output += str;
          return true;
        }
        if (i === stopAtIndex) {
          str = insertBeforeLastWhitespace(str, '"');
          output += str;
          return true;
        }
        const entity = openedByEntity && text[i] === "&" ? matchHtmlEntity(text.slice(i, i + maxHtmlEntityLength)) : null;
        const isEnd = entity && openEntity ? entity.char === openEntity.char : isEndQuote(text[i]);
        if (isEnd) {
          const iQuote = i;
          const oQuote = str.length;
          str += '"';
          i += entity ? entity.length : 1;
          output += str;
          parseWhitespaceAndSkipComments(false);
          if (stopAtDelimiter || i >= text.length || isDelimiter(text[i]) && // only count the brackets inside the string when actually needed,
          // i.e. when the quote is directly followed by a closing bracket
          !isInsideUnclosedBracket(str, text[i]) || isQuote(text[i]) && !nextQuoteIsEndQuote(i) || isDigit(text[i])) {
            parseConcatenatedString();
            return true;
          }
          if (text[i] === "\\") {
            throwUnexpectedCharacter();
          }
          const iPrevChar = prevNonWhitespaceIndex(iQuote - 1);
          const prevChar = text.charAt(iPrevChar);
          if (prevChar === ",") {
            i = iBefore;
            output = output.substring(0, oBefore);
            return parseString(false, iPrevChar);
          }
          if (isDelimiter(prevChar)) {
            i = iBefore;
            output = output.substring(0, oBefore);
            return parseString(true);
          }
          output = output.substring(0, oBefore);
          i = iQuote + (entity ? entity.length : 1);
          str = `${str.substring(0, oQuote)}\\${str.substring(oQuote)}`;
        } else if (stopAtDelimiter && isUnquotedStringDelimiter(text[i])) {
          if (text[i - 1] === ":" && regexUrlStart.test(text.substring(iBefore + 1, i + 2))) {
            while (i < text.length && regexUrlChar.test(text[i])) {
              str += text[i];
              i++;
            }
          }
          str = insertBeforeLastWhitespace(str, '"');
          output += str;
          parseConcatenatedString();
          return true;
        } else if (entity) {
          const char = entity.char;
          if (char === '"') {
            str += '\\"';
          } else if (isControlCharacter(char)) {
            str += controlCharacters[char];
          } else {
            str += char;
          }
          i += entity.length;
        } else if (text[i] === "\\") {
          const char = text.charAt(i + 1);
          const escapeChar = escapeCharacters[char];
          if (escapeChar !== void 0) {
            str += text.slice(i, i + 2);
            i += 2;
          } else if (char === "u") {
            let j = 2;
            while (j < 6 && isHex(text[i + j])) {
              j++;
            }
            if (j === 6) {
              str += text.slice(i, i + 6);
              i += 6;
            } else if (i + j >= text.length) {
              i = text.length;
            } else {
              throwInvalidUnicodeCharacter();
            }
          } else if (char === "\n") {
            str += "\\n";
            i += 2;
          } else {
            str += char;
            i += 2;
          }
        } else {
          const char = text.charAt(i);
          if (char === '"' && text[i - 1] !== "\\") {
            str += `\\${char}`;
            i++;
          } else if (isControlCharacter(char)) {
            str += controlCharacters[char];
            i++;
          } else {
            if (!isValidStringCharacter(char)) {
              throwInvalidCharacter(char);
            }
            str += char;
            i++;
          }
        }
        if (skipEscapeChars) {
          skipEscapeCharacter();
        }
      }
    }
    return false;
  }
  function parseConcatenatedString() {
    let processed2 = false;
    parseWhitespaceAndSkipComments();
    while (text[i] === "+") {
      processed2 = true;
      i++;
      parseWhitespaceAndSkipComments();
      output = stripLastOccurrence(output, '"', true);
      const start = output.length;
      const parsedStr = parseString();
      if (parsedStr) {
        output = removeAtIndex(output, start, 1);
      } else {
        output = insertBeforeLastWhitespace(output, '"');
      }
    }
    return processed2;
  }
  function parseNumber() {
    const start = i;
    let num = "";
    let invalid = false;
    if (text[i] === "-") {
      num += text[i];
      i++;
      if (!isDigit(text[i]) && atEndOfNumber()) {
        num += "0";
      }
    }
    if (text[i] === "0" && isDigit(text[i + 1])) {
      invalid = true;
    }
    while (isDigit(text[i])) {
      num += text[i];
      i++;
    }
    if (text[i] === ".") {
      if (num === "" || num === "-") {
        num += "0";
      }
      num += text[i];
      i++;
      if (!isDigit(text[i])) {
        num += "0";
      }
      while (isDigit(text[i])) {
        num += text[i];
        i++;
      }
    }
    if (i > start) {
      if (text[i] === "e" || text[i] === "E") {
        if (num === "-") {
          invalid = true;
        }
        num += text[i];
        i++;
        if (text[i] === "-" || text[i] === "+") {
          num += text[i];
          i++;
        }
        if (!isDigit(text[i])) {
          num += "0";
        }
        while (isDigit(text[i])) {
          num += text[i];
          i++;
        }
      }
      if (!atEndOfNumber()) {
        i = start;
        return false;
      }
      output += invalid ? `"${text.substring(start, i)}"` : num;
      return true;
    }
    return false;
  }
  function parseKeywords() {
    return parseKeyword("true", "true") || parseKeyword("false", "false") || parseKeyword("null", "null") || // repair Python keywords True, False, None
    parseKeyword("True", "true") || parseKeyword("False", "false") || parseKeyword("None", "null");
  }
  function parseKeyword(name, value) {
    if (text.slice(i, i + name.length) === name && !isFunctionNameChar(text[i + name.length])) {
      output += value;
      i += name.length;
      return true;
    }
    return false;
  }
  function parseUnquotedString(isKey) {
    const start = i;
    if (isFunctionNameCharStart(text[i])) {
      while (i < text.length && isFunctionNameChar(text[i])) {
        i++;
      }
      let j = i;
      while (isWhitespace(text, j)) {
        j++;
      }
      if (text[j] === "(") {
        i = j + 1;
        parseValue();
        if (text[i] === ")") {
          i++;
          if (text[i] === ";") {
            i++;
          }
        }
        return true;
      }
    }
    while (i < text.length && !isUnquotedStringDelimiter(text[i]) && !isQuote(text[i]) && (!isKey || text[i] !== ":")) {
      i++;
    }
    if (text[i - 1] === ":" && regexUrlStart.test(text.substring(start, i + 2))) {
      while (i < text.length && regexUrlChar.test(text[i])) {
        i++;
      }
    }
    if (i > start) {
      while (isWhitespace(text, i - 1) && i > 0) {
        i--;
      }
      const symbol = text.slice(start, i);
      output += symbol === "undefined" ? "null" : JSON.stringify(symbol);
      if (text[i] === '"') {
        i++;
      }
      return true;
    }
  }
  function parseRegex() {
    if (text[i] === "/") {
      const start = i;
      i++;
      while (i < text.length && (text[i] !== "/" || text[i - 1] === "\\")) {
        i++;
      }
      i++;
      output += JSON.stringify(text.substring(start, i));
      return true;
    }
  }
  function prevNonWhitespaceIndex(start) {
    let prev = start;
    while (prev > 0 && isWhitespace(text, prev)) {
      prev--;
    }
    return prev;
  }
  function nextQuoteIsEndQuote(index) {
    let next = index + 1;
    while (next < text.length && isWhitespace(text, next)) {
      next++;
    }
    return next >= text.length || isDelimiter(text[next]);
  }
  function atEndOfNumber() {
    return i >= text.length || isDelimiter(text[i]) || isWhitespace(text, i);
  }
  function throwInvalidCharacter(char) {
    throw new JSONRepairError(`Invalid character ${JSON.stringify(char)}`, i);
  }
  function throwUnexpectedCharacter() {
    throw new JSONRepairError(`Unexpected character ${JSON.stringify(text[i])}`, i);
  }
  function throwUnexpectedEnd() {
    throw new JSONRepairError("Unexpected end of json string", text.length);
  }
  function throwObjectKeyExpected() {
    throw new JSONRepairError("Object key expected", i);
  }
  function throwColonExpected() {
    throw new JSONRepairError("Colon expected", i);
  }
  function throwInvalidUnicodeCharacter() {
    const chars = text.slice(i, i + 6);
    throw new JSONRepairError(`Invalid unicode character "${chars}"`, i);
  }
}
function atEndOfBlockComment(text, i) {
  return text[i] === "*" && text[i + 1] === "/";
}

// ../../packages/assessment-core/src/types.ts
var ASSESSMENT_QUESTION_COUNT = 50;

// ../../packages/assessment-core/src/validation.ts
var supportedTypes = /* @__PURE__ */ new Set(["single_choice", "multiple_choice", "true_false"]);
var supportedDifficulties = /* @__PURE__ */ new Set(["easy", "medium", "hard"]);
var minimumImageAspectRatio = 0.25;
var maximumImageAspectRatio = 4;
var maximumMaterialsPerQuestion = 8;
var maximumTableColumns = 12;
var maximumTableRows = 100;
var maximumBarChartItems = 40;
function validateAssessmentQuestions(input) {
  if (!Array.isArray(input)) {
    return { ok: false, errors: ["Questions must be an array."] };
  }
  const errors = [];
  const questionIds = /* @__PURE__ */ new Set();
  input.forEach((question, index) => {
    if (!isRecord(question)) {
      errors.push(`Question ${index + 1} must be a JSON object.`);
      return;
    }
    validateQuestion(question, errors);
    if (isNonEmptyString(question.id)) {
      if (questionIds.has(question.id)) {
        errors.push(`Question ID ${question.id} must be unique.`);
      }
      questionIds.add(question.id);
    }
  });
  return errors.length === 0 ? { ok: true, errors: [], questions: input } : { ok: false, errors };
}
function validateAssessmentPaper(input) {
  const errors = [];
  if (!isRecord(input)) {
    return { ok: false, errors: ["Assessment paper must be a JSON object."] };
  }
  const paper = input;
  if (paper.questionCount !== 50 && paper.questionCount !== 100) {
    errors.push("Question count must be 50 or 100.");
  }
  if (!Array.isArray(paper.questions)) {
    errors.push("Questions must be an array.");
  } else if ((paper.questionCount === 50 || paper.questionCount === 100) && paper.questions.length !== paper.questionCount) {
    errors.push(`Expected ${paper.questionCount} questions but received ${paper.questions.length}.`);
  }
  if (!isRecord(paper.scoring) || !Array.isArray(paper.scoring.levels)) {
    errors.push("Scoring levels are required.");
  } else if (!levelsCoverFullRange(paper.scoring.levels)) {
    errors.push("Scoring levels must cover 0 through 100 percent without gaps.");
  }
  if (Array.isArray(paper.questions)) {
    const questionValidation = validateAssessmentQuestions(paper.questions);
    if (!questionValidation.ok) {
      errors.push(...questionValidation.errors);
    }
  }
  return errors.length === 0 ? { ok: true, errors: [], paper } : { ok: false, errors };
}
function validateQuestion(question, errors) {
  const label = isNonEmptyString(question.id) ? question.id : "unknown";
  const optionIds = new Set(
    Array.isArray(question.options) ? question.options.filter(isRecord).map((option) => option.id).filter(isNonEmptyString) : []
  );
  if (!isNonEmptyString(question.id)) {
    errors.push("Question ID is required.");
  }
  if (!isNonEmptyString(question.prompt)) {
    errors.push(`Question ${label} prompt is required.`);
  }
  if (!supportedTypes.has(question.type)) {
    errors.push(`Question ${label} has unsupported type ${String(question.type)}.`);
  }
  if (!supportedDifficulties.has(question.difficulty)) {
    errors.push(`Question ${label} has unsupported difficulty ${String(question.difficulty)}.`);
  }
  if (!isNonEmptyString(question.knowledgePoint)) {
    errors.push(`Question ${label} knowledgePoint is required.`);
  }
  if (!Array.isArray(question.options) || question.options.length < 2) {
    errors.push(`Question ${label} must have at least two options.`);
  } else {
    const seenOptionIds = /* @__PURE__ */ new Set();
    for (const option of question.options) {
      if (!isRecord(option)) {
        errors.push(`Question ${label} option must be a JSON object.`);
        continue;
      }
      if (!isNonEmptyString(option.id)) {
        errors.push(`Question ${label} option ID is required.`);
      } else if (seenOptionIds.has(option.id)) {
        errors.push(`Question ${label} option ID ${option.id} must be unique.`);
      } else {
        seenOptionIds.add(option.id);
      }
      if (!isNonEmptyString(option.text)) {
        errors.push(`Question ${label} option ${String(option.id || "unknown")} text is required.`);
      }
    }
  }
  if (!Array.isArray(question.correctOptionIds)) {
    errors.push(`Question ${label} correctOptionIds must be an array.`);
  } else {
    for (const optionId of question.correctOptionIds) {
      if (!optionIds.has(optionId)) {
        errors.push(`Question ${label} correct option ${String(optionId)} does not exist in options.`);
      }
    }
  }
  if ((question.type === "single_choice" || question.type === "true_false") && question.correctOptionIds?.length !== 1) {
    errors.push(`Question ${label} ${question.type} questions must have exactly one correct option.`);
  }
  if (question.type === "multiple_choice" && (!question.correctOptionIds || question.correctOptionIds.length < 1)) {
    errors.push(`Question ${label} multiple_choice questions must have at least one correct option.`);
  }
  if (!isNonEmptyString(question.explanation)) {
    errors.push(`Question ${label} explanation is required.`);
  }
  if (Object.prototype.hasOwnProperty.call(question, "materials")) {
    validateQuestionMaterials(question.materials, label, errors);
  }
}
function validateQuestionMaterials(materials, label, errors) {
  if (!Array.isArray(materials)) {
    errors.push(`Question ${label} materials must be an array.`);
    return;
  }
  if (materials.length > maximumMaterialsPerQuestion) {
    errors.push(`Question ${label} materials must not contain more than ${maximumMaterialsPerQuestion} blocks.`);
    return;
  }
  for (const [index, material] of materials.entries()) {
    const materialLabel = `Question ${label} material ${index + 1}`;
    if (!isRecord(material)) {
      errors.push(`${materialLabel} must be a JSON object.`);
      continue;
    }
    switch (material.type) {
      case "text":
        if (!isNonEmptyString(material.text)) {
          errors.push(`${materialLabel} text is required.`);
        }
        break;
      case "image":
        validateImageMaterial(material, materialLabel, errors);
        break;
      case "table":
        validateTableMaterial(material, materialLabel, errors);
        break;
      case "bar_chart":
        validateBarChartMaterial(material, materialLabel, errors);
        break;
      default:
        errors.push(`${materialLabel} has unsupported type ${String(material.type)}.`);
    }
  }
}
function validateImageMaterial(material, label, errors) {
  if (!isHttpsUri(material.uri)) {
    errors.push(`${label} image uri must be a valid HTTPS URL.`);
  }
  if (!isNonEmptyString(material.alt)) {
    errors.push(`${label} image alt is required.`);
  }
  if (material.caption !== void 0 && !isNonEmptyString(material.caption)) {
    errors.push(`${label} image caption must be non-empty when provided.`);
  }
  if (material.aspectRatio !== void 0 && (typeof material.aspectRatio !== "number" || !Number.isFinite(material.aspectRatio) || material.aspectRatio < minimumImageAspectRatio || material.aspectRatio > maximumImageAspectRatio)) {
    errors.push(`${label} image aspectRatio must be between ${minimumImageAspectRatio} and ${maximumImageAspectRatio}.`);
  }
}
function validateTableMaterial(material, label, errors) {
  if (material.caption !== void 0 && !isNonEmptyString(material.caption)) {
    errors.push(`${label} table caption must be non-empty when provided.`);
  }
  if (!Array.isArray(material.columns) || material.columns.length === 0) {
    errors.push(`${label} table must have at least one column.`);
  } else {
    if (material.columns.length > maximumTableColumns) {
      errors.push(`${label} table must not contain more than ${maximumTableColumns} columns.`);
      return;
    }
    material.columns.forEach((column, index) => {
      if (!isNonEmptyString(column)) {
        errors.push(`${label} table column ${index + 1} text is required.`);
      }
    });
  }
  if (!Array.isArray(material.rows) || material.rows.length === 0) {
    errors.push(`${label} table must have at least one row.`);
    return;
  }
  if (material.rows.length > maximumTableRows) {
    errors.push(`${label} table must not contain more than ${maximumTableRows} rows.`);
    return;
  }
  material.rows.forEach((row, rowIndex) => {
    if (!Array.isArray(row)) {
      errors.push(`${label} table row ${rowIndex + 1} must be an array.`);
      return;
    }
    if (Array.isArray(material.columns) && row.length !== material.columns.length) {
      errors.push(`${label} table row ${rowIndex + 1} must have ${material.columns.length} cells.`);
    }
    row.forEach((cell, cellIndex) => {
      if (!isNonEmptyString(cell)) {
        errors.push(`${label} table row ${rowIndex + 1} cell ${cellIndex + 1} text is required.`);
      }
    });
  });
}
function validateBarChartMaterial(material, label, errors) {
  if (material.title !== void 0 && !isNonEmptyString(material.title)) {
    errors.push(`${label} bar_chart title must be non-empty when provided.`);
  }
  if (material.unit !== void 0 && !isNonEmptyString(material.unit)) {
    errors.push(`${label} bar_chart unit must be non-empty when provided.`);
  }
  if (!Array.isArray(material.items) || material.items.length < 2) {
    errors.push(`${label} bar_chart must have at least two items.`);
    return;
  }
  if (material.items.length > maximumBarChartItems) {
    errors.push(`${label} bar_chart must not contain more than ${maximumBarChartItems} items.`);
    return;
  }
  material.items.forEach((item, index) => {
    const itemLabel = `${label} bar_chart item ${index + 1}`;
    if (!isRecord(item)) {
      errors.push(`${itemLabel} must be a JSON object.`);
      return;
    }
    if (!isNonEmptyString(item.label)) {
      errors.push(`${itemLabel} label is required.`);
    }
    if (typeof item.value !== "number" || !Number.isFinite(item.value) || item.value < 0) {
      errors.push(`${itemLabel} value must be greater than or equal to 0.`);
    }
    if (item.displayValue !== void 0 && !isNonEmptyString(item.displayValue)) {
      errors.push(`${itemLabel} displayValue must be non-empty when provided.`);
    }
  });
}
function levelsCoverFullRange(levels) {
  if (levels.length === 0) return false;
  const sorted = [...levels].sort((left, right) => left.minPercent - right.minPercent);
  let expectedMin = 0;
  for (const level of sorted) {
    if (level.minPercent !== expectedMin || level.maxPercent < level.minPercent) {
      return false;
    }
    expectedMin = level.maxPercent + 1;
  }
  return sorted[sorted.length - 1]?.maxPercent === 100;
}
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}
function isHttpsUri(value) {
  if (typeof value !== "string") return false;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

// src/generation/parseAssessment.ts
function parseAssessment(raw, input) {
  if (typeof raw !== "string" || raw.trim().length === 0) throw invalidModelResponse();
  try {
    const { candidate, external } = extractJsonObject(raw);
    if (containsMarkup(external)) throw invalidModelResponse();
    const parsed = JSON.parse(jsonrepair(candidate));
    if (!isRecord2(parsed) || !Array.isArray(parsed.questions) || parsed.questions.length !== ASSESSMENT_QUESTION_COUNT) {
      throw invalidModelResponse();
    }
    const questions = parsed.questions.map((question, index) => canonicalQuestion(question, index));
    const paper = {
      id: input.assessmentId,
      topic: input.topic,
      questionCount: ASSESSMENT_QUESTION_COUNT,
      generatedAt: input.generatedAt,
      scoring: canonicalScoring(parsed.scoring),
      questions
    };
    const validation = validateAssessmentPaper(paper);
    if (!validation.ok || validation.paper.questionCount !== ASSESSMENT_QUESTION_COUNT) throw invalidModelResponse();
    return validation.paper;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw invalidModelResponse();
  }
}
function canonicalQuestion(value, index) {
  if (!isRecord2(value)) return value;
  const question = {
    id: `q${index + 1}`,
    type: value.type,
    difficulty: value.difficulty,
    knowledgePoint: value.knowledgePoint,
    prompt: value.prompt,
    options: Array.isArray(value.options) ? value.options.map(canonicalOption) : value.options,
    correctOptionIds: value.correctOptionIds,
    explanation: value.explanation
  };
  if (Object.prototype.hasOwnProperty.call(value, "materials")) question.materials = canonicalMaterials(value.materials);
  return question;
}
function canonicalOption(value) {
  return isRecord2(value) ? { id: value.id, text: value.text } : value;
}
function canonicalMaterials(value) {
  if (!Array.isArray(value)) return value;
  return value.map((material) => {
    if (!isRecord2(material)) return material;
    if (material.type === "text") return { type: material.type, text: material.text };
    if (material.type === "image") return compact({
      type: material.type,
      uri: material.uri,
      alt: material.alt,
      caption: material.caption,
      aspectRatio: material.aspectRatio
    });
    if (material.type === "table") return compact({
      type: material.type,
      caption: material.caption,
      columns: material.columns,
      rows: material.rows
    });
    if (material.type === "bar_chart") return compact({
      type: material.type,
      title: material.title,
      unit: material.unit,
      items: Array.isArray(material.items) ? material.items.map((item) => isRecord2(item) ? compact({ label: item.label, value: item.value, displayValue: item.displayValue }) : item) : material.items
    });
    return { type: material.type };
  });
}
function canonicalScoring(value) {
  if (!isRecord2(value) || !isFiniteNumber(value.maxScore) || value.maxScore <= 0 || !Array.isArray(value.levels)) {
    throw invalidModelResponse();
  }
  const levels = value.levels.map((level) => {
    if (!isRecord2(level) || !isFiniteNumber(level.minPercent) || !isFiniteNumber(level.maxPercent) || typeof level.title !== "string" || level.title.trim().length === 0 || typeof level.summary !== "string" || level.summary.trim().length === 0) {
      throw invalidModelResponse();
    }
    return {
      minPercent: level.minPercent,
      maxPercent: level.maxPercent,
      title: level.title,
      summary: level.summary
    };
  });
  return { maxScore: value.maxScore, levels };
}
function compact(value) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== void 0));
}
function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}
function extractJsonObject(raw) {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(raw);
  const source = fenced?.[1] ?? raw;
  const firstBrace = source.indexOf("{");
  const lastBrace = source.lastIndexOf("}");
  if (firstBrace < 0 || lastBrace <= firstBrace) throw invalidModelResponse();
  const outsideFence = fenced === null ? "" : `${raw.slice(0, fenced.index)}${raw.slice(fenced.index + fenced[0].length)}`;
  return {
    candidate: source.slice(firstBrace, lastBrace + 1),
    external: `${outsideFence}${source.slice(0, firstBrace)}${source.slice(lastBrace + 1)}`
  };
}
function containsMarkup(value) {
  return /(?:<!doctype\s+html|<\?xml\b|<\/?[a-z][^>]*>)/i.test(value);
}
function invalidModelResponse() {
  return new ApiError("INVALID_MODEL_RESPONSE", 502, true);
}
function isRecord2(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// src/http/deadline.ts
function createDeadline(durationMs, now = Date.now) {
  return { expiresAt: now() + durationMs, now };
}
function remainingMilliseconds(deadline) {
  return Math.max(0, deadline.expiresAt - deadline.now());
}
function assertWithinDeadline(deadline) {
  if (remainingMilliseconds(deadline) <= 0) throw requestTimeout();
}
async function withinDeadline(operation, deadline) {
  const remaining = remainingMilliseconds(deadline);
  if (remaining <= 0) throw requestTimeout();
  let timeout;
  const expiry = new Promise((_resolve, reject) => {
    timeout = setTimeout(() => reject(requestTimeout()), remaining);
  });
  try {
    return await Promise.race([operation, expiry]);
  } finally {
    if (timeout !== void 0) clearTimeout(timeout);
  }
}
function requestTimeout() {
  return new ApiError("REQUEST_TIMEOUT", 504, true);
}

// src/generation/generateAssessment.ts
async function generateFiftyQuestionAssessment(input, dependencies, deadline) {
  if (deadline !== void 0) assertWithinDeadline(deadline);
  await dependencies.checkText(JSON.stringify({
    topic: input.topic,
    ...input.notes === void 0 ? {} : { notes: input.notes }
  }), input.openId, deadline);
  if (deadline !== void 0) assertWithinDeadline(deadline);
  const raw = await dependencies.complete({
    topic: input.topic,
    ...input.notes === void 0 ? {} : { notes: input.notes }
  }, deadline);
  if (deadline !== void 0) assertWithinDeadline(deadline);
  const generatedAt = dependencies.now().toISOString();
  const paper = parseAssessment(raw, { assessmentId: input.assessmentId, topic: input.topic, generatedAt });
  await dependencies.checkText(moderationText(paper), input.openId, deadline);
  if (deadline !== void 0) assertWithinDeadline(deadline);
  const persistence = dependencies.createIfAbsent({
    id: input.assessmentId,
    ownerKey: input.ownerKey,
    revision: 1,
    status: "draft",
    paper,
    answers: {},
    result: null,
    createdAt: generatedAt,
    updatedAt: generatedAt,
    submittedAt: null
  });
  return deadline === void 0 ? await persistence : await withinDeadline(persistence, deadline);
}
function moderationText(paper) {
  return JSON.stringify(paper);
}

// src/generation/openAIClient.ts
var PROVIDER_TIMEOUT_MS = 105e3;
var MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
async function requestOpenAICompletion(input, dependencies) {
  const { baseUrl, apiKey, model } = requireConfiguration(dependencies);
  const controller = new AbortController();
  const startedAt = Date.now();
  const globalExpiry = dependencies.deadline?.expiresAt ?? Number.POSITIVE_INFINITY;
  const providerExpiry = startedAt + PROVIDER_TIMEOUT_MS;
  const expiresAt = Math.min(globalExpiry, providerExpiry);
  const timeoutError = globalExpiry <= providerExpiry ? new ApiError("REQUEST_TIMEOUT", 504, true) : new ApiError("PROVIDER_ERROR", 502, true);
  const timeoutMs = Math.max(0, expiresAt - Date.now());
  let timedOut = false;
  let timeout;
  const expiry = new Promise((_resolve, reject) => {
    timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
      reject(timeoutError);
    }, timeoutMs);
  });
  try {
    if (timeoutMs <= 0) throw timeoutError;
    const response = await Promise.race([
      (dependencies.fetch ?? fetch)(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${apiKey}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          model,
          temperature: 0.4,
          response_format: { type: "json_object" },
          messages: [
            {
              role: "system",
              content: [
                "Generate exactly 50 assessment questions in one response.",
                "Return one JSON object with questions and scoring. Do not return HTML, XML, Markdown, or commentary.",
                "Write the assessment in the same language as the topic and notes. When language is unclear, default to Chinese.",
                "Each question must include id, type, difficulty, knowledgePoint, prompt, options, correctOptionIds, and explanation."
              ].join(" ")
            },
            {
              role: "user",
              content: JSON.stringify({ topic: input.topic, ...input.notes === void 0 ? {} : { notes: input.notes } })
            }
          ]
        }),
        signal: controller.signal
      }),
      expiry
    ]);
    if (!response.ok) {
      cancelUnreadBody(response);
      throw new ApiError("PROVIDER_ERROR", 502, true);
    }
    const raw = await readBoundedBody(response, MAX_RESPONSE_BYTES, expiresAt, timeoutError);
    let payload;
    try {
      payload = JSON.parse(raw);
    } catch {
      throw new ApiError("INVALID_MODEL_RESPONSE", 502, true);
    }
    const content = completionContent(payload);
    if (content === null) throw new ApiError("INVALID_MODEL_RESPONSE", 502, true);
    return content;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (timedOut) throw timeoutError;
    throw new ApiError("PROVIDER_ERROR", 502, true);
  } finally {
    if (timeout !== void 0) clearTimeout(timeout);
  }
}
async function readBoundedBody(response, limit, expiresAt, timeoutError) {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > limit) {
    cancelUnreadBody(response);
    throw new ApiError("INVALID_MODEL_RESPONSE", 502, true);
  }
  if (response.body === null) return "";
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const remaining = Math.max(0, expiresAt - Date.now());
      if (remaining <= 0) throw timeoutError;
      let timer;
      const expiry = new Promise((_resolve, reject) => {
        timer = setTimeout(() => reject(timeoutError), remaining);
      });
      let result;
      try {
        result = await Promise.race([reader.read(), expiry]);
      } finally {
        if (timer !== void 0) clearTimeout(timer);
      }
      if (result.done) break;
      if (result.value === void 0) continue;
      total += result.value.byteLength;
      if (total > limit) throw new ApiError("INVALID_MODEL_RESPONSE", 502, true);
      chunks.push(result.value);
    }
  } catch (error) {
    void reader.cancel().catch(() => void 0);
    throw error;
  } finally {
    reader.releaseLock();
  }
  const joined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(joined);
}
function cancelUnreadBody(response) {
  if (response.body !== null && !response.body.locked) void response.body.cancel().catch(() => void 0);
}
function completionContent(value) {
  if (!isRecord3(value) || !Array.isArray(value.choices)) return null;
  const first = value.choices[0];
  if (!isRecord3(first) || !isRecord3(first.message) || typeof first.message.content !== "string") return null;
  return first.message.content;
}
function requireConfiguration(dependencies) {
  if (!dependencies.baseUrl || !dependencies.apiKey || !dependencies.model) {
    throw new ApiError("CONFIGURATION_ERROR", 503, false);
  }
  let url;
  try {
    url = new URL(dependencies.baseUrl);
  } catch {
    throw new ApiError("CONFIGURATION_ERROR", 503, false);
  }
  if (url.protocol !== "https:") throw new ApiError("CONFIGURATION_ERROR", 503, false);
  return { baseUrl: dependencies.baseUrl, apiKey: dependencies.apiKey, model: dependencies.model };
}
function isRecord3(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// src/http/envelope.ts
function success(data, status = 200) {
  return json({ ok: true, data }, status);
}
function failure(code, retryable, status) {
  return json({ ok: false, error: { code, message: publicMessage(code), retryable } }, status);
}
function publicMessage(code) {
  const messages = {
    INVALID_REQUEST: "The request is invalid.",
    METHOD_NOT_ALLOWED: "The HTTP method is not supported.",
    UNAUTHORIZED: "Authentication is required.",
    SESSION_EXPIRED: "The session has expired.",
    PRIVACY_CONSENT_REQUIRED: "Current privacy consent is required.",
    CONTENT_BLOCKED: "The content did not pass safety review.",
    FREE_TIER_LIMIT: "The free generation limit has been reached.",
    GENERATION_DISABLED: "Assessment generation is temporarily disabled.",
    PROVIDER_ERROR: "The model provider is temporarily unavailable.",
    INVALID_MODEL_RESPONSE: "The model returned an invalid assessment.",
    CONFIGURATION_ERROR: "The service is not configured.",
    REQUEST_TIMEOUT: "The request timed out.",
    JOB_ATTEMPT_LIMIT: "The generation retry limit has been reached.",
    BACKEND_UNAVAILABLE: "The backend is temporarily unavailable.",
    INTERNAL_ERROR: "An internal error occurred."
  };
  return messages[code] ?? "The request could not be completed.";
}
function json(body, status) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}

// src/storage/assessmentRepository.ts
var INDEX_LIMIT = 200;
var INDEX_DISCOVERY_LIMIT = 64;
var REVISION_DISCOVERY_LIMIT = 256;
var INDEX_WRITE_RETRIES = 8;
var DEFAULT_DRAFT_RETENTION_DAYS = 30;
var DEFAULT_CLEANUP_LIMIT = 20;
var BlobAssessmentRepository = class {
  constructor(blob, options) {
    this.blob = blob;
    this.options = options;
  }
  async get(ownerKey, id) {
    const record = await this.readLatest(ownerKey, id);
    if (record !== null && this.isExpiredDraft(record)) {
      await this.deleteAssessment(ownerKey, id);
      return null;
    }
    return record;
  }
  async list(ownerKey) {
    const index = await this.readIndex(ownerKey);
    const retained = [];
    let cleanups = 0;
    const fullyCleaned = /* @__PURE__ */ new Set();
    for (const summary of index) {
      if (this.isExpiredSummary(summary)) {
        if (cleanups < this.cleanupLimit) {
          const remainingBudget = this.cleanupLimit - cleanups;
          const cleanup = await this.deleteAssessment(ownerKey, summary.id, remainingBudget);
          cleanups += cleanup.deleted;
          if (cleanup.complete) fullyCleaned.add(summary.id);
        }
        continue;
      }
      retained.push(summary);
    }
    if (fullyCleaned.size > 0) await this.mutateIndex(ownerKey, (summaries) => summaries.filter((summary) => !fullyCleaned.has(summary.id) || !this.isExpiredSummary(summary)));
    return retained.slice(0, INDEX_LIMIT);
  }
  async createIfAbsent(record) {
    const normalized = clone(record);
    const key = this.revisionKey(normalized.ownerKey, normalized.id, 1);
    try {
      await this.blob.put(key, normalized, { onlyIfNew: true });
    } catch (error) {
      if (!(error instanceof BlobPreconditionFailedError)) throw error;
      const existing = await this.get(normalized.ownerKey, normalized.id);
      if (existing !== null) {
        await this.upsertSummary(existing);
        return existing;
      }
      throw error;
    }
    await this.writePointer(normalized.ownerKey, normalized.id, 1);
    await this.upsertSummary(normalized);
    return normalized;
  }
  async compareAndSwap(update) {
    const current = await this.get(update.ownerKey, update.id);
    if (current === null || current.revision !== update.expectedRevision || current.status !== "draft") return conflict();
    const next = {
      ...current,
      revision: current.revision + 1,
      answers: clone(update.answers),
      updatedAt: update.updatedAt
    };
    return await this.writeNext(next);
  }
  async complete(update) {
    const current = await this.get(update.ownerKey, update.id);
    if (current === null || current.revision !== update.expectedRevision) return conflict();
    if (current.status === "completed") return { type: "updated", record: current };
    const next = {
      ...current,
      revision: current.revision + 1,
      status: "completed",
      answers: clone(update.answers),
      result: clone(update.result),
      submittedAt: update.submittedAt,
      updatedAt: update.updatedAt
    };
    return await this.writeNext(next);
  }
  async writeNext(next) {
    try {
      await this.blob.put(this.revisionKey(next.ownerKey, next.id, next.revision), next, { onlyIfNew: true });
    } catch (error) {
      if (error instanceof BlobPreconditionFailedError) return conflict();
      throw error;
    }
    await this.writePointer(next.ownerKey, next.id, next.revision);
    await this.upsertSummary(next);
    return { type: "updated", record: next };
  }
  async readLatest(ownerKey, id) {
    const prefix = `${this.baseKey(ownerKey, id)}/revisions/`;
    const revisions = (await this.blob.list(prefix, { consistency: "strong", limit: REVISION_DISCOVERY_LIMIT })).blobs.map((key) => Number(/^.+\/revisions\/(\d{12})\.json$/.exec(key)?.[1])).map((inverse) => 999999999999 - inverse).filter((value) => Number.isInteger(value) && value > 0);
    const revision = revisions.length === 0 ? null : Math.max(...revisions);
    if (revision === null) return null;
    return await this.blob.get(this.revisionKey(ownerKey, id, revision), { consistency: "strong" });
  }
  async readIndex(ownerKey) {
    return (await this.readLatestIndex(ownerKey)).summaries;
  }
  async upsertSummary(record) {
    const summary = toSummary(record);
    await this.mutateIndex(record.ownerKey, (index) => [summary, ...index.filter((item) => item.id !== record.id)]);
  }
  async mutateIndex(ownerKey, mutate) {
    for (let attempt = 0; attempt < INDEX_WRITE_RETRIES; attempt += 1) {
      const current = await this.readLatestIndex(ownerKey);
      const next = {
        revision: current.revision + 1,
        summaries: mutate(current.summaries).filter(isSummary).sort(sortSummaries).slice(0, INDEX_LIMIT)
      };
      try {
        await this.blob.put(this.indexRevisionKey(ownerKey, next.revision), next, { onlyIfNew: true });
        return;
      } catch (error) {
        if (!(error instanceof BlobPreconditionFailedError)) throw error;
      }
    }
    throw new Error("INDEX_WRITE_CONFLICT");
  }
  async readLatestIndex(ownerKey) {
    const prefix = `${this.indexPrefix(ownerKey)}/`;
    const revisions = (await this.blob.list(prefix, { consistency: "strong", limit: INDEX_DISCOVERY_LIMIT })).blobs.map((key) => Number(/\/(\d{12})\.json$/.exec(key)?.[1])).map((inverse) => 999999999999 - inverse).filter((revision2) => Number.isInteger(revision2) && revision2 > 0);
    const revision = revisions.length === 0 ? 0 : Math.max(...revisions);
    if (revision === 0) return { revision: 0, summaries: [] };
    return await this.blob.get(this.indexRevisionKey(ownerKey, revision), { consistency: "strong" }) ?? { revision: 0, summaries: [] };
  }
  async writePointer(ownerKey, id, revision) {
    await this.blob.put(`${this.baseKey(ownerKey, id)}.json`, { revision, updatedAt: this.options.now().toISOString() });
  }
  async deleteAssessment(ownerKey, id, limit = this.cleanupLimit) {
    const prefix = `${this.baseKey(ownerKey, id)}/`;
    const keys = (await this.blob.list(prefix, { consistency: "strong", limit: limit + 1 })).blobs;
    const deleteKeys = keys.slice(0, limit);
    await Promise.all(deleteKeys.map((key) => this.blob.delete(key)));
    const complete = keys.length <= limit;
    if (complete) await this.blob.delete(`${this.baseKey(ownerKey, id)}.json`);
    return { complete, deleted: deleteKeys.length };
  }
  isExpiredDraft(record) {
    return record.status === "draft" && this.isExpiredAt(record.updatedAt);
  }
  isExpiredSummary(summary) {
    return summary.status === "draft" && this.isExpiredAt(summary.updatedAt);
  }
  isExpiredAt(value) {
    const cutoff = this.options.now().getTime() - (this.options.draftRetentionDays ?? DEFAULT_DRAFT_RETENTION_DAYS) * 864e5;
    return new Date(value).getTime() < cutoff;
  }
  get cleanupLimit() {
    return this.options.cleanupLimit ?? DEFAULT_CLEANUP_LIMIT;
  }
  baseKey(ownerKey, id) {
    return `assessments/${part(ownerKey)}/${part(id)}`;
  }
  revisionKey(ownerKey, id, revision) {
    return `${this.baseKey(ownerKey, id)}/revisions/${String(999999999999 - revision).padStart(12, "0")}.json`;
  }
  indexPrefix(ownerKey) {
    return `assessments/${part(ownerKey)}/index-revisions`;
  }
  indexRevisionKey(ownerKey, revision) {
    return `${this.indexPrefix(ownerKey)}/${String(999999999999 - revision).padStart(12, "0")}.json`;
  }
};
function toSummary(record) {
  return { id: record.id, revision: record.revision, status: record.status, createdAt: record.createdAt, updatedAt: record.updatedAt, submittedAt: record.submittedAt, topic: record.paper.topic, questionCount: record.paper.questions.length || record.paper.questionCount, answeredCount: Object.values(record.answers).filter((answer) => answer.length > 0).length, score: score(record.result) };
}
function score(result) {
  return result !== null && typeof result.score === "number" ? result.score : null;
}
function sortSummaries(left, right) {
  return right.updatedAt.localeCompare(left.updatedAt) || right.id.localeCompare(left.id);
}
function isSummary(value) {
  return typeof value === "object" && value !== null && typeof value.id === "string" && typeof value.updatedAt === "string";
}
function conflict() {
  return { type: "conflict", code: "REVISION_CONFLICT" };
}
function part(value) {
  return encodeURIComponent(value);
}
function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

// src/storage/quotaRepository.ts
var import_node_crypto2 = require("node:crypto");
var MAX_REVISION = 999999999999;
var MAX_CAS_ATTEMPTS = 8;
var RATE_RESERVATION_RETENTION_MS = 30 * 24 * 60 * 60 * 1e3;
var RATE_REVISION_KEEP_COUNT = 8;
var RATE_REVISION_CLEANUP_LIMIT = 32;
function quotaErrorCode(decision) {
  if (decision === "rate_limited" || decision === "quota_exceeded") return "FREE_TIER_LIMIT";
  return decision === "generation_disabled" ? "GENERATION_DISABLED" : null;
}
var BlobQuotaRepository = class {
  constructor(blob) {
    this.blob = blob;
  }
  async reserve(ownerKey, now, generationEnabled, reservationId) {
    if (!generationEnabled) return "generation_disabled";
    const requestAt = now.toISOString();
    const utcDay = now.toISOString().slice(0, 10);
    let reservedDate = utcDay;
    if (reservationId !== void 0) {
      const existing = await this.readMarker(ownerKey, reservationId);
      const marker = existing ?? await this.claimMarker(ownerKey, reservationId, utcDay, requestAt);
      reservedDate = marker.reservedDate;
    }
    const dailyPreflight = await this.preflightDailyReservation(ownerKey, reservedDate, reservationId);
    if (dailyPreflight !== "allowed") return dailyPreflight;
    const rateDecision = await this.appendRateReservation(ownerKey, reservationId, requestAt);
    if (rateDecision !== "allowed") return rateDecision;
    return await this.appendDailyReservation(ownerKey, reservedDate, reservationId);
  }
  async claimMarker(ownerKey, reservationId, reservedDate, reservedAt) {
    const marker = {
      reservationIdHash: hashReservationId(reservationId),
      reservedDate,
      reservedAt
    };
    try {
      await this.blob.put(this.markerKey(ownerKey, reservationId), marker, { onlyIfNew: true });
      return marker;
    } catch (error) {
      if (!isPreconditionFailure2(error)) throw error;
      const winner = await this.readMarker(ownerKey, reservationId);
      if (winner === null) throw new Error("QUOTA_MARKER_CONFLICT");
      return winner;
    }
  }
  async readMarker(ownerKey, reservationId) {
    const marker = await this.blob.get(this.markerKey(ownerKey, reservationId), { consistency: "strong" });
    if (marker === null) return null;
    if (marker.reservationIdHash !== hashReservationId(reservationId) || !/^\d{4}-\d{2}-\d{2}$/.test(marker.reservedDate) || !Number.isFinite(new Date(marker.reservedAt).getTime())) throw new Error("INVALID_QUOTA_MARKER");
    return marker;
  }
  async appendRateReservation(ownerKey, reservationId, requestAt) {
    for (let attempt = 0; attempt < MAX_CAS_ATTEMPTS; attempt += 1) {
      const latest = await this.readLatestRate(ownerKey);
      const reservations = retainedRateReservations(latest, requestAt);
      if (reservationId !== void 0 && reservations.some((reservation) => reservation.reservationId === reservationId)) return "allowed";
      if (latest !== null && new Date(requestAt).getTime() - new Date(latest.lastRequestAt).getTime() < 6e4) {
        return "rate_limited";
      }
      const next = {
        revision: (latest?.revision ?? 0) + 1,
        lastRequestAt: requestAt,
        reservations: reservationId === void 0 ? reservations : [...reservations, { reservationId, acceptedAt: requestAt }]
      };
      try {
        await this.blob.put(this.rateLedgerKey(ownerKey, next.revision), next, { onlyIfNew: true });
        await this.cleanupRateRevisions(ownerKey, next.revision, requestAt);
        return "allowed";
      } catch (error) {
        if (isPreconditionFailure2(error)) continue;
        throw error;
      }
    }
    return "rate_limited";
  }
  async preflightDailyReservation(ownerKey, utcDay, reservationId) {
    const latest = await this.readLatestDay(ownerKey, utcDay);
    if (reservationId !== void 0 && normalizedReservationIds(latest).includes(reservationId)) return "allowed";
    return (latest?.dailyCount ?? 0) >= 5 ? "quota_exceeded" : "allowed";
  }
  async appendDailyReservation(ownerKey, utcDay, reservationId) {
    for (let attempt = 0; attempt < MAX_CAS_ATTEMPTS; attempt += 1) {
      const latest = await this.readLatestDay(ownerKey, utcDay);
      const reservationIds = normalizedReservationIds(latest);
      if (reservationId !== void 0 && reservationIds.includes(reservationId)) return "allowed";
      const dailyCount = latest?.dailyCount ?? 0;
      if (dailyCount >= 5) return "quota_exceeded";
      const next = {
        revision: (latest?.revision ?? 0) + 1,
        utcDay,
        dailyCount: dailyCount + 1,
        reservationIds: reservationId === void 0 ? reservationIds : [...reservationIds, reservationId],
        ...reservationId === void 0 ? {} : { reservationId }
      };
      try {
        await this.blob.put(this.ledgerKey(ownerKey, utcDay, next.revision), next, { onlyIfNew: true });
        return "allowed";
      } catch (error) {
        if (isPreconditionFailure2(error)) continue;
        throw error;
      }
    }
    return "rate_limited";
  }
  async readLatestRate(ownerKey) {
    const prefix = this.rateLedgerPrefix(ownerKey);
    const keys = (await this.blob.list(prefix, { consistency: "strong" })).blobs;
    const revision = latestRevision(keys);
    return revision === null ? null : await this.blob.get(this.rateLedgerKey(ownerKey, revision), { consistency: "strong" });
  }
  async cleanupRateRevisions(ownerKey, writtenRevision, requestAt) {
    try {
      const listing = await this.blob.list(this.rateLedgerPrefix(ownerKey), { consistency: "strong" });
      const revisions = rateRevisionEntries(listing.blobs);
      if (revisions.length <= 1) return;
      const latestRevisionNumber = revisions[0].revision;
      const protectedRevisions = new Set(revisions.slice(0, RATE_REVISION_KEEP_COUNT).map((entry) => entry.revision));
      protectedRevisions.add(latestRevisionNumber);
      protectedRevisions.add(writtenRevision);
      const deletionCandidates = /* @__PURE__ */ new Map();
      for (const entry of revisions) {
        if (!protectedRevisions.has(entry.revision)) deletionCandidates.set(entry.revision, entry.key);
      }
      const cutoff = new Date(requestAt).getTime() - RATE_RESERVATION_RETENTION_MS;
      const ageCandidates = revisions.slice(1, RATE_REVISION_KEEP_COUNT).filter((entry) => entry.revision !== writtenRevision && entry.revision !== latestRevisionNumber);
      for (const entry of ageCandidates) {
        try {
          const record = await this.blob.get(entry.key, { consistency: "strong" });
          if (record !== null && new Date(record.lastRequestAt).getTime() < cutoff) {
            deletionCandidates.set(entry.revision, entry.key);
          }
        } catch {
        }
      }
      const deletions = [...deletionCandidates.entries()].sort(([left], [right]) => left - right).slice(0, RATE_REVISION_CLEANUP_LIMIT);
      for (const [, key] of deletions) {
        try {
          await this.blob.delete(key);
        } catch {
        }
      }
    } catch {
    }
  }
  async readLatestDay(ownerKey, utcDay) {
    const prefix = this.ledgerPrefix(ownerKey, utcDay);
    const keys = (await this.blob.list(prefix, { consistency: "strong" })).blobs;
    const revision = latestRevision(keys);
    return revision === null ? null : await this.blob.get(this.ledgerKey(ownerKey, utcDay, revision), { consistency: "strong" });
  }
  ledgerPrefix(ownerKey, utcDay) {
    return `quotas/${encodeURIComponent(ownerKey)}/ledger/${utcDay}/`;
  }
  ledgerKey(ownerKey, utcDay, revision) {
    return `${this.ledgerPrefix(ownerKey, utcDay)}${inverseRevision(revision)}.json`;
  }
  rateLedgerPrefix(ownerKey) {
    return `quotas/${encodeURIComponent(ownerKey)}/rate-ledger/`;
  }
  rateLedgerKey(ownerKey, revision) {
    return `${this.rateLedgerPrefix(ownerKey)}${inverseRevision(revision)}.json`;
  }
  markerKey(ownerKey, reservationId) {
    return `quotas/${encodeURIComponent(ownerKey)}/reservations/${hashReservationId(reservationId)}.json`;
  }
};
function normalizedReservationIds(record) {
  if (record === null) return [];
  const ids = Array.isArray(record.reservationIds) ? record.reservationIds.filter((value) => typeof value === "string" && value.length > 0).slice(0, 5) : [];
  if (typeof record.reservationId === "string" && record.reservationId.length > 0 && !ids.includes(record.reservationId)) {
    ids.push(record.reservationId);
  }
  return ids.slice(0, 5);
}
function hashReservationId(reservationId) {
  return (0, import_node_crypto2.createHash)("sha256").update(reservationId, "utf8").digest("hex");
}
function retainedRateReservations(record, requestAt) {
  if (record === null || !Array.isArray(record.reservations)) return [];
  const cutoff = new Date(requestAt).getTime() - RATE_RESERVATION_RETENTION_MS;
  const seen = /* @__PURE__ */ new Set();
  return record.reservations.filter((reservation) => {
    if (typeof reservation?.reservationId !== "string" || reservation.reservationId.length === 0 || typeof reservation.acceptedAt !== "string" || new Date(reservation.acceptedAt).getTime() < cutoff || seen.has(reservation.reservationId)) return false;
    seen.add(reservation.reservationId);
    return true;
  });
}
function latestRevision(keys) {
  return rateRevisionEntries(keys)[0]?.revision ?? null;
}
function rateRevisionEntries(keys) {
  return keys.map((key) => {
    const inverse = Number(/\/(\d{12})\.json$/.exec(key)?.[1]);
    return { key, revision: MAX_REVISION - inverse };
  }).filter((entry) => Number.isInteger(entry.revision) && entry.revision > 0).sort((left, right) => right.revision - left.revision);
}
function inverseRevision(revision) {
  return String(MAX_REVISION - revision).padStart(12, "0");
}
function isPreconditionFailure2(error) {
  return error instanceof BlobPreconditionFailedError || typeof error === "object" && error !== null && "code" in error && error.code === "BLOB_PRECONDITION_FAILED";
}

// src/storage/reportRepository.ts
var BlobReportRepository = class {
  constructor(blob, options) {
    this.blob = blob;
    this.options = options;
  }
  async create(record) {
    const written = JSON.parse(JSON.stringify(record));
    await this.blob.put(this.key(written.ownerKey, written.id), written, { onlyIfNew: true });
    return written;
  }
  async list(ownerKey) {
    const keys = (await this.blob.list(this.prefix(ownerKey), { consistency: "strong", limit: 200 })).blobs;
    const records = await Promise.all(keys.map((key) => this.blob.get(key, { consistency: "strong" })));
    const retained = [];
    let cleanups = 0;
    for (const record of records) {
      if (record === null || record.ownerKey !== ownerKey) continue;
      if (new Date(record.createdAt).getTime() < this.cutoff()) {
        if (cleanups < this.cleanupLimit) {
          cleanups += 1;
          await this.blob.delete(this.key(ownerKey, record.id));
        }
        continue;
      }
      retained.push(record);
    }
    return retained.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }
  cutoff() {
    return this.options.now().getTime() - (this.options.retentionDays ?? 365) * 864e5;
  }
  get cleanupLimit() {
    return this.options.cleanupLimit ?? 20;
  }
  prefix(ownerKey) {
    return `reports/${encodeURIComponent(ownerKey)}/`;
  }
  key(ownerKey, id) {
    return `${this.prefix(ownerKey)}${encodeURIComponent(id)}.json`;
  }
};

// src/storage/settingsRepository.ts
var BlobSettingsRepository = class {
  constructor(blob) {
    this.blob = blob;
  }
  async get(ownerKey) {
    return await this.blob.get(`settings/${encodeURIComponent(ownerKey)}.json`, { consistency: "strong" });
  }
  async set(ownerKey, settings) {
    const written = JSON.parse(JSON.stringify(settings));
    await this.blob.put(`settings/${encodeURIComponent(ownerKey)}.json`, written);
    return written;
  }
};

// src/storage/jobRepository.ts
var MAX_CLAIM_RETRIES = 8;
var MAX_JOB_ATTEMPTS = 3;
var JOB_LEASE_MS = 2 * 60 * 1e3;
var BlobGenerationJobRepository = class {
  constructor(blob) {
    this.blob = blob;
  }
  async begin(input) {
    for (let turn = 0; turn < MAX_CLAIM_RETRIES; turn += 1) {
      const latest = await this.readLatestState(input.ownerKey, input.jobId);
      if (latest !== null) {
        if (latest.job.status === "completed") return { type: "existing", job: latest.job };
        if (latest.job.status === "running" && (!input.retry || !leaseExpired(latest.job, input.now))) {
          return { type: "existing", job: latest.job };
        }
        if (latest.job.status === "failed" && !input.retry) return { type: "existing", job: latest.job };
        if (latest.job.attempt >= MAX_JOB_ATTEMPTS) {
          if (latest.job.status === "running") {
            const exhausted = await this.finish(input.ownerKey, input.jobId, latest.job.attempt, latest.claim.leaseToken, {
              status: "failed",
              errorCode: "JOB_ATTEMPT_LIMIT",
              retryable: false,
              now: input.now
            });
            return { type: "existing", job: exhausted };
          }
          return { type: "existing", job: latest.job };
        }
      }
      const attempt = (latest?.job.attempt ?? 0) + 1;
      const claim = {
        jobId: input.jobId,
        ownerKey: input.ownerKey,
        clientRequestIdHash: input.clientRequestIdHash,
        assessmentId: input.assessmentId,
        leaseToken: input.leaseToken,
        attempt,
        revision: 1,
        status: "running",
        errorCode: null,
        retryable: false,
        quotaReserved: latest?.job.quotaReserved ?? false,
        leaseUntil: new Date(new Date(input.now).getTime() + JOB_LEASE_MS).toISOString(),
        createdAt: input.now,
        updatedAt: input.now
      };
      try {
        await this.blob.put(this.claimKey(input.ownerKey, input.jobId, attempt), claim, { onlyIfNew: true });
        return { type: "claimed", job: publicJob(claim) };
      } catch (error) {
        if (!(error instanceof BlobPreconditionFailedError)) throw error;
      }
    }
    throw new Error("JOB_CLAIM_CONFLICT");
  }
  async get(ownerKey, jobId) {
    return (await this.readLatestState(ownerKey, jobId))?.job ?? null;
  }
  async markQuotaReserved(ownerKey, jobId, attempt, leaseToken, now) {
    const existing = await this.blob.get(this.quotaMarkerKey(ownerKey, jobId), { consistency: "strong" });
    if (existing === null) {
      const latest = await this.readLatestState(ownerKey, jobId);
      if (latest === null || latest.job.attempt !== attempt || latest.job.status !== "running" || latest.claim.leaseToken !== leaseToken) throw new Error("JOB_LEASE_CONFLICT");
      try {
        await this.blob.put(this.quotaMarkerKey(ownerKey, jobId), { jobId, attempt, reservedAt: now }, { onlyIfNew: true });
      } catch (error) {
        if (!(error instanceof BlobPreconditionFailedError)) throw error;
      }
    }
    const updated = await this.get(ownerKey, jobId);
    if (updated === null) throw new Error("JOB_CLAIM_MISSING");
    return updated;
  }
  async complete(ownerKey, jobId, attempt, leaseToken, now) {
    return await this.finish(ownerKey, jobId, attempt, leaseToken, {
      status: "completed",
      errorCode: null,
      retryable: false,
      now
    });
  }
  async fail(ownerKey, jobId, attempt, leaseToken, errorCode, retryable, now) {
    return await this.finish(ownerKey, jobId, attempt, leaseToken, {
      status: "failed",
      errorCode,
      retryable: retryable && attempt < MAX_JOB_ATTEMPTS,
      now
    });
  }
  async recoverCompleted(ownerKey, jobId, attempt, now) {
    const claim = await this.blob.get(this.claimKey(ownerKey, jobId, attempt), { consistency: "strong" });
    if (claim === null) throw new Error("JOB_CLAIM_MISSING");
    return await this.finish(ownerKey, jobId, attempt, claim.leaseToken, {
      status: "completed",
      errorCode: null,
      retryable: false,
      now
    });
  }
  async finish(ownerKey, jobId, attempt, leaseToken, result) {
    const existing = await this.blob.get(this.resultKey(ownerKey, jobId, attempt), { consistency: "strong" });
    if (existing !== null) return await this.withQuota(ownerKey, jobId, existing);
    const claim = await this.blob.get(this.claimKey(ownerKey, jobId, attempt), { consistency: "strong" });
    if (claim === null || claim.leaseToken !== leaseToken) throw new Error("JOB_LEASE_CONFLICT");
    const finished = {
      ...publicJob(claim),
      revision: 2,
      status: result.status,
      errorCode: result.errorCode,
      retryable: result.retryable,
      leaseUntil: null,
      updatedAt: result.now
    };
    try {
      await this.blob.put(this.resultKey(ownerKey, jobId, attempt), finished, { onlyIfNew: true });
      return await this.withQuota(ownerKey, jobId, finished);
    } catch (error) {
      if (!(error instanceof BlobPreconditionFailedError)) throw error;
      const winner = await this.blob.get(this.resultKey(ownerKey, jobId, attempt), { consistency: "strong" });
      if (winner === null) throw new Error("JOB_RESULT_CONFLICT");
      return await this.withQuota(ownerKey, jobId, winner);
    }
  }
  async readLatestState(ownerKey, jobId) {
    const prefix = `${this.baseKey(ownerKey, jobId)}/attempts/`;
    const keys = (await this.blob.list(prefix, { consistency: "strong", limit: 64 })).blobs;
    const attempts = keys.map((key) => Number(/\/attempts\/(\d{4})\/claim\.json$/.exec(key)?.[1])).filter((attempt2) => Number.isInteger(attempt2) && attempt2 > 0);
    if (attempts.length === 0) return null;
    const attempt = Math.max(...attempts);
    const claim = await this.blob.get(this.claimKey(ownerKey, jobId, attempt), { consistency: "strong" });
    if (claim === null) return null;
    const result = await this.blob.get(this.resultKey(ownerKey, jobId, attempt), { consistency: "strong" });
    return { job: await this.withQuota(ownerKey, jobId, result ?? claim), claim };
  }
  async withQuota(ownerKey, jobId, record) {
    const marker = await this.blob.get(this.quotaMarkerKey(ownerKey, jobId), { consistency: "strong" });
    return publicJob(record, marker !== null);
  }
  baseKey(ownerKey, jobId) {
    return `jobs/${encodeURIComponent(ownerKey)}/${encodeURIComponent(jobId)}`;
  }
  claimKey(ownerKey, jobId, attempt) {
    return `${this.baseKey(ownerKey, jobId)}/attempts/${String(attempt).padStart(4, "0")}/claim.json`;
  }
  resultKey(ownerKey, jobId, attempt) {
    return `${this.baseKey(ownerKey, jobId)}/attempts/${String(attempt).padStart(4, "0")}/result.json`;
  }
  quotaMarkerKey(ownerKey, jobId) {
    return `${this.baseKey(ownerKey, jobId)}/quota-reserved.json`;
  }
};
function leaseExpired(job, now) {
  const leaseUntil = job.leaseUntil ?? job.updatedAt;
  return new Date(leaseUntil).getTime() <= new Date(now).getTime();
}
function publicJob(record, quotaReserved = record.quotaReserved === true) {
  const {
    jobId,
    ownerKey,
    clientRequestIdHash,
    assessmentId,
    attempt,
    revision,
    status,
    errorCode,
    retryable,
    createdAt,
    updatedAt
  } = record;
  const leaseUntil = status === "running" && typeof record.leaseUntil === "string" ? record.leaseUntil : null;
  return {
    jobId,
    ownerKey,
    clientRequestIdHash,
    assessmentId,
    attempt,
    revision,
    status,
    errorCode,
    retryable,
    quotaReserved,
    leaseUntil,
    createdAt,
    updatedAt
  };
}

// src/storage/edgeOneStores.ts
function createEdgeOneStores(blob, options) {
  return {
    assessments: new BlobAssessmentRepository(blob, options),
    settings: new BlobSettingsRepository(blob),
    quota: new BlobQuotaRepository(blob),
    reports: new BlobReportRepository(blob, {
      now: options.now,
      ...options.reportRetentionDays === void 0 ? {} : { retentionDays: options.reportRetentionDays },
      ...options.cleanupLimit === void 0 ? {} : { cleanupLimit: options.cleanupLimit }
    }),
    jobs: new BlobGenerationJobRepository(blob)
  };
}

// src/moderation/wechatAccessToken.ts
var import_node_crypto3 = require("node:crypto");
var TOKEN_EXPIRY_MARGIN_MS = 5 * 60 * 1e3;
var TOKEN_REQUEST_TIMEOUT_MS = 8e3;
var TOKEN_REFRESH_BUDGET_MS = 1e4;
var REFRESH_LOCK_LEASE_MS = 12e3;
var REFRESH_POLL_MS = 50;
var MAX_LOCK_REVISION = 999999999999;
var refreshFlightsByScope = /* @__PURE__ */ new WeakMap();
async function getWeChatAccessToken(dependencies, deadline) {
  if (!dependencies.appId || !dependencies.appSecret) throw new ApiError("CONFIGURATION_ERROR", 503, false);
  const appId = dependencies.appId;
  const appSecret = dependencies.appSecret;
  let cached;
  try {
    cached = await readLatestAccessToken(dependencies.blob, appId, dependencies.now(), deadline);
  } catch {
    throw backendUnavailable2();
  }
  if (isUsable(cached, dependencies.now())) return cached.accessToken;
  const flightKey = appId;
  const refreshFlights = flightsFor(dependencies.blob);
  const existingFlight = refreshFlights.get(flightKey);
  if (existingFlight !== void 0) return await awaitInfrastructure(existingFlight, deadline);
  const internalDeadline = createDeadline(TOKEN_REFRESH_BUDGET_MS);
  const refresh = refreshAcrossInstances(dependencies, appId, appSecret, internalDeadline);
  let flight;
  flight = refresh.then(
    (value) => {
      if (refreshFlights.get(flightKey) === flight) refreshFlights.delete(flightKey);
      return value;
    },
    (error) => {
      if (refreshFlights.get(flightKey) === flight) refreshFlights.delete(flightKey);
      throw error;
    }
  );
  refreshFlights.set(flightKey, flight);
  return await awaitInfrastructure(flight, deadline);
}
function flightsFor(blob) {
  const scope = blob.coordinationKey ?? blob;
  const existing = refreshFlightsByScope.get(scope);
  if (existing !== void 0) return existing;
  const created = /* @__PURE__ */ new Map();
  refreshFlightsByScope.set(scope, created);
  return created;
}
async function refreshAcrossInstances(dependencies, appId, appSecret, deadline) {
  while (remainingMilliseconds(deadline) > 0) {
    const cached = await readLatestAccessToken(dependencies.blob, appId, dependencies.now(), deadline);
    if (isUsable(cached, dependencies.now())) return cached.accessToken;
    const currentLock = await readLatestRefreshLock(dependencies.blob, appId, dependencies.now(), deadline);
    if (currentLock !== null && isActiveLock(currentLock.lock, dependencies.now())) {
      await waitForRefresh(deadline);
      continue;
    }
    const now = dependencies.now();
    const revision = (currentLock?.lock.revision ?? 0) + 1;
    if (revision > MAX_LOCK_REVISION) throw backendUnavailable2();
    const lockKey = refreshLockKey(appId, revision, now);
    const ownerToken = (0, import_node_crypto3.randomUUID)();
    const claimedLock = {
      revision,
      ownerToken,
      leaseUntil: new Date(now.getTime() + REFRESH_LOCK_LEASE_MS).toISOString(),
      updatedAt: now.toISOString()
    };
    try {
      await awaitInfrastructure(dependencies.blob.put(lockKey, claimedLock, { onlyIfNew: true }), deadline);
    } catch (error) {
      if (isPreconditionFailure3(error)) {
        await waitForRefresh(deadline);
        continue;
      }
      throw error;
    }
    if (currentLock !== null) void dependencies.blob.delete(currentLock.key).catch(() => void 0);
    const afterClaim = await readLatestAccessToken(dependencies.blob, appId, dependencies.now(), deadline);
    if (isUsable(afterClaim, dependencies.now())) return afterClaim.accessToken;
    return await refreshAccessToken(dependencies, appId, appSecret, claimedLock, deadline);
  }
  throw backendUnavailable2();
}
async function refreshAccessToken(dependencies, appId, appSecret, lock, deadline) {
  let response;
  const controller = new AbortController();
  const timeoutMs = operationTimeout(deadline, TOKEN_REQUEST_TIMEOUT_MS);
  if (timeoutMs <= 0) throw backendUnavailable2();
  let timeout;
  const expiry = new Promise((_resolve, reject) => {
    timeout = setTimeout(() => {
      controller.abort();
      reject(backendUnavailable2());
    }, timeoutMs);
  });
  try {
    const url = new URL("https://api.weixin.qq.com/cgi-bin/token");
    url.searchParams.set("grant_type", "client_credential");
    url.searchParams.set("appid", appId);
    url.searchParams.set("secret", appSecret);
    response = await Promise.race([
      dependencies.fetch(url.toString(), { signal: controller.signal }),
      expiry
    ]);
  } catch {
    throw backendUnavailable2();
  } finally {
    if (timeout !== void 0) clearTimeout(timeout);
  }
  if (!response.ok) {
    cancelUnreadBody2(response);
    throw backendUnavailable2();
  }
  let payload;
  try {
    payload = await readJsonResponse(response, deadline, TOKEN_REQUEST_TIMEOUT_MS);
  } catch {
    throw backendUnavailable2();
  }
  if (!isRecord4(payload) || typeof payload.access_token !== "string" || payload.access_token.length === 0 || typeof payload.expires_in !== "number" || !Number.isFinite(payload.expires_in) || payload.expires_in <= 0) {
    throw backendUnavailable2();
  }
  const expiresAt = new Date(dependencies.now().getTime() + payload.expires_in * 1e3);
  try {
    await awaitInfrastructure(
      dependencies.blob.put(tokenCacheKey(appId, lock.revision, lock.updatedAt), {
        revision: lock.revision,
        accessToken: payload.access_token,
        issuedAt: lock.updatedAt,
        expiresAt: expiresAt.toISOString()
      }, { onlyIfNew: true }),
      deadline
    );
    void pruneOlderTokens(dependencies.blob, appId, lock.revision, lock.updatedAt).catch(() => void 0);
  } catch {
    throw backendUnavailable2();
  }
  return payload.access_token;
}
function isUsable(value, now) {
  return value !== null && typeof value.accessToken === "string" && Number.isFinite(new Date(value.expiresAt).getTime()) && new Date(value.expiresAt).getTime() - now.getTime() > TOKEN_EXPIRY_MARGIN_MS;
}
function legacyTokenCacheKey(appId) {
  const digest = (0, import_node_crypto3.createHash)("sha256").update(appId, "utf8").digest("hex").slice(0, 24);
  return `moderation/wechat-access-token/${digest}.json`;
}
function tokenCachePrefix(appId, utcDay) {
  const digest = (0, import_node_crypto3.createHash)("sha256").update(appId, "utf8").digest("hex").slice(0, 24);
  return `moderation/wechat-access-token/${digest}.tokens/${utcDay}/`;
}
function tokenCacheKey(appId, revision, issuedAt) {
  const inverse = MAX_LOCK_REVISION - revision;
  return `${tokenCachePrefix(appId, issuedAt.slice(0, 10))}${String(inverse).padStart(12, "0")}.json`;
}
async function readLatestAccessToken(blob, appId, now, deadline) {
  const listings = await awaitInfrastructure(Promise.all(currentAndPreviousUtcDays(now).map(async (utcDay) => await blob.list(tokenCachePrefix(appId, utcDay), { consistency: "strong" }))), deadline);
  const keys = listings.flatMap((listing) => listing.blobs);
  const candidates = await awaitInfrastructure(Promise.all(keys.map(async (key) => await blob.get(key, { consistency: "strong" }))), deadline);
  const valid = candidates.filter((value) => isStoredAccessToken(value));
  valid.sort((left, right) => new Date(right.issuedAt).getTime() - new Date(left.issuedAt).getTime() || right.revision - left.revision);
  if (valid[0] !== void 0) return valid[0];
  return await awaitInfrastructure(
    blob.get(legacyTokenCacheKey(appId), { consistency: "strong" }),
    deadline
  );
}
function isStoredAccessToken(value) {
  return value !== null && Number.isInteger(value.revision) && value.revision > 0 && typeof value.accessToken === "string" && value.accessToken.length > 0 && Number.isFinite(new Date(value.issuedAt).getTime()) && Number.isFinite(new Date(value.expiresAt).getTime());
}
async function pruneOlderTokens(blob, appId, keepRevision, issuedAt) {
  const listing = await blob.list(tokenCachePrefix(appId, issuedAt.slice(0, 10)), { consistency: "strong" });
  await Promise.all(listing.blobs.map(async (key) => {
    const inverse = Number(/\/(\d{12})\.json$/.exec(key)?.[1]);
    const revision = MAX_LOCK_REVISION - inverse;
    if (Number.isInteger(revision) && revision < keepRevision) await blob.delete(key);
  }));
}
function refreshLockPrefix(appId, utcDay) {
  const digest = (0, import_node_crypto3.createHash)("sha256").update(appId, "utf8").digest("hex").slice(0, 24);
  return `moderation/wechat-access-token/${digest}.refresh-locks/${utcDay}/`;
}
function refreshLockKey(appId, revision, now) {
  const inverse = MAX_LOCK_REVISION - revision;
  return `${refreshLockPrefix(appId, now.toISOString().slice(0, 10))}${String(inverse).padStart(12, "0")}.json`;
}
async function readLatestRefreshLock(blob, appId, now, deadline) {
  const listings = await awaitInfrastructure(Promise.all(currentAndPreviousUtcDays(now).map(async (utcDay) => await blob.list(refreshLockPrefix(appId, utcDay), { consistency: "strong" }))), deadline);
  const keys = listings.flatMap((listing) => listing.blobs);
  const states = await awaitInfrastructure(Promise.all(keys.map(async (key) => ({
    key,
    lock: await blob.get(key, { consistency: "strong" })
  }))), deadline);
  const valid = states.filter((state) => state.lock !== null && Number.isInteger(state.lock.revision) && state.lock.revision > 0);
  valid.sort((left, right) => new Date(right.lock.updatedAt).getTime() - new Date(left.lock.updatedAt).getTime() || right.lock.revision - left.lock.revision);
  return valid[0] ?? null;
}
function currentAndPreviousUtcDays(now) {
  return [
    now.toISOString().slice(0, 10),
    new Date(now.getTime() - 864e5).toISOString().slice(0, 10)
  ];
}
function isActiveLock(value, now) {
  return value !== null && typeof value.ownerToken === "string" && typeof value.leaseUntil === "string" && Number.isFinite(new Date(value.leaseUntil).getTime()) && new Date(value.leaseUntil).getTime() > now.getTime();
}
async function waitForRefresh(deadline) {
  const delay = Math.min(REFRESH_POLL_MS, remainingMilliseconds(deadline));
  if (delay <= 0) throw backendUnavailable2();
  await awaitInfrastructure(new Promise((resolve) => setTimeout(resolve, delay)), deadline);
}
function operationTimeout(deadline, maximum) {
  return deadline === void 0 ? maximum : Math.min(maximum, remainingMilliseconds(deadline));
}
async function awaitInfrastructure(operation, deadline) {
  try {
    return deadline === void 0 ? await operation : await withinDeadline(operation, deadline);
  } catch (error) {
    if (isPreconditionFailure3(error)) throw error;
    throw backendUnavailable2();
  }
}
function cancelUnreadBody2(response) {
  if (response.body !== null && !response.body.locked) void response.body.cancel().catch(() => void 0);
}
async function readJsonResponse(response, deadline, maximumMs) {
  if (response.body === null) throw backendUnavailable2();
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const timeoutMs = operationTimeout(deadline, maximumMs);
      if (timeoutMs <= 0) throw backendUnavailable2();
      let timer;
      const expiry = new Promise((_resolve, reject) => {
        timer = setTimeout(() => reject(backendUnavailable2()), timeoutMs);
      });
      let result;
      try {
        result = await Promise.race([reader.read(), expiry]);
      } finally {
        if (timer !== void 0) clearTimeout(timer);
      }
      if (result.done) break;
      if (result.value === void 0) continue;
      total += result.value.byteLength;
      if (total > 64 * 1024) throw backendUnavailable2();
      chunks.push(result.value);
    }
  } catch (error) {
    void reader.cancel().catch(() => void 0);
    throw error;
  } finally {
    reader.releaseLock();
  }
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder().decode(body));
}
function backendUnavailable2() {
  return new ApiError("BACKEND_UNAVAILABLE", 503, true);
}
function isRecord4(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isPreconditionFailure3(error) {
  return error instanceof BlobPreconditionFailedError || isRecord4(error) && error.code === "BLOB_PRECONDITION_FAILED";
}

// src/moderation/wechatTextSecurity.ts
var MAX_CHUNK_BYTES = 2500;
var MODERATION_TIMEOUT_MS = 1e4;
function createWeChatTextSecurity(dependencies) {
  return {
    async checkText(content, openId, deadline) {
      if (typeof content !== "string" || content.trim().length === 0) throw blocked();
      if (typeof openId !== "string" || openId.length === 0) throw backendUnavailable3();
      const token = await getWeChatAccessToken(dependencies, deadline);
      const chunks = splitUtf8(content, MAX_CHUNK_BYTES);
      let cursor = 0;
      const results = await Promise.allSettled(Array.from({ length: Math.min(3, chunks.length) }, async () => {
        while (cursor < chunks.length) {
          const chunk = chunks[cursor++];
          if (chunk !== void 0) await moderateChunk(chunk, openId, token, dependencies.fetch, deadline);
        }
      }));
      const rejected = results.find((result) => result.status === "rejected");
      if (rejected !== void 0) throw rejected.reason;
    }
  };
}
async function moderateChunk(content, openId, token, fetchPort, deadline) {
  const controller = new AbortController();
  const timeoutMs = deadline === void 0 ? MODERATION_TIMEOUT_MS : Math.min(MODERATION_TIMEOUT_MS, remainingMilliseconds(deadline));
  if (timeoutMs <= 0) throw backendUnavailable3();
  let timeout;
  const expiry = new Promise((_resolve, reject) => {
    timeout = setTimeout(() => {
      controller.abort();
      reject(backendUnavailable3());
    }, timeoutMs);
  });
  try {
    const url = new URL("https://api.weixin.qq.com/wxa/msg_sec_check");
    url.searchParams.set("access_token", token);
    const response = await Promise.race([
      fetchPort(url.toString(), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ content, version: 2, scene: 2, openid: openId }),
        signal: controller.signal
      }),
      expiry
    ]);
    if (!response.ok) {
      cancelUnreadBody3(response);
      throw backendUnavailable3();
    }
    let payload;
    try {
      payload = await readJsonResponse(response, deadline, MODERATION_TIMEOUT_MS);
    } catch {
      throw backendUnavailable3();
    }
    if (!isRecord5(payload) || payload.errcode !== 0 || !isRecord5(payload.result) || typeof payload.result.suggest !== "string") {
      throw backendUnavailable3();
    }
    if (payload.result.suggest !== "pass") throw blocked();
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw backendUnavailable3();
  } finally {
    if (timeout !== void 0) clearTimeout(timeout);
  }
}
function cancelUnreadBody3(response) {
  if (response.body !== null && !response.body.locked) void response.body.cancel().catch(() => void 0);
}
function splitUtf8(value, maxBytes) {
  const chunks = [];
  let current = "";
  let bytes = 0;
  for (const character of value) {
    const characterBytes = Buffer.byteLength(character, "utf8");
    if (bytes + characterBytes > maxBytes && current.length > 0) {
      chunks.push(current);
      current = "";
      bytes = 0;
    }
    current += character;
    bytes += characterBytes;
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}
function blocked() {
  return new ApiError("CONTENT_BLOCKED", 422, false);
}
function backendUnavailable3() {
  return new ApiError("BACKEND_UNAVAILABLE", 503, true);
}
function isRecord5(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// src/routes/support.ts
var MAX_REQUEST_BYTES = 64 * 1024;
async function readJsonObject(request, deadline) {
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_REQUEST_BYTES) throw invalidRequest();
  let text;
  try {
    text = deadline === void 0 ? await request.text() : await readRequestBody(request, deadline);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw invalidRequest();
  }
  if (Buffer.byteLength(text, "utf8") > MAX_REQUEST_BYTES) throw invalidRequest();
  try {
    const parsed = JSON.parse(text);
    if (!isRecord6(parsed)) throw invalidRequest();
    return parsed;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw invalidRequest();
  }
}
async function readRequestBody(request, deadline) {
  if (request.body === null) return "";
  const reader = request.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const remaining = remainingMilliseconds(deadline);
      if (remaining <= 0) throw requestTimeout();
      let timeout;
      const expiry = new Promise((_resolve, reject) => {
        timeout = setTimeout(() => reject(requestTimeout()), remaining);
      });
      let result;
      try {
        result = await Promise.race([reader.read(), expiry]);
      } finally {
        if (timeout !== void 0) clearTimeout(timeout);
      }
      if (result.done) break;
      if (result.value === void 0) continue;
      total += result.value.byteLength;
      if (total > MAX_REQUEST_BYTES) throw invalidRequest();
      chunks.push(result.value);
    }
    const joined = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      joined.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return new TextDecoder().decode(joined);
  } catch (error) {
    void reader.cancel().catch(() => void 0);
    throw error;
  } finally {
    reader.releaseLock();
  }
}
function routeFailure(error) {
  if (error instanceof ApiError) return failure(error.code, error.retryable, error.status);
  return failure("INTERNAL_ERROR", true, 500);
}
function invalidRequest() {
  return new ApiError("INVALID_REQUEST", 400, false);
}
function methodNotAllowed() {
  return new ApiError("METHOD_NOT_ALLOWED", 405, false);
}
function nonEmptyString(value, maximum = 1e4) {
  if (typeof value !== "string") throw invalidRequest();
  const normalized = value.trim();
  if (normalized.length === 0 || normalized.length > maximum) throw invalidRequest();
  return normalized;
}
function isRecord6(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// src/routes/generation.ts
async function createGenerationRoute(request, context, injected) {
  const deadline = createDeadline(115e3);
  try {
    const identity = await withinDeadline(
      requireSession(request, sessionDependenciesFromEnvironment(context.blob, context.env)),
      deadline
    );
    if (request.method !== "POST") throw methodNotAllowed();
    const dependencies = injected ?? defaultDependencies(context);
    const body = await readJsonObject(request, deadline);
    const topic = nonEmptyString(body.topic, 500);
    const notes = body.notes === void 0 ? void 0 : nonEmptyString(body.notes, 4e3);
    const clientRequestId = body.clientRequestId === void 0 ? void 0 : nonEmptyString(body.clientRequestId, 128);
    if (body.retry !== void 0 && typeof body.retry !== "boolean") throw invalidRequest();
    const retry = body.retry === true;
    const policyVersion = context.env.PRIVACY_POLICY_VERSION ?? "2026-08-10";
    const settings = await withinDeadline(dependencies.stores.settings.get(identity.ownerKey), deadline);
    if (settings?.privacyPolicyVersion !== policyVersion || typeof settings.privacyConsentAt !== "string") {
      return routeFailure(new ApiError("PRIVACY_CONSENT_REQUIRED", 403, false));
    }
    const identityKey = clientRequestId ?? (0, import_node_crypto4.randomUUID)();
    const digest = (0, import_node_crypto4.createHash)("sha256").update(`${identity.ownerKey}\0${identityKey}`, "utf8").digest("hex").slice(0, 32);
    const assessmentId = `assessment-${digest}`;
    const jobId = `job-${digest}`;
    const leaseToken = (0, import_node_crypto4.randomUUID)();
    const begun = await withinDeadline(dependencies.stores.jobs.begin({
      ownerKey: identity.ownerKey,
      jobId,
      clientRequestIdHash: (0, import_node_crypto4.createHash)("sha256").update(identityKey, "utf8").digest("hex"),
      assessmentId,
      leaseToken,
      now: dependencies.now().toISOString(),
      retry
    }), deadline);
    if (begun.job.status === "running") {
      const assessment = await withinDeadline(dependencies.stores.assessments.get(identity.ownerKey, assessmentId), deadline);
      if (assessment !== null) {
        const recovered = await withinDeadline(dependencies.stores.jobs.recoverCompleted(
          identity.ownerKey,
          jobId,
          begun.job.attempt,
          dependencies.now().toISOString()
        ), deadline);
        return success(jobEnvelope(recovered));
      }
    }
    if (begun.type === "existing") {
      return success(jobEnvelope(begun.job), begun.job.status === "running" ? 202 : 200);
    }
    try {
      if (!begun.job.quotaReserved) {
        const quota = await withinDeadline(dependencies.stores.quota.reserve(
          identity.ownerKey,
          dependencies.now(),
          context.env.GENERATION_ENABLED === "true",
          jobId
        ), deadline);
        const quotaCode = quotaErrorCode(quota);
        if (quotaCode !== null) {
          const status = quotaCode === "FREE_TIER_LIMIT" ? 429 : 503;
          throw new ApiError(quotaCode, status, quotaCode === "FREE_TIER_LIMIT");
        }
        await withinDeadline(dependencies.stores.jobs.markQuotaReserved(
          identity.ownerKey,
          jobId,
          begun.job.attempt,
          leaseToken,
          dependencies.now().toISOString()
        ), deadline);
      }
      await withinDeadline(dependencies.generate({
        ownerKey: identity.ownerKey,
        openId: identity.openId,
        assessmentId,
        topic,
        ...notes === void 0 ? {} : { notes }
      }, deadline), deadline);
      const completed = await withinDeadline(dependencies.stores.jobs.complete(
        identity.ownerKey,
        jobId,
        begun.job.attempt,
        leaseToken,
        dependencies.now().toISOString()
      ), deadline);
      return success(jobEnvelope(completed), 201);
    } catch (error) {
      const apiError = error instanceof ApiError ? error : new ApiError("INTERNAL_ERROR", 500, true);
      await bestEffortFail(dependencies, identity.ownerKey, jobId, begun.job.attempt, leaseToken, apiError);
      throw apiError;
    }
  } catch (error) {
    return routeFailure(error);
  }
}
async function bestEffortFail(dependencies, ownerKey, jobId, attempt, leaseToken, error) {
  const failureDeadline = createDeadline(2e3);
  try {
    await withinDeadline(dependencies.stores.jobs.fail(
      ownerKey,
      jobId,
      attempt,
      leaseToken,
      error.code,
      error.retryable,
      dependencies.now().toISOString()
    ), failureDeadline);
  } catch {
  }
}
function defaultDependencies(context) {
  const now = () => /* @__PURE__ */ new Date();
  const stores = createEdgeOneStores(context.blob, { now });
  const security = createWeChatTextSecurity({
    blob: context.blob,
    appId: context.env.WECHAT_APP_ID,
    appSecret: context.env.WECHAT_APP_SECRET,
    fetch: async (url, init) => await fetch(url, init),
    now
  });
  return {
    stores,
    now,
    generate: async (input, deadline) => await generateFiftyQuestionAssessment(input, {
      complete: async (completionInput, operationDeadline) => await requestOpenAICompletion(completionInput, {
        baseUrl: context.env.LLM_BASE_URL,
        apiKey: context.env.LLM_API_KEY,
        model: context.env.LLM_MODEL,
        ...operationDeadline === void 0 ? {} : { deadline: operationDeadline }
      }),
      checkText: security.checkText,
      createIfAbsent: async (record) => await stores.assessments.createIfAbsent(record),
      now
    }, deadline)
  };
}
function jobEnvelope(job) {
  return {
    jobId: job.jobId,
    status: job.status,
    progress: job.status === "completed" ? 100 : job.status === "running" ? 10 : 0,
    retryable: job.retryable,
    assessmentId: job.assessmentId,
    attempt: job.attempt,
    ...job.errorCode === null ? {} : { errorCode: job.errorCode }
  };
}

// node-functions/api/generation.ts
async function onRequest({ request, env }) {
  return await createGenerationRoute(request, createEdgeOneContext(request, env));
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  onRequest
});
