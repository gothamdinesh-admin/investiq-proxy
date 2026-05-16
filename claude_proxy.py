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
        elif parsed.path == "/api/headlines":
            # Aggregated news from multiple reputable RSS sources.
            # Optional ?sources=bbc,reuters,rnz (comma-separated source keys).
            requested = (params.get("sources", [""])[0] or "").strip()
            limit = int(params.get("limit", ["40"])[0])
            self._fetch_headlines(requested, limit)
        elif parsed.path == "/api/history":
            # Historical price series for a single ticker. Used by the
            # Holding Detail modal's 1y chart.
            #   ?symbol=NVDA       — required
            #   ?period=1y         — 1d/5d/1mo/3mo/6mo/1y/2y/5y/max (default 1y)
            sym = (params.get("symbol", [""])[0] or "").strip()
            period = (params.get("period", ["1y"])[0] or "1y").strip()
            self._fetch_history(sym, period)
        elif parsed.path == "/api/nz-fund":
            # NZ Managed Fund / KiwiSaver unit price scraper.
            # Tries multiple sources in order of reliability:
            #   1. Harbour Asset Management direct (if a Harbour fund)
            #   2. (Future) Sorted.org.nz Smart Investor for all NZ funds
            #   ?code=HARBOUR-AE  — InvestIQ short code
            #   ?provider=Harbour Asset Management  — fund provider name
            #   ?name=Australasian Equity Fund  — fund full name (helps matching)
            code     = (params.get("code", [""])[0] or "").strip()
            provider = (params.get("provider", [""])[0] or "").strip()
            name     = (params.get("name", [""])[0] or "").strip()
            self._fetch_nz_fund(code, provider, name)
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

    # ── Historical price series for one ticker ────────────────────
    def _fetch_history(self, symbol, period):
        """Fetch daily OHLC for a single ticker via yfinance.

        Returns: {symbol, period, points: [{date, close}, ...], min, max}
        Cached 30 min per (symbol, period) — daily data only changes once a day.
        """
        symbol = (symbol or "").strip().upper()
        if not symbol:
            return self._json(400, {"error": "symbol param required"})
        valid_periods = {"1d", "5d", "1mo", "3mo", "6mo", "1y", "2y", "5y", "max"}
        if period not in valid_periods:
            period = "1y"
        cache_key = f"history:{symbol}:{period}"
        cached = cache_get(cache_key)
        if cached:
            return self._json(200, cached)
        try:
            import yfinance as yf
            t = yf.Ticker(symbol)
            hist = t.history(period=period, auto_adjust=False)
            if hist is None or hist.empty:
                return self._json(404, {"error": f"No history for {symbol}"})
            # LSE-listed (.L / .IL) — Yahoo returns pence; normalise to pounds
            # so the chart shows realistic values. Matches frontend isPenceQuoted.
            pence_adj = 0.01 if (symbol.endswith(".L") or symbol.endswith(".IL")) else 1.0
            points = []
            closes = []
            for ts, row in hist.iterrows():
                close = float(row.get("Close") or 0) * pence_adj
                if close <= 0:
                    continue
                points.append({
                    "date":  ts.strftime("%Y-%m-%d"),
                    "close": round(close, 4)
                })
                closes.append(close)
            payload = {
                "symbol":   symbol,
                "period":   period,
                "points":   points,
                "min":      round(min(closes), 4) if closes else 0,
                "max":      round(max(closes), 4) if closes else 0,
                "first":    points[0]["close"] if points else 0,
                "last":     points[-1]["close"] if points else 0,
                "count":    len(points)
            }
            cache_set(cache_key, payload, ttl_seconds=1800)
            self._json(200, payload)
        except Exception as e:
            self._json(502, {"error": f"Yahoo history failed: {e}"})

    # ── NZ Managed Fund unit-price scraping ──────────────────────
    # Yahoo doesn't track NZ-domiciled unit trusts. Until users can self-
    # populate prices manually we scrape provider sites + Sorted.org.nz.
    # Cached aggressively (12h) — unit prices change once per day.
    def _fetch_nz_fund(self, code, provider, name):
        if not (code or provider or name):
            return self._json(400, {"error": "code, provider, or name required"})
        cache_key = f"nz-fund:{code}:{provider}:{name}".lower()
        cached = cache_get(cache_key)
        if cached:
            return self._json(200, cached)

        # Try Harbour first if it's clearly a Harbour fund
        is_harbour = (
            "harbour" in code.lower()
            or "harbour" in provider.lower()
        )
        result = None
        if is_harbour:
            result = self._scrape_harbour(code, name)

        # Fallback: try Sorted.org.nz Smart Investor — government-backed,
        # covers ALL NZ retail funds + KiwiSaver. If we got no price from
        # the provider-specific scraper, try this as a fallback.
        if not (result and result.get("price")):
            sorted_result = self._scrape_sorted_nz(code, provider, name)
            # Prefer Sorted result if it found a price; otherwise keep the
            # provider-specific diagnostic (which often has 'available').
            if sorted_result and sorted_result.get("price"):
                result = sorted_result
            elif sorted_result and sorted_result.get("available") and not (result and result.get("available")):
                result = sorted_result

        if result and result.get("price"):
            cache_set(cache_key, result, ttl_seconds=43200)  # 12h
            return self._json(200, result)
        # Scraper ran but couldn't match — preserve the diagnostic info
        # (especially the `available` list of fund names) so the frontend
        # can surface them to the user.
        if result and (result.get("available") or result.get("error")):
            return self._json(200, {
                "price": None,
                "error": result.get("error") or "Fund not matched",
                "available": result.get("available") or [],
                "source": result.get("source") or "scrape",
                "tried":  ["harbour"] if is_harbour else []
            })
        self._json(404, {"error": "Fund not found via any source",
                          "tried": ["harbour" if is_harbour else None]})

    def _scrape_sorted_nz(self, code, provider, name):
        """Search Sorted.org.nz Smart Investor (FMA-run NZ fund database).

        Smart Investor publishes daily unit prices for EVERY NZ retail fund
        + KiwiSaver scheme via a Morningstar-powered backend. URL pattern:
          https://smartinvestor.sorted.org.nz/api/fund/search?query=<text>
        That endpoint returns JSON. If the format ever changes, we fall
        back to HTML scraping the public search page.

        Returns: {price, asOf, currency, source, fund_name, available} or None
        """
        try:
            import urllib.request as _ur
            import urllib.parse as _up
            import json as _json
            # Build the search query — prefer fund name, then provider, then code
            query = (name or provider or code or '').strip()
            if not query:
                return None
            # Try the documented public endpoint first
            endpoints = [
                f"https://smartinvestor.sorted.org.nz/api/funds?search={_up.quote(query)}",
                f"https://smartinvestor.sorted.org.nz/api/fund/search?query={_up.quote(query)}",
            ]
            data = None
            for url in endpoints:
                req = _ur.Request(url, headers={
                    "User-Agent": "Mozilla/5.0 (InvestIQ Portfolio Tracker; +https://investiq-nz.netlify.app)",
                    "Accept": "application/json,text/html"
                })
                try:
                    with _ur.urlopen(req, timeout=10) as r:
                        body = r.read().decode("utf-8", errors="ignore")
                        # Try to parse as JSON first
                        try:
                            data = _json.loads(body)
                            break
                        except Exception:
                            continue
                except Exception:
                    continue
            if not data:
                return {
                    "price": None,
                    "error": "Sorted.org.nz API didn't return matchable JSON. The endpoint may have moved.",
                    "source": "smartinvestor.sorted.org.nz"
                }

            # Normalise the response — Sorted's API shape may vary. Look for
            # arrays of funds with 'name' + 'unitPrice' + 'lastUpdated' fields.
            candidates = []
            if isinstance(data, list):
                candidates = data
            elif isinstance(data, dict):
                for key in ('results', 'funds', 'data', 'items'):
                    if isinstance(data.get(key), list):
                        candidates = data[key]
                        break

            if not candidates:
                return {
                    "price": None,
                    "error": "No funds in Sorted.org.nz response",
                    "source": "smartinvestor.sorted.org.nz",
                    "raw_shape": list(data.keys()) if isinstance(data, dict) else "list"
                }

            # Try to match by name (case-insensitive substring)
            name_lower = (name or '').lower().strip()
            best = None
            for c in candidates:
                fname = (c.get('name') or c.get('fund_name') or c.get('title') or '').lower()
                if name_lower and name_lower in fname:
                    best = c
                    break
            if not best:
                # No exact name match — return list of options for user
                available = [c.get('name') or c.get('fund_name') or c.get('title') for c in candidates[:20] if c.get('name') or c.get('fund_name') or c.get('title')]
                return {
                    "price": None,
                    "error": "Found NZ funds on Sorted.org.nz but none matched your name exactly",
                    "available": available,
                    "source": "smartinvestor.sorted.org.nz"
                }

            # Extract price from the best match — field names vary
            price = best.get('unitPrice') or best.get('unit_price') or best.get('price') or best.get('latestPrice')
            as_of = best.get('asAt') or best.get('lastUpdated') or best.get('priceDate')
            fund_name = best.get('name') or best.get('fund_name') or best.get('title')
            if price is None:
                return {
                    "price": None,
                    "error": f"Found '{fund_name}' but no unit price field in response",
                    "source": "smartinvestor.sorted.org.nz"
                }
            try:
                price = float(price)
            except (TypeError, ValueError):
                return {
                    "price": None,
                    "error": f"Unit price not numeric: {price!r}",
                    "source": "smartinvestor.sorted.org.nz"
                }
            return {
                "price":     round(price, 4),
                "asOf":      as_of,
                "currency":  "NZD",
                "source":    "smartinvestor.sorted.org.nz",
                "fund_name": fund_name
            }
        except Exception as e:
            print(f"  ⚠ Sorted.org.nz scrape failed: {e}")
            return {"price": None, "error": f"Sorted.org.nz: {e}", "source": "smartinvestor.sorted.org.nz"}

    def _scrape_harbour(self, code, name):
        """Scrape Harbour Asset Management's public unit-prices page.

        Source: tries multiple URL paths since Harbour may change site
        structure. ToS: pages are publicly published (Harbour is required
        by NZ FMA to publish daily unit prices for retail funds). We hit
        them at most twice per 12h per fund via the cache layer.

        Returns: {price, asOf, currency, source, fund_name} or None
        """
        try:
            import urllib.request as _ur
            from html.parser import HTMLParser
            # Harbour has shuffled URLs over time. Try the most likely paths
            # in order; first 2xx response wins. If all 404, surface the
            # attempted URLs in the error so the user can paste the right one.
            candidate_urls = [
                "https://www.harbourasset.co.nz/our-funds/unit-prices/",
                "https://www.harbourasset.co.nz/unit-prices/",
                "https://www.harbourasset.co.nz/funds/unit-prices/",
                "https://www.harbourasset.co.nz/our-funds/",
                "https://www.harbourasset.co.nz/wholesale-funds/unit-prices/"
            ]
            html = None
            last_status = None
            tried = []
            for url in candidate_urls:
                req = _ur.Request(url, headers={
                    "User-Agent": "Mozilla/5.0 (InvestIQ Portfolio Tracker; +https://investiq-nz.netlify.app)",
                    "Accept": "text/html,application/xhtml+xml"
                })
                tried.append(url)
                try:
                    with _ur.urlopen(req, timeout=10) as r:
                        html = r.read().decode("utf-8", errors="ignore")
                        last_status = r.status
                        if html and len(html) > 1000:
                            break  # found content
                except Exception as ue:
                    last_status = str(ue)
                    continue
            if not html:
                return {
                    "price": None,
                    "error": f"All Harbour URLs returned errors. Last: {last_status}. URLs tried: {len(tried)}",
                    "tried_urls": tried,
                    "source": "harbourasset.co.nz"
                }

            # The unit-prices page renders as a table with rows of:
            #   Fund name | Application price | Withdrawal price | Date
            # We extract all rows and try to match the user's requested fund.
            class HarbourParser(HTMLParser):
                def __init__(self):
                    super().__init__()
                    self.in_table = False
                    self.in_row = False
                    self.in_cell = False
                    self.current_row = []
                    self.current_cell = ""
                    self.rows = []
                    self.as_of_date = None

                def handle_starttag(self, tag, attrs):
                    if tag == "table": self.in_table = True
                    elif tag == "tr" and self.in_table:
                        self.in_row = True
                        self.current_row = []
                    elif tag in ("td", "th") and self.in_row:
                        self.in_cell = True
                        self.current_cell = ""

                def handle_endtag(self, tag):
                    if tag == "table": self.in_table = False
                    elif tag == "tr" and self.in_row:
                        if self.current_row:
                            self.rows.append(self.current_row)
                        self.in_row = False
                    elif tag in ("td", "th") and self.in_cell:
                        self.current_row.append(self.current_cell.strip())
                        self.in_cell = False

                def handle_data(self, data):
                    if self.in_cell:
                        self.current_cell += data

            parser = HarbourParser()
            parser.feed(html)

            # Find the row matching the user's fund. Match strategy:
            # 1. Exact name match (case-insensitive)
            # 2. Substring match on fund name
            # 3. Code-derived match (HARBOUR-AE → "Australasian Equity")
            code_hints = {
                "HARBOUR-AE":            ["australasian equity"],
                "HARBOUR-GROWTH":        ["growth"],
                "HARBOUR-INCOME":        ["income", "active income"],
                "HARBOUR-NZ-EQUITY":     ["nz equity", "core nz equity"],
                "HARBOUR-CORPORATE":     ["corporate bond"],
                "HARBOUR-INVESTMENT":    ["investment grade", "credit"],
                "HARBOUR-LISTED-PROP":   ["listed property"],
                "HARBOUR-T-RES":         ["t rowe", "global equity"]
            }
            hints = code_hints.get(code.upper(), [])
            search_terms = [name.lower()] + hints if name else hints

            best_row = None
            for row in parser.rows:
                if len(row) < 3:
                    continue
                fund_name_raw = row[0].lower()
                for term in search_terms:
                    if term and term.lower() in fund_name_raw:
                        best_row = row
                        break
                if best_row:
                    break

            if not best_row:
                # No match — return the available fund names so the user
                # knows what's there (helps with adding the right code)
                available = [r[0] for r in parser.rows if r and len(r) >= 2 and r[0]][:20]
                return {
                    "price": None,
                    "error": f"No matching fund. Available Harbour funds: {', '.join(available[:8])}",
                    "available": available,
                    "source": "harbourasset.co.nz"
                }

            # Parse the price. Harbour publishes Application + Withdrawal +
            # Mid prices; we use Mid (or fall back to Application).
            import re as _re
            price = None
            for cell in best_row[1:]:
                m = _re.search(r"([\d,]+\.\d+)", cell or "")
                if m:
                    try:
                        price = float(m.group(1).replace(",", ""))
                        break
                    except ValueError:
                        continue
            if not price:
                return {"price": None, "error": "Found row but couldn't parse price", "raw": best_row}

            # Try to find the as-of date — often the last cell
            as_of = None
            for cell in reversed(best_row):
                m = _re.search(r"(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})", cell or "")
                if m:
                    as_of = m.group(1)
                    break

            return {
                "price":     round(price, 4),
                "asOf":      as_of,
                "currency":  "NZD",
                "source":    "harbourasset.co.nz",
                "fund_name": best_row[0]
            }
        except Exception as e:
            print(f"  ⚠ Harbour scrape failed: {e}")
            return {"price": None, "error": f"scrape failed: {e}", "source": "harbourasset.co.nz"}

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

    # ── Aggregated RSS headlines from reputable sources ────────────
    # Sources curated for InvestIQ's NZ-based audience: NZ business news
    # first (RNZ, Stuff), plus globally-trusted Western outlets (BBC,
    # MarketWatch, CNBC). All sources publish freely-accessible RSS.
    # Parses with stdlib xml.etree — no extra dep needed.
    NEWS_SOURCES = {
        "rnz":         { "name": "RNZ Business",         "url": "https://www.rnz.co.nz/rss/business.xml",            "region": "NZ" },
        "stuff":       { "name": "Stuff Business",       "url": "https://www.stuff.co.nz/business/rss",              "region": "NZ" },
        "nzherald":    { "name": "NZ Herald Business",   "url": "https://www.nzherald.co.nz/business/rss.xml",       "region": "NZ" },
        "bbc":         { "name": "BBC Business",         "url": "http://feeds.bbci.co.uk/news/business/rss.xml",     "region": "Global" },
        "marketwatch": { "name": "MarketWatch",          "url": "http://feeds.marketwatch.com/marketwatch/topstories/", "region": "Global" },
        "cnbc":        { "name": "CNBC Top News",        "url": "https://www.cnbc.com/id/100003114/device/rss/rss.html","region": "Global" },
        "investing":   { "name": "Investing.com",        "url": "https://www.investing.com/rss/news.rss",            "region": "Global" },
        "guardian":    { "name": "Guardian Business",    "url": "https://www.theguardian.com/business/rss",          "region": "Global" },
    }

    def _parse_rss_feed(self, key, meta):
        """Fetch + parse one RSS feed → list of normalised article dicts.

        Returns empty list on any failure (network, parse, timeout). Never
        raises — one bad feed shouldn't break the aggregate response.
        """
        try:
            import urllib.request as _ur
            from xml.etree import ElementTree as ET
            req = _ur.Request(meta["url"], headers={
                "User-Agent": "Mozilla/5.0 (InvestIQ news aggregator)"
            })
            with _ur.urlopen(req, timeout=6) as r:
                raw = r.read()
            root = ET.fromstring(raw)
            # RSS 2.0 lives at /rss/channel/item; Atom (rarely used by these
            # feeds) uses /feed/entry. Handle both defensively.
            items = root.findall(".//item")
            if not items:
                items = root.findall("{http://www.w3.org/2005/Atom}entry")
            articles = []
            for it in items[:25]:  # cap per feed to keep payload small
                title = (it.findtext("title") or "").strip()
                link  = (it.findtext("link")  or "").strip()
                if not title or not link:
                    continue
                desc  = (it.findtext("description") or it.findtext("summary") or "").strip()
                # Strip basic HTML tags from description for clean display
                import re as _re
                desc = _re.sub(r"<[^>]+>", "", desc)[:300]
                pub   = (it.findtext("pubDate") or it.findtext("{http://www.w3.org/2005/Atom}updated") or "").strip()
                articles.append({
                    "title":    title,
                    "link":     link,
                    "summary":  desc,
                    "pubDate":  pub,
                    "source":   meta["name"],
                    "sourceKey": key,
                    "region":   meta["region"],
                })
            return articles
        except Exception as e:
            print(f"  ⚠ RSS fetch failed for {key}: {e}")
            return []

    def _fetch_headlines(self, requested, limit):
        """Aggregate RSS from multiple sources in parallel. Cached 15 min.

        ?sources=bbc,rnz   → only those feeds (comma-separated keys)
        ?sources=all       → every feed (default if param omitted)
        ?limit=N           → cap returned article count (default 40)
        """
        keys = (requested or "all").lower().split(",")
        keys = [k.strip() for k in keys if k.strip()]
        if "all" in keys or not keys:
            active = list(self.NEWS_SOURCES.keys())
        else:
            active = [k for k in keys if k in self.NEWS_SOURCES]
        if not active:
            return self._json(400, {"error": "Unknown source. Valid: " + ",".join(self.NEWS_SOURCES.keys())})

        cache_key = f"headlines:{','.join(sorted(active))}"
        cached = cache_get(cache_key)
        if cached:
            # Trim to limit even from cache so caller's limit param respected
            payload = dict(cached)
            payload["articles"] = (cached.get("articles") or [])[:limit]
            return self._json(200, payload)

        # Fetch all selected feeds in parallel — capped at 8 workers (we have
        # 8 sources max). Each feed has its own 6s timeout, so worst case is
        # ~6s total, not 6s × N.
        from concurrent.futures import ThreadPoolExecutor, as_completed
        all_articles = []
        with ThreadPoolExecutor(max_workers=8) as pool:
            futures = {
                pool.submit(self._parse_rss_feed, k, self.NEWS_SOURCES[k]): k
                for k in active
            }
            for fut in as_completed(futures):
                all_articles.extend(fut.result())

        # Dedupe by URL (some outlets cross-publish the same wire story)
        seen = set()
        deduped = []
        for a in all_articles:
            if a["link"] in seen:
                continue
            seen.add(a["link"])
            deduped.append(a)

        # Sort by pubDate descending (newest first). Some feeds use RFC822,
        # others use ISO 8601; the helper tolerates both, falls back to
        # string compare if neither parses.
        from email.utils import parsedate_to_datetime
        def _parse_date(s):
            if not s: return 0
            try:
                return parsedate_to_datetime(s).timestamp()
            except Exception:
                try:
                    return datetime.fromisoformat(s.replace("Z", "+00:00")).timestamp()
                except Exception:
                    return 0
        deduped.sort(key=lambda a: _parse_date(a["pubDate"]), reverse=True)

        payload = {
            "ranAt":      datetime.utcnow().isoformat() + "Z",
            "sources":    [{ "key": k, **self.NEWS_SOURCES[k] } for k in active],
            "totalCount": len(deduped),
            "articles":   deduped  # cache the full set, trim at response time
        }
        cache_set(cache_key, payload, ttl_seconds=900)  # 15 min
        # Respect the caller's limit param
        out = dict(payload)
        out["articles"] = deduped[:limit]
        self._json(200, out)
        print(f"  ✓ Headlines aggregated: {len(deduped)} articles from {len(active)} sources")

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
