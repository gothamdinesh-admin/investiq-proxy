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
PORT = int(os.environ.get("PORT", 8080))
HOST = "0.0.0.0"   # bind to all interfaces (required for Render/cloud hosting)
ANTHROPIC_API = "https://api.anthropic.com"
AKAHU_API     = "https://api.akahu.io/v1"

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

    def send_cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers",
                         "Content-Type, x-api-key, anthropic-version, anthropic-beta, X-Akahu-App-Token, Authorization")

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_cors()
        self.end_headers()

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        params = urllib.parse.parse_qs(parsed.query)

        if parsed.path == "/health":
            self._json(200, {"status": "ok", "service": "InvestIQ Proxy"})

        elif parsed.path == "/api/market":
            symbols = params.get("symbols", [None])[0]
            if symbols:
                self._fetch_prices(symbols.split(","))
            else:
                self._fetch_market()
        else:
            self._json(404, {"error": "Not found"})

    def do_POST(self):
        length = int(self.headers.get("Content-Length", 0))
        body   = self.rfile.read(length)

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
        api_key = self.headers.get("x-api-key", "")
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
