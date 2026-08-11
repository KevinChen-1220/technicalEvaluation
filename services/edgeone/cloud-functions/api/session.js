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

// node-functions/api/session.ts
var session_exports = {};
__export(session_exports, {
  onRequest: () => onRequest
});
module.exports = __toCommonJS(session_exports);

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
function createEdgeOneContext(request, env) {
  return {
    request,
    env,
    blob: createBlobPort((0, import_pages_blob.getStore)("skillscope"))
  };
}
function createBlobPort(store) {
  return {
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
        directories: true,
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

// src/http/envelope.ts
function success(data, status = 200) {
  return json({ ok: true, data }, status);
}
function failure(code, retryable, status) {
  return json({ ok: false, error: { code, retryable } }, status);
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

// src/auth/wechatSession.ts
var WECHAT_SESSION_URL = "https://api.weixin.qq.com/sns/jscode2session";
async function exchangeWeChatCode(code, env, fetch2) {
  const appId = env.WECHAT_APP_ID;
  const appSecret = env.WECHAT_APP_SECRET;
  if (!code.trim()) throw new ApiError("INVALID_REQUEST", 400);
  if (!appId || !appSecret) throw new ApiError("SERVICE_UNAVAILABLE", 503, true);
  const endpoint = new URL(WECHAT_SESSION_URL);
  if (endpoint.protocol !== "https:" || endpoint.hostname !== "api.weixin.qq.com") {
    throw new ApiError("SERVICE_UNAVAILABLE", 503, true);
  }
  endpoint.search = new URLSearchParams({
    appid: appId,
    secret: appSecret,
    js_code: code.trim(),
    grant_type: "authorization_code"
  }).toString();
  let response;
  try {
    response = await fetch2(endpoint.toString());
  } catch {
    throw new ApiError("WECHAT_SESSION_EXCHANGE_FAILED", 502, true);
  }
  if (!response.ok) throw new ApiError("WECHAT_SESSION_EXCHANGE_FAILED", 502, true);
  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new ApiError("WECHAT_SESSION_EXCHANGE_FAILED", 502, true);
  }
  if (typeof payload.openid !== "string" || !payload.openid) {
    throw new ApiError("WECHAT_SESSION_EXCHANGE_FAILED", 502, true);
  }
  return { openId: payload.openid };
}

// src/auth/sessionToken.ts
var import_node_crypto2 = require("node:crypto");

// src/auth/ownerKey.ts
var import_node_crypto = require("node:crypto");
function deriveOwnerKey(openId, ownerHmacKey) {
  return (0, import_node_crypto.createHmac)("sha256", ownerHmacKey).update(openId, "utf8").digest("hex");
}

// src/auth/sessionToken.ts
var SESSION_LIFETIME_MS = 7 * 24 * 60 * 60 * 1e3;
async function issueSession(openId, dependencies) {
  const keys = requireSessionKeys(dependencies);
  if (!openId) throw new ApiError("INVALID_REQUEST", 400);
  const token = Buffer.from((dependencies.randomBytes ?? import_node_crypto2.randomBytes)(32)).toString("base64url");
  const tokenHash = hashToken(token);
  const now = (dependencies.now ?? (() => /* @__PURE__ */ new Date()))();
  const expiresAt = new Date(now.getTime() + SESSION_LIFETIME_MS).toISOString();
  const stored = {
    tokenHash,
    tokenProof: tokenProof(token, keys.sessionHmacKey),
    ownerKey: deriveOwnerKey(openId, keys.ownerHmacKey),
    createdAt: now.toISOString(),
    expiresAt
  };
  try {
    await dependencies.blob.put(sessionBlobKey(tokenHash), stored);
  } catch {
    throw backendUnavailable();
  }
  return { token, expiresAt };
}
function sessionDependenciesFromEnvironment(blob, env) {
  return {
    blob,
    sessionHmacKey: env.SESSION_HMAC_KEY,
    ownerHmacKey: env.OWNER_HMAC_KEY
  };
}
function requireSessionKeys(dependencies) {
  if (!dependencies.sessionHmacKey || !dependencies.ownerHmacKey) {
    throw backendUnavailable();
  }
  return { sessionHmacKey: dependencies.sessionHmacKey, ownerHmacKey: dependencies.ownerHmacKey };
}
function hashToken(token) {
  return (0, import_node_crypto2.createHash)("sha256").update(token, "utf8").digest("hex");
}
function tokenProof(token, sessionHmacKey) {
  return (0, import_node_crypto2.createHmac)("sha256", sessionHmacKey).update(token, "utf8").digest("hex");
}
function sessionBlobKey(tokenHash) {
  return `sessions/${tokenHash}.json`;
}
function backendUnavailable() {
  return new ApiError("BACKEND_UNAVAILABLE", 503, true);
}

// src/routes/session.ts
async function createSessionRoute(request, context, fetch2) {
  try {
    if (request.method !== "POST") throw new ApiError("METHOD_NOT_ALLOWED", 405);
    assertSessionEnvironment(context.env);
    const payload = await requestPayload(request);
    if (typeof payload.code !== "string") throw new ApiError("INVALID_REQUEST", 400);
    const { openId } = await exchangeWeChatCode(payload.code, context.env, fetch2);
    const session = await issueSession(openId, sessionDependenciesFromEnvironment(context.blob, context.env));
    return success(session, 201);
  } catch (error) {
    if (error instanceof ApiError) return failure(error.code, error.retryable, error.status);
    return failure("BACKEND_UNAVAILABLE", true, 503);
  }
}
function assertSessionEnvironment(env) {
  if (!env.WECHAT_APP_ID || !env.WECHAT_APP_SECRET || !env.SESSION_HMAC_KEY || !env.OWNER_HMAC_KEY) {
    throw new ApiError("BACKEND_UNAVAILABLE", 503, true);
  }
}
async function requestPayload(request) {
  try {
    return await request.json();
  } catch {
    throw new ApiError("INVALID_REQUEST", 400);
  }
}

// node-functions/api/session.ts
async function onRequest({ request, env }) {
  return createSessionRoute(request, createEdgeOneContext(request, env), async (url) => fetch(url));
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  onRequest
});
