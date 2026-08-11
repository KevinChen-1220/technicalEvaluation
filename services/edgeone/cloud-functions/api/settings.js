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

// node-functions/api/settings.ts
var settings_exports = {};
__export(settings_exports, {
  onRequest: () => onRequest
});
module.exports = __toCommonJS(settings_exports);

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
        return "allowed";
      } catch (error) {
        if (isPreconditionFailure2(error)) continue;
        throw error;
      }
    }
    return "rate_limited";
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
  const revisions = keys.map((key) => Number(/\/(\d{12})\.json$/.exec(key)?.[1])).map((inverse) => MAX_REVISION - inverse).filter((revision) => Number.isInteger(revision) && revision > 0);
  return revisions.length === 0 ? null : Math.max(...revisions);
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

// src/http/deadline.ts
function remainingMilliseconds(deadline) {
  return Math.max(0, deadline.expiresAt - deadline.now());
}
function requestTimeout() {
  return new ApiError("REQUEST_TIMEOUT", 504, true);
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
    if (!isRecord(parsed)) throw invalidRequest();
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
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// src/routes/settings.ts
async function createSettingsRoute(request, context, injected) {
  try {
    const identity = await requireSession(request, sessionDependenciesFromEnvironment(context.blob, context.env));
    const dependencies = injected ?? defaultDependencies(context);
    const currentVersion = context.env.PRIVACY_POLICY_VERSION ?? "2026-08-10";
    if (request.method === "GET") {
      const stored = await dependencies.stores.settings.get(identity.ownerKey);
      return stored === null ? success({ type: "not_found", errorCode: "INVALID_REQUEST" }) : success({ type: "found", settings: publicSettings(stored, currentVersion) });
    }
    if (request.method === "PUT") {
      const body = await readJsonObject(request);
      const policyVersion = nonEmptyString(body.privacyPolicyVersion, 40);
      if (policyVersion !== currentVersion) throw invalidRequest();
      const stored = {
        privacyPolicyVersion: currentVersion,
        privacyConsentAt: dependencies.now().toISOString()
      };
      await dependencies.stores.settings.set(identity.ownerKey, stored);
      return success({ type: "accepted", settings: publicSettings(stored, currentVersion) });
    }
    throw methodNotAllowed();
  } catch (error) {
    return routeFailure(error);
  }
}
function publicSettings(stored, currentVersion) {
  const privacyPolicyVersion = typeof stored.privacyPolicyVersion === "string" ? stored.privacyPolicyVersion : currentVersion;
  const privacyConsentAt = typeof stored.privacyConsentAt === "string" ? stored.privacyConsentAt : null;
  return {
    privacyPolicyVersion,
    privacyConsentAt,
    hasCurrentPrivacyConsent: privacyPolicyVersion === currentVersion && privacyConsentAt !== null
  };
}
function defaultDependencies(context) {
  const now = () => /* @__PURE__ */ new Date();
  return { stores: createEdgeOneStores(context.blob, { now }), now };
}

// node-functions/api/settings.ts
async function onRequest({ request, env }) {
  return await createSettingsRoute(request, createEdgeOneContext(request, env));
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  onRequest
});
