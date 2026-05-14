"""
InvestIQ — Local Proxy Server
Handles all external API calls for the standalone dashboard, avoiding browser CORS restrictions.

Endpoints:
  POST /v1/messages          → Anthropic Claude API
  POST /api/akahu            → Akahu NZ Open Banking (ANZ, BNZ, Sharesies)
  GET  /api/market           → Yahoo Finance market data
  GET  /api/market?symbols=  → Yahoo Finance portfolio prices
  GET  /health               → Health check

Usage:
  pip install requests
  python proxy.py

Then in InvestIQ Settings set Proxy URL to: http://localhost:8080
"""

import json
import urllib.request
import urllib.parse
import urllib.error
import ssl
import sys
from http.server import BaseHTTPRequestHandler, HTTPServer
from datetime import datetime, timedelta

import os
import time
from collections import defaultdict, deque

PORT = int(os.environ.get("PORT", 8080))
HOST = "0.0.0.0"   # bind to all interfaces (required for Render/cloud hosting)
ANTHROPIC_API = "https://api.anthropic.com"
AKAHU_API     = "https://api.akahu.io/v1"

# ── SECURITY: env-controlled allowlists ────────────────────────
# ALLOWED_ORIGIN — one or more comma-separated origins, e.g.:
#   "https://investiq-nz.netlify.app,https://staging.netlify.app"
# Default '*' is open and only safe for local dev.
ALLOWED_ORIGINS = [o.strip() for o in os.environ.get("ALLOWED_ORIGIN", "*").split(",") if o.strip()]

# PROXY_SECRET — global admin override (env-set). Always accepted.
# Per-user secrets are stored in Supabase profiles.proxy_secret and validated
# via the validate_proxy_secret() RPC. Either is sufficient to authorise.
PROXY_SECRET = os.environ.get("PROXY_SECRET", "")

# Supabase config — needed for per-user secret validation
SUPABASE_URL  = os.environ.get("SUPABASE_URL", "")          # e.g. https://xxxx.supabase.co
SUPABASE_ANON = os.environ.get("SUPABASE_ANON_KEY", "")     # publishable anon key

# RATE_LIMIT — N requests per minute per IP (0 = disabled). Default 60/min.
RATE_LIMIT = int(os.environ.get("RATE_LIMIT", "60"))
_rate_buckets = defaultdict(lambda: deque(maxlen=200))

# Cache validation results for 60s — avoids hammering Supabase per request
_secret_cache = {}  # secret → (user_id_or_None, expires_at)
def validate_user_secret(secret):
    """Return user_id if secret matches an approved user, None otherwise.
    Cached for 60s to avoid roundtrip per request."""
    if not secret or not SUPABASE_URL or not SUPABASE_ANON:
        return None
    now = time.time()
    cached = _secret_cache.get(secret)
    if cached and cached[1] > now:
        return cached[0]
    try:
        # Call the SECURITY DEFINER RPC: returns user_id (uuid) or null
        url = f"{SUPABASE_URL}/rest/v1/rpc/validate_proxy_secret"
        body = json.dumps({"secret": secret}).encode()
        req = urllib.request.Request(url, data=body, method="POST", headers={
            "apikey":        SUPABASE_ANON,
            "Authorization": f"Bearer {SUPABASE_ANON}",
            "Content-Type":  "application/json",
        })
        with urllib.request.urlopen(req, context=ctx, timeout=5) as r:
            result = json.loads(r.read())
        # RPC returns the uuid as a JSON string (or null)
        user_id = result if isinstance(result, str) else None
        _secret_cache[secret] = (user_id, now + 60)
        return user_id
    except Exception as ex:
        print(f"  ⚠ validate_user_secret error: {ex}")
        return None

ctx = ssl.create_default_context()

# ── simple in-memory cache for market data (5 min TTL) ──────────
_cache = {}

def cache_get(key):
    entry = _cache.get(key)
    if entry and datetime.now() < entry['expires']:
        return entry['data']
    return None

def cache_set(key, data, ttl_seconds=300):
    _cache[key] = {'data': data, 'expires': datetime.now() + timedelta(seconds=ttl_seconds)}


class ProxyHandler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        print(f"  {fmt % args}")

    def _origin_allowed(self):
        """Return the matching allowed origin (for echoing back) or None."""
        if "*" in ALLOWED_ORIGINS:
            return "*"
        origin = self.headers.get("Origin", "")
        if origin and origin in ALLOWED_ORIGINS:
            return origin
        # If no Origin header (e.g. server-to-server), allow only with a valid secret
        return None

    def send_cors(self):
        allowed = self._origin_allowed()
        if allowed:
            self.send_header("Access-Control-Allow-Origin", allowed)
            self.send_header("Vary", "Origin")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers",
                         "Content-Type, x-api-key, anthropic-version, anthropic-beta, "
                         "X-Akahu-App-Token, X-Proxy-Secret, Authorization")
        self.send_header("Access-Control-Max-Age", "86400")

    def _client_ip(self):
        # Render / Heroku forward via X-Forwarded-For
        xff = self.headers.get("X-Forwarded-For", "")
        if xff:
            return xff.split(",")[0].strip()
        return self.client_address[0]

    def _rate_limit_ok(self):
        if RATE_LIMIT <= 0:
            return True
        ip = self._client_ip()
        bucket = _rate_buckets[ip]
        now = time.time()
        # Drop entries older than 60s
        while bucket and now - bucket[0] > 60:
            bucket.popleft()
        if len(bucket) >= RATE_LIMIT:
            return False
        bucket.append(now)
        return True

    def _check_secret(self):
        """Return True if request is authorised, False otherwise.
        Accepts EITHER:
          1. Global admin PROXY_SECRET env var (admin override)
          2. Any approved user's per-user proxy_secret (looked up in Supabase)
        Stores authenticated user_id on self for downstream logging.

        Also stores a diagnostic reason on self._auth_fail_reason so the 403
        response can tell the caller exactly why they're being rejected
        (instead of the unhelpful generic 'Forbidden').
        """
        self._auth_user_id = None
        self._auth_fail_reason = None
        incoming = self.headers.get("X-Proxy-Secret", "")
        # Dev mode — no secret configured at all
        if not PROXY_SECRET and not (SUPABASE_URL and SUPABASE_ANON):
            self._auth_user_id = "dev-mode-no-auth"
            return True
        # Global admin secret
        if PROXY_SECRET and incoming == PROXY_SECRET:
            self._auth_user_id = "admin-global"
            return True
        # Per-user secret via Supabase RPC
        if incoming and SUPABASE_URL and SUPABASE_ANON:
            uid = validate_user_secret(incoming)
            if uid:
                self._auth_user_id = uid
                return True
            self._auth_fail_reason = "rpc_reject"  # secret sent but RPC said no
            return False
        # Pinpoint the failure mode for the response body
        if not incoming:
            self._auth_fail_reason = "no_header"
        elif not (SUPABASE_URL and SUPABASE_ANON):
            self._auth_fail_reason = "proxy_supabase_misconfigured"
        else:
            self._auth_fail_reason = "unknown"
        return False

    def _forbidden(self):
        """Send a 403 with a non-sensitive diagnostic payload."""
        reason = getattr(self, "_auth_fail_reason", None) or "unknown"
        explanations = {
            "no_header":
                "Browser sent no X-Proxy-Secret header. Check that your "
                "profile.proxy_secret is set in Supabase OR that the platform "
                "PROXY_SECRET is baked into PLATFORM_CONFIG / Settings.",
            "rpc_reject":
                "X-Proxy-Secret was sent but Supabase RPC validate_proxy_secret() "
                "did not match it to any approved user. Either the secret is "
                "wrong, the profiles row is missing one, or is_approved=false.",
            "proxy_supabase_misconfigured":
                "Proxy is missing SUPABASE_URL or SUPABASE_ANON_KEY env vars on "
                "Render — per-user secret validation can't run. Set them and "
                "redeploy, or set the global PROXY_SECRET env var to match.",
            "unknown":
                "Auth rejected for an unrecognised reason. Hit /api/diag with the "
                "same X-Proxy-Secret header to see the full breakdown."
        }
        return self._json(403, {
            "error": "Forbidden — invalid or missing X-Proxy-Secret",
            "reason": reason,
            "hint":   explanations.get(reason, explanations["unknown"]),
            "diag_url": "/api/diag"
        })

    def do_OPTIONS(self):
        # Preflight always returns 204, no auth check (CORS spec requirement)
        self.send_response(204)
        self.send_cors()
        self.end_headers()

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        params = urllib.parse.parse_qs(parsed.query)

        # /health is public so keep-alive pings don't need the secret
        if parsed.path == "/health":
            self._json(200, {"status": "ok", "service": "InvestIQ Proxy"})
            return

        # /api/diag — public auth diagnostic. Returns *what the proxy received*
        # and how the secret would (or wouldn't) be authorised, without ever
        # echoing back the secret itself. Lets us debug 403s from the browser
        # without dashboard access.
        if parsed.path == "/api/diag":
            incoming = self.headers.get("X-Proxy-Secret", "")
            masked = "(none)"
            if incoming:
                if len(incoming) <= 8:
                    masked = "*" * len(incoming)
                else:
                    masked = incoming[:4] + "…" + incoming[-3:] + f" (len={len(incoming)})"
            # Run the auth path so we can report which branch would accept it.
            self._check_secret()
            return self._json(200, {
                "service": "InvestIQ Proxy diagnostic",
                "request": {
                    "origin":   self.headers.get("Origin", "(none)"),
                    "client_ip": self._client_ip(),
                    "x_proxy_secret_masked": masked,
                    "header_present": bool(incoming),
                    "header_length":  len(incoming),
                },
                "proxy_config": {
                    "PROXY_SECRET_env_set": bool(PROXY_SECRET),
                    "PROXY_SECRET_length":  len(PROXY_SECRET) if PROXY_SECRET else 0,
                    "SUPABASE_URL_set":     bool(SUPABASE_URL),
                    "SUPABASE_ANON_set":    bool(SUPABASE_ANON),
                    "allowed_origins":      ALLOWED_ORIGINS,
                    "rate_limit_per_min":   RATE_LIMIT,
                },
                "auth_outcome": {
                    "would_authorise":   self._auth_user_id is not None,
                    "matched_user_id":   self._auth_user_id,
                    "fail_reason":       self._auth_fail_reason,
                }
            })

        if not self._rate_limit_ok():
            return self._json(429, {"error": "Rate limit exceeded — try again in a minute"})
        if not self._check_secret():
            return self._forbidden()

        if parsed.path == "/api/market":
            symbols = params.get("symbols", [None])[0]
            if symbols:
                self._fetch_prices(symbols.split(","))
            else:
                self._fetch_market()
        elif parsed.path == "/api/news":
            symbols = params.get("symbols", [None])[0]
            limit_per = int(params.get("limit", ["3"])[0])
            self._fetch_news(symbols.split(",") if symbols else [], limit_per)
        elif parsed.path == "/api/search":
            q = (params.get("q", [""])[0] or "").strip()
            self._yahoo_search(q)
        else:
            self._json(404, {"error": "Not found"})

    def do_POST(self):
        if not self._rate_limit_ok():
            return self._json(429, {"error": "Rate limit exceeded — try again in a minute"})
        if not self._check_secret():
            return self._forbidden()

        # Cap request body to 2 MB to prevent abuse
        length = int(self.headers.get("Content-Length", 0))
        if length > 2_000_000:
            return self._json(413, {"error": "Request body too large (>2MB)"})
        body = self.rfile.read(length)

        if self.path.startswith("/v1/messages"):
            self._proxy_anthropic(body)
        elif self.path == "/api/akahu":
            self._proxy_akahu(body)
        elif self.path == "/api/agents":
            self._run_agents(body)
        else:
            self._json(404, {"error": "Not found"})

    # ── Anthropic proxy ──────────────────────────────────────────
    def _proxy_anthropic(self, body):
        # Use caller's key if provided, else fall back to the platform env var
        # (set ANTHROPIC_API_KEY on Render). This makes Claude work for every
        # signed-in user without them needing their own API key.
        api_key = self.headers.get("x-api-key", "") or os.environ.get("ANTHROPIC_API_KEY", "")
        if not api_key:
            return self._json(500, {"error": {"message": "No Claude API key available on server. Admin must set ANTHROPIC_API_KEY env var on the proxy."}})
        fwd_headers = {
            "Content-Type": "application/json",
            "x-api-key": api_key,
            "anthropic-version": self.headers.get("anthropic-version", "2023-06-01"),
        }
        if self.headers.get("anthropic-beta"):
            fwd_headers["anthropic-beta"] = self.headers.get("anthropic-beta")

        req = urllib.request.Request(
            ANTHROPIC_API + "/v1/messages",
            data=body, headers=fwd_headers, method="POST"
        )
        try:
            with urllib.request.urlopen(req, context=ctx, timeout=60) as r:
                data = r.read()
                self.send_response(r.status)
                self.send_cors()
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(data)
                print(f"  ✓ Anthropic {r.status}")
        except urllib.error.HTTPError as e:
            data = e.read()
            self.send_response(e.code)
            self.send_cors()
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(data)
            print(f"  ✗ Anthropic {e.code}")

    # ── Akahu proxy ──────────────────────────────────────────────
    def _proxy_akahu(self, body):
        try:
            payload = json.loads(body)
        except Exception:
            return self._json(400, {"error": "Invalid JSON"})

        app_token  = payload.get("appToken", "")
        user_token = payload.get("userToken", "")

        if not app_token or not user_token:
            return self._json(400, {"error": "appToken and userToken required"})

        headers = {
            "Authorization": f"Bearer {user_token}",
            "X-Akahu-App-Token": app_token,
            "Content-Type": "application/json",
        }

        def akahu_get(path):
            req = urllib.request.Request(f"{AKAHU_API}{path}", headers=headers)
            with urllib.request.urlopen(req, context=ctx, timeout=20) as r:
                return json.loads(r.read())

        # Fetch all accounts first
        try:
            accounts_data = akahu_get("/accounts")
        except urllib.error.HTTPError as e:
            err = json.loads(e.read()) if e.fp else {}
            return self._json(e.code, {"error": err.get("message", f"Akahu error {e.code}")})
        except Exception as ex:
            return self._json(502, {"error": str(ex)})

        accounts = accounts_data.get("items", [])

        holdings = []
        cash_accounts = 0
        investment_accounts = 0
        securities_total = 0

        for acc in accounts:
            bal      = (acc.get("balance") or {})
            balance  = bal.get("current") or bal.get("available") or 0
            currency = bal.get("currency", "NZD")
            conn     = (acc.get("connection") or {}).get("name", "Akahu")
            atype    = acc.get("type", "")
            atype_upper = atype.upper()
            acc_id   = acc.get("_id", "")
            name     = acc.get("name") or acc.get("formatted_account") or conn

            is_investment = any(x in atype_upper for x in ["INVEST","PORTFOLIO","KIWISAVER","WEALTH","BROKER","SHARESIES","HATCH","STAKE"])

            # ── INVESTMENT ACCOUNTS — fetch actual securities ──
            if is_investment and acc_id:
                try:
                    holdings_data = akahu_get(f"/accounts/{acc_id}/holdings")
                    items = holdings_data.get("items", [])
                    for sec in items:
                        instrument = sec.get("instrument", {}) or {}
                        sec_symbol   = (instrument.get("code") or instrument.get("symbol") or sec.get("symbol") or "").upper().strip()
                        sec_name     = instrument.get("name") or sec.get("name") or sec_symbol
                        sec_qty      = float(sec.get("quantity") or 0)
                        sec_avg_cost = float(sec.get("cost_basis") or sec.get("average_price") or sec.get("price") or 0)
                        sec_cur_val  = float(sec.get("value") or sec.get("market_value") or 0)
                        sec_currency = sec.get("currency") or instrument.get("currency") or "NZD"
                        sec_type_raw = (instrument.get("type") or sec.get("type") or "stock").lower()

                        # Map Akahu instrument types → our asset types
                        if any(x in sec_type_raw for x in ["etf","fund","pie"]):
                            sec_type = "etf"
                        elif "crypto" in sec_type_raw:
                            sec_type = "crypto"
                        elif "bond" in sec_type_raw:
                            sec_type = "bond"
                        else:
                            sec_type = "stock"

                        if not sec_symbol or sec_qty <= 0:
                            continue

                        # If we have current value but no avg cost, derive
                        if not sec_avg_cost and sec_cur_val and sec_qty:
                            sec_avg_cost = sec_cur_val / sec_qty

                        cur_price = (sec_cur_val / sec_qty) if (sec_cur_val and sec_qty) else sec_avg_cost

                        holdings.append({
                            "symbol":       sec_symbol,
                            "name":         sec_name,
                            "type":         sec_type,
                            "platform":     conn,
                            "quantity":     sec_qty,
                            "currency":     sec_currency.upper(),
                            "purchasePrice":sec_avg_cost,
                            "currentPrice": cur_price,
                            "purchaseDate": (sec.get("acquired_at") or acc.get("created_at") or "")[:10],
                            "sector":       instrument.get("sector") or "Investment",
                            "country":      instrument.get("country") or "NZ",
                            "notes":        f"Akahu sync — {conn} · {atype}",
                        })
                        securities_total += 1
                    investment_accounts += 1
                    # If no securities returned but account has balance, still record as a cash-equivalent
                    if not items and balance:
                        holdings.append(self._akahu_cash_holding(conn, name, atype, balance, currency, acc))
                        cash_accounts += 1
                    continue
                except urllib.error.HTTPError as e:
                    # Holdings endpoint not supported for this account → fall back to balance
                    print(f"  ℹ Akahu: {conn} holdings not available ({e.code}), using balance")
                except Exception as ex:
                    print(f"  ℹ Akahu: {conn} holdings error ({ex}), using balance")

            # ── BANK / CASH ACCOUNTS ──
            holdings.append(self._akahu_cash_holding(conn, name, atype, balance, currency, acc))
            cash_accounts += 1

        summary = {
            "holdings": holdings,
            "accountCount": len(accounts),
            "cashAccounts": cash_accounts,
            "investmentAccounts": investment_accounts,
            "securitiesFound": securities_total,
        }
        self._json(200, summary)
        print(f"  ✓ Akahu: {len(accounts)} accounts · {securities_total} securities · {cash_accounts} cash")

    def _akahu_cash_holding(self, conn, name, atype, balance, currency, acc):
        atype_upper = (atype or "").upper()
        if any(x in atype_upper for x in ["SAVING","CHECKING","TERM","DEPOSIT","TRANSACTION","CREDIT","LOAN","MORTGAGE"]):
            asset_type = "cash"
            sector = "Cash"
        elif any(x in atype_upper for x in ["INVEST","PORTFOLIO","KIWISAVER","WEALTH"]):
            asset_type = "etf"
            sector = "Fund"
        else:
            asset_type = "other"
            sector = "Other"
        symbol = (conn[:3] + (acc.get("_id","")[-4:])).upper()
        return {
            "symbol":       symbol,
            "name":         name,
            "type":         asset_type,
            "platform":     conn,
            "quantity":     1,
            "currency":     currency,
            "purchasePrice":balance,
            "currentPrice": balance,
            "purchaseDate": (acc.get("created_at") or "")[:10],
            "sector":       sector,
            "country":      "NZ",
            "notes":        f"Akahu sync — {atype} {acc.get('formatted_account','')}".strip(),
        }

    # ── Yahoo Finance market data ────────────────────────────────
    def _fetch_market(self):
        cached = cache_get("market")
        if cached:
            return self._json(200, cached)

        MARKET_SYMBOLS = {
            "indices":     {"S&P 500":"^GSPC","NASDAQ":"^IXIC","FTSE 100":"^FTSE","Nikkei 225":"^N225","DAX":"^GDAXI","Hang Seng":"^HSI","NZX 50":"^NZ50"},
            "commodities": {"Gold":"GC=F","Silver":"SI=F","Crude Oil":"CL=F","Natural Gas":"NG=F"},
            "crypto":      {"Bitcoin":"BTC-USD","Ethereum":"ETH-USD","BNB":"BNB-USD"},
            "fx":          {"USD/NZD":"USDNZD=X","AUD/NZD":"AUDNZD=X","GBP/NZD":"GBPNZD=X","USD/AUD":"USDAUD=X"},
        }

        all_symbols = [s for cat in MARKET_SYMBOLS.values() for s in cat.values()]
        quotes = self._yahoo_quotes(all_symbols)

        result = {}
        for cat, mapping in MARKET_SYMBOLS.items():
            result[cat] = {}
            for name, sym in mapping.items():
                if sym in quotes:
                    result[cat][name] = quotes[sym]

        result["lastUpdated"] = datetime.utcnow().isoformat() + "Z"
        cache_set("market", result)
        self._json(200, result)
        print(f"  ✓ Market data fetched ({len(quotes)} quotes)")

    def _fetch_prices(self, symbols):
        cache_key = "prices:" + ",".join(sorted(symbols))
        cached = cache_get(cache_key)
        if cached:
            return self._json(200, cached)

        quotes = self._yahoo_quotes(symbols)
        result = {sym: {"price": q["price"], "change": q["change"], "changePct": q["changePct"]}
                  for sym, q in quotes.items()}
        cache_set(cache_key, result, ttl_seconds=60)
        self._json(200, result)
        print(f"  ✓ Prices fetched: {list(result.keys())}")

    # ── Yahoo Finance ticker search (typeahead) ───────────────────
    def _yahoo_search(self, query):
        """Hit Yahoo's public search endpoint and return up to 15 matches.

        Used by the watchlist picker as a typeahead source. Yahoo search is
        unauthenticated and public; we just proxy it through the same auth
        gate as the rest of /api/* so the X-Proxy-Secret still gates abuse.
        """
        query = (query or "").strip()
        if len(query) < 1:
            return self._json(400, {"error": "q param required"})
        # 5-min cache — popular queries (NVDA, AAPL, BTC) repeat constantly
        cache_key = f"search:{query.lower()}"
        cached = cache_get(cache_key)
        if cached:
            return self._json(200, cached)
        try:
            import urllib.request, urllib.parse, json as _json
            url = (
                "https://query2.finance.yahoo.com/v1/finance/search?"
                + urllib.parse.urlencode({
                    "q": query,
                    "quotesCount": 15,
                    "newsCount": 0,
                    "enableFuzzyQuery": "true"
                })
            )
            req = urllib.request.Request(url, headers={
                "User-Agent": "Mozilla/5.0 (InvestIQ proxy)"
            })
            with urllib.request.urlopen(req, timeout=8) as r:
                raw = _json.loads(r.read().decode("utf-8", errors="ignore"))
            quotes = []
            for q in (raw.get("quotes") or [])[:15]:
                sym = q.get("symbol")
                if not sym:
                    continue
                quotes.append({
                    "symbol":    sym,
                    "shortname": q.get("shortname") or q.get("longname") or sym,
                    "longname":  q.get("longname") or "",
                    "exch":      q.get("exchDisp") or q.get("exchange") or "",
                    "type":      q.get("quoteType") or ""
                })
            payload = {"quotes": quotes}
            cache_set(cache_key, payload, ttl=300)
            self._json(200, payload)
        except Exception as e:
            self._json(502, {"error": f"Yahoo search failed: {e}"})

    def _fetch_news(self, symbols, limit_per=3):
        # Yahoo Finance news per ticker — cached 30 min so we don't hammer the API
        symbols = [s.strip() for s in symbols if s.strip()]
        if not symbols:
            return self._json(400, {"error": "symbols param required"})
        cache_key = f"news:{','.join(sorted(symbols))}:{limit_per}"
        cached = cache_get(cache_key)
        if cached:
            return self._json(200, cached)
        try:
            import yfinance as yf
            articles = []
            seen = set()  # dedupe by URL
            for sym in symbols[:30]:  # cap at 30 symbols to keep request bounded
                try:
                    t = yf.Ticker(sym)
                    items = t.news or []
                    for item in items[:limit_per]:
                        # yfinance news shape: {uuid, title, publisher, link, providerPublishTime, type, ...}
                        # Newer versions wrap in {content: {...}} — handle both
                        c = item.get('content', item)
                        url = c.get('canonicalUrl', {}).get('url') if isinstance(c.get('canonicalUrl'), dict) else c.get('link', '')
                        if not url or url in seen:
                            continue
                        seen.add(url)
                        ts = c.get('pubDate') or c.get('providerPublishTime')
                        if isinstance(ts, (int, float)):
                            ts = datetime.utcfromtimestamp(ts).isoformat() + "Z"
                        articles.append({
                            "symbol":    sym,
                            "title":     c.get('title', '') or '',
                            "publisher": (c.get('provider') or {}).get('displayName') if isinstance(c.get('provider'), dict) else c.get('publisher', ''),
                            "url":       url,
                            "thumbnail": (c.get('thumbnail') or {}).get('resolutions', [{}])[0].get('url') if isinstance(c.get('thumbnail'), dict) else None,
                            "published": ts,
                            "summary":   c.get('summary', '') or c.get('description', '') or ''
                        })
                except Exception as ex:
                    print(f"  ℹ news fetch failed for {sym}: {ex}")
            # Sort newest first
            articles.sort(key=lambda a: a.get('published') or '', reverse=True)
            result = {"articles": articles, "count": len(articles), "symbols": symbols}
            cache_set(cache_key, result, ttl_seconds=1800)  # 30 min
            self._json(200, result)
            print(f"  ✓ News fetched: {len(articles)} articles for {len(symbols)} symbols")
        except ImportError:
            self._json(500, {"error": "yfinance not installed on proxy"})
        except Exception as ex:
            self._json(500, {"error": str(ex)})

    def _yahoo_quotes(self, symbols):
        try:
            import yfinance as yf
            # Single bulk download — much faster than per-symbol calls
            df = yf.download(symbols, period='2d', auto_adjust=True,
                             progress=False, threads=True)
            if df.empty:
                return {}
            out = {}
            close = df['Close']
            if len(symbols) == 1:
                sym = symbols[0]
                vals = close.dropna()
                if vals.empty:
                    return {}
                price = float(vals.iloc[-1])
                prev  = float(vals.iloc[-2]) if len(vals) > 1 else price
                chg   = price - prev
                pct   = (chg / prev * 100) if prev else 0
                out[sym] = {"price": round(price,4), "change": round(chg,4),
                            "changePct": round(pct,4), "name": sym}
            else:
                for sym in symbols:
                    try:
                        col = close[sym].dropna()
                        if col.empty:
                            continue
                        price = float(col.iloc[-1])
                        prev  = float(col.iloc[-2]) if len(col) > 1 else price
                        chg   = price - prev
                        pct   = (chg / prev * 100) if prev else 0
                        out[sym] = {"price": round(price,4), "change": round(chg,4),
                                    "changePct": round(pct,4), "name": sym}
                    except Exception:
                        pass
            return out
        except ImportError:
            print("  ℹ run:  py -m pip install yfinance  for live market data")
        except Exception as ex:
            print(f"  ✗ yfinance error: {ex}")
        return {}

    # ── Agents (basic pass-through to Anthropic) ─────────────────
    def _run_agents(self, body):
        # Forward to /v1/messages with API key from env or header
        import os
        api_key = self.headers.get("x-api-key") or os.environ.get("ANTHROPIC_API_KEY", "")
        if not api_key:
            return self._json(400, {"error": "No ANTHROPIC_API_KEY set. Run: set ANTHROPIC_API_KEY=sk-ant-... && python proxy.py"})

        # Rebuild a messages payload from the agents request
        try:
            payload = json.loads(body)
        except Exception:
            return self._json(400, {"error": "Invalid JSON"})

        holdings = payload.get("holdings", [])
        if not holdings:
            return self._json(400, {"error": "No holdings provided"})

        # Build a single combined analysis prompt
        msgs_body = json.dumps({
            "model": "claude-sonnet-4-6",
            "max_tokens": 2048,
            "system": "You are a senior personal financial advisor and portfolio analyst. Provide a comprehensive analysis.",
            "messages": [{
                "role": "user",
                "content": f"""Analyse this investment portfolio and provide:
1. **Portfolio Health Score** (0-100) with key observations
2. **Market Impact** — top 3 global factors affecting these holdings right now
3. **Opportunities** — 2-3 specific actionable gaps to fill
4. **Priority Actions** — top 5 recommendations in order of importance

Portfolio:
{json.dumps(holdings, indent=2)}

Currency: {payload.get('currency','NZD')}
{('Additional context: ' + payload.get('extraContext','')) if payload.get('extraContext') else ''}"""
            }]
        }).encode()

        fwd_headers = {
            "Content-Type": "application/json",
            "x-api-key": api_key,
            "anthropic-version": "2023-06-01",
        }
        req = urllib.request.Request(
            f"{ANTHROPIC_API}/v1/messages",
            data=msgs_body, headers=fwd_headers, method="POST"
        )
        try:
            with urllib.request.urlopen(req, context=ctx, timeout=60) as r:
                result = json.loads(r.read())
            text = result.get("content", [{}])[0].get("text", "")
            score_line = next((l for l in text.split('\n') if 'score' in l.lower()), "")
            import re
            score_match = re.search(r'(\d+)', score_line)
            score = int(score_match.group(1)) if score_match else None
            self._json(200, {
                "agents": [
                    {"agentKey":"advisor","agentName":"💼 Personal Advisor","content":text,"durationMs":0}
                ],
                "portfolioScore": score,
                "summary": text,
                "timestamp": datetime.utcnow().isoformat() + "Z"
            })
            print(f"  ✓ Agent analysis complete")
        except urllib.error.HTTPError as e:
            err = json.loads(e.read()) if e.fp else {}
            self._json(e.code, {"error": err.get("error", {}).get("message", f"API error {e.code}")})

    # ── Helper ───────────────────────────────────────────────────
    def _json(self, status, data):
        body = json.dumps(data).encode()
        try:
            self.send_response(status)
            self.send_cors()
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        except (BrokenPipeError, ConnectionAbortedError, ConnectionResetError):
            pass  # browser closed the connection early — not an error

    def log_error(self, fmt, *args):
        # Suppress socket-level error noise from browser disconnects
        msg = fmt % args
        if any(x in msg for x in ('10053', '10054', 'Broken pipe', 'Connection aborted')):
            return
        print(f"  ✗ {msg}")


if __name__ == "__main__":
    server = HTTPServer((HOST, PORT), ProxyHandler)
    print(f"""
╔══════════════════════════════════════════════════════╗
║   InvestIQ Proxy — All-in-one local API server       ║
║                                                      ║
║   Listening on  http://localhost:{PORT}                 ║
║                                                      ║
║   Handles:                                           ║
║   • Anthropic Claude API  (AI agents)                ║
║   • Akahu NZ Open Banking (ANZ, BNZ, Sharesies)      ║
║   • Yahoo Finance         (live prices)              ║
║                                                      ║
║   Set Proxy URL in dashboard Settings:               ║
║   http://localhost:{PORT}                               ║
║                                                      ║
║   To enable AI agents, set your API key first:       ║
║   Windows: set ANTHROPIC_API_KEY=sk-ant-...          ║
║   Then run: python proxy.py                          ║
║                                                      ║
║   Press Ctrl+C to stop                               ║
╚══════════════════════════════════════════════════════╝
""")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nProxy stopped.")
