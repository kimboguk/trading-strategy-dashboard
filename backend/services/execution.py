# -*- coding: utf-8 -*-
"""실행 어댑터 — 시장 인지형 추상화.

- ManualForwardAdapter: no-op(표시 전용 티켓). 대시보드/주문표시는 항상 이걸로.
- KiwoomAdapter: 키움 REST 실주문/계좌/시세. submit_* 는 **실제 주문을 전송**하므로
  오직 자동매매 제출(Phase 3, live_service.submit_cycle_orders)에서만 호출해야 함.

키움 REST 스펙(2026 기준, 버전에 따라 변동 가능 — 실 구현 전 공식 문서 확인):
  토큰 : POST {base}/oauth2/token  body {grant_type,appkey,secretkey} → {token, expires_dt}
  헤더 : authorization: "Bearer {token}", api-id: "{TR}", cont-yn, next-key
  주문 : POST /api/dostk/ordr   (매수 kt10000 / 매도 kt10001)
  계좌 : POST /api/dostk/acnt   (kt00018 계좌평가잔고내역)
  시세 : POST /api/dostk/stkinfo (ka10001 주식기본정보)
모든 HTTP는 _http()/_request() 뒤로 격리 → 필드명/경로 보정은 이 파일 한 곳에서.
"""

import json
import time
import urllib.request
import urllib.error
from typing import Protocol, List

from core.config import settings


class ExecutionAdapter(Protocol):
    name: str

    def submit_entry(self, order: dict) -> dict: ...
    def submit_exit(self, order: dict) -> dict: ...
    def get_fills(self) -> List[dict]: ...


class ManualForwardAdapter:
    """no-op 브로커 — 표시 전용 티켓. 실주문 없음."""
    name = "manual"

    def submit_entry(self, order: dict) -> dict:
        return {**order, "side": "BUY", "status": "manual_pending"}

    def submit_exit(self, order: dict) -> dict:
        return {**order, "side": "SELL", "status": "manual_pending"}

    def get_fills(self) -> List[dict]:
        return []


# ── 유틸 ──────────────────────────────────────────────────────
def norm_code(ticker) -> str:
    """KR 종목 → 6자리 코드 (접미사 제거)."""
    s = str(ticker or "").upper().split(".")[0].strip()
    return s.zfill(6) if s.isdigit() else s


def _num(v):
    if v is None:
        return None
    try:
        return float(str(v).replace(",", "").replace("+", ""))
    except Exception:
        return None


class KiwoomError(Exception):
    pass


class KiwoomAdapter:
    """키움 REST (모의/실전, KIWOOM_ENV로 선택)."""
    name = "kiwoom"

    def __init__(self):
        self.env = settings.KIWOOM_ENV
        self.base = settings.kiwoom_base_url()
        self.appkey = settings.KIWOOM_APP_KEY
        self.secret = settings.KIWOOM_APP_SECRET
        self.account = settings.KIWOOM_ACCOUNT_NO
        self._token = None
        self._token_exp = 0.0

    def _require_keys(self):
        if not (self.appkey and self.secret and self.account):
            raise KiwoomError("키움 키/계좌 미설정 (.env KIWOOM_*_APP_KEY/SECRET/ACCOUNT_NO)")

    def _http(self, path: str, body: dict, headers: dict, timeout: int = 10):
        data = json.dumps(body).encode("utf-8")
        req = urllib.request.Request(self.base + path, data=data, headers=headers, method="POST")
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                raw = r.read().decode("utf-8", "replace")
        except urllib.error.HTTPError as e:
            body_txt = e.read().decode("utf-8", "replace")
            raise KiwoomError(f"HTTP {e.code}: {body_txt[:300]}")
        except Exception as e:
            raise KiwoomError(f"연결 실패: {e}")
        try:
            return json.loads(raw) if raw else {}
        except Exception:
            return {"_raw": raw}

    # ── 토큰 ──
    def _issue_token(self):
        self._require_keys()
        data = self._http("/oauth2/token",
                          {"grant_type": "client_credentials",
                           "appkey": self.appkey, "secretkey": self.secret},
                          {"Content-Type": "application/json;charset=UTF-8"})
        tok = data.get("token") or data.get("access_token")
        if not tok:
            raise KiwoomError(f"토큰 발급 실패: {str(data)[:300]}")
        self._token = tok
        self._token_exp = time.time() + 3600   # 보수적 1h 캐시(만료 전 재발급)
        return tok

    def token(self) -> str:
        if not (self._token and time.time() < self._token_exp - 60):
            self._issue_token()
        return self._token

    def _request(self, api_id: str, path: str, body: dict) -> dict:
        headers = {
            "authorization": f"Bearer {self.token()}",
            "api-id": api_id,
            "Content-Type": "application/json;charset=UTF-8",
        }
        return self._http(path, body, headers)

    def ping(self) -> dict:
        """토큰 발급만으로 연결/키 유효성 확인 (실주문 없음)."""
        self.token()
        return {"ok": True, "env": self.env, "base": self.base,
                "account_masked": settings.mask_account()}

    # ── 주문 (⚠ 실주문 — 자동매매 제출에서만 호출) ──
    def submit_entry(self, order: dict) -> dict:
        return self._order("kt10000", order, "BUY")

    def submit_exit(self, order: dict) -> dict:
        return self._order("kt10001", order, "SELL")

    def _order(self, api_id: str, order: dict, side: str) -> dict:
        code = norm_code(order.get("ticker"))
        qty = int(order.get("qty") or order.get("shares") or 0)
        price = order.get("price")
        trde_tp = "03" if not price else "00"   # 03=시장가, 00=지정가
        body = {
            "dmst_stex_tp": "KRX",
            "stk_cd": code,
            "ord_qty": str(qty),
            "ord_uv": str(int(price)) if price else "",
            "trde_tp": trde_tp,
        }
        try:
            resp = self._request(api_id, "/api/dostk/ordr", body)
            rc = resp.get("return_code")
            oid = resp.get("ord_no") or resp.get("order_no") or resp.get("odno")
            # return_code 0=정상. 비0이면 거부(HTTP 200이라도) — 상태/에러 반영
            if rc not in (None, 0, "0"):
                return {"side": side, "ticker": code, "qty": qty, "price": price,
                        "status": "rejected", "broker_order_id": oid,
                        "error": f"{rc}: {resp.get('return_msg')}",
                        "raw_request": body, "raw_response": resp}
            return {"side": side, "ticker": code, "qty": qty, "price": price,
                    "status": "submitted", "broker_order_id": oid,
                    "raw_request": body, "raw_response": resp}
        except KiwoomError as e:
            return {"side": side, "ticker": code, "qty": qty, "price": price,
                    "status": "failed", "error": str(e), "raw_request": body}

    def get_fills(self) -> List[dict]:
        return []   # TODO: 체결내역 TR (Phase 3 재조정)

    # ── 계좌/시세 (읽기전용) — 필드명 문서 확인 후 보정 ──
    def get_account(self) -> dict:
        resp = self._request("kt00018", "/api/dostk/acnt",
                             {"qry_tp": "1", "dmst_stex_tp": "KRX"})
        holdings = []
        rows = resp.get("acnt_evlt_remn_indv_tot") or resp.get("stk_acnt_evlt_prst") or []
        if isinstance(rows, list):
            for h in rows:
                holdings.append({
                    "ticker": norm_code(h.get("stk_cd")),
                    "qty": _num(h.get("rmnd_qty") or h.get("hldg_qty")),
                    "avg_price": _num(h.get("pur_pric") or h.get("avg_prc")),
                    "eval": _num(h.get("evlt_amt") or h.get("evltv_amt")),
                })
        return {
            "cash": _num(resp.get("prsm_dpst_aset_amt") or resp.get("entr") or resp.get("dnca_tot_amt")),
            "total_eval": _num(resp.get("tot_evlt_amt") or resp.get("tot_evlt_asst_amt")),
            "holdings": holdings,
            "raw_keys": list(resp.keys()),   # 실제 필드명 파악용 (디버그)
        }

    def get_price(self, code: str) -> dict:
        resp = self._request("ka10001", "/api/dostk/stkinfo", {"stk_cd": norm_code(code)})
        # 키움 cur_prc 는 등락 방향 부호(±) 접두 → 절대값이 실제가
        raw = _num(resp.get("cur_prc") or resp.get("stck_prpr"))
        return {"code": norm_code(code),
                "price": abs(raw) if raw is not None else None,
                "name": resp.get("stk_nm"),
                "raw_keys": list(resp.keys())}


class AlpacaAdapter:
    """US 실거래 (후속)."""
    name = "alpaca"

    def __init__(self, *_, **__):
        raise NotImplementedError("AlpacaAdapter는 후속 구현")


_ADAPTERS = {
    "manual": ManualForwardAdapter,
    "kiwoom": KiwoomAdapter,
    "alpaca": AlpacaAdapter,
}

# 키움 어댑터는 싱글턴 — 토큰(1h 캐시)을 요청 간 재사용해 발급 rate-limit 회피
_kiwoom_singleton: "KiwoomAdapter | None" = None


def get_kiwoom() -> KiwoomAdapter:
    global _kiwoom_singleton
    if _kiwoom_singleton is None:
        _kiwoom_singleton = KiwoomAdapter()
    return _kiwoom_singleton


def get_adapter(mode: str | None = None) -> ExecutionAdapter:
    mode = mode or settings.EXECUTION_MODE
    if mode == "kiwoom":
        return get_kiwoom()
    cls = _ADAPTERS.get(mode, ManualForwardAdapter)
    return cls()


def display_adapter() -> ManualForwardAdapter:
    """표시 전용 티켓 빌더 (절대 실주문 안 함)."""
    return ManualForwardAdapter()
