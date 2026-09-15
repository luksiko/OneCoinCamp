from __future__ import annotations

import json
import time
from collections.abc import Mapping
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


class FetchError(RuntimeError):
    pass


class JsonHttpClient:
    def __init__(self, timeout_seconds: int, retries: int = 2) -> None:
        self.timeout_seconds = timeout_seconds
        self.retries = retries

    def get(self, url: str, headers: Mapping[str, str] | None = None) -> Any:
        request = Request(url, headers=dict(headers or {}), method="GET")
        for attempt in range(self.retries + 1):
            try:
                with urlopen(request, timeout=self.timeout_seconds) as response:
                    return json.loads(response.read().decode("utf-8"))
            except HTTPError as error:
                if error.code not in {429, 500, 502, 503, 504} or attempt == self.retries:
                    raise FetchError(f"GET {url} failed with HTTP {error.code}") from error
            except (TimeoutError, URLError, json.JSONDecodeError) as error:
                if attempt == self.retries:
                    raise FetchError(f"GET {url} failed: {error}") from error
            time.sleep(2**attempt)
        raise AssertionError("unreachable")

    def post(
        self,
        url: str,
        payload: Mapping[str, Any],
        headers: Mapping[str, str] | None = None,
    ) -> Any:
        body = json.dumps(payload).encode("utf-8")
        req_headers = {"Content-Type": "application/json"}
        if headers:
            req_headers.update(headers)
        request = Request(
            url,
            data=body,
            headers=req_headers,
            method="POST",
        )
        try:
            with urlopen(request, timeout=self.timeout_seconds) as response:
                return json.loads(response.read().decode("utf-8"))
        except (HTTPError, TimeoutError, URLError, json.JSONDecodeError) as error:
            raise FetchError(f"POST {url} failed: {error}") from error
