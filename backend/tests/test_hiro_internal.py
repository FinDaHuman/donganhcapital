import os
import unittest
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi import HTTPException, Request

from routers.chat import ChatMessage, ChatRequest, hiro_internal_message, _require_hiro_token


def request_with_token(token: str = "") -> Request:
    headers = []
    if token:
        headers.append((b"x-hiro-token", token.encode()))
    return Request({"type": "http", "method": "POST", "path": "/", "headers": headers})


class HiroTokenTests(unittest.TestCase):
    def test_bridge_fails_closed_when_secret_is_missing(self):
        with patch.dict(os.environ, {}, clear=True):
            with self.assertRaises(HTTPException) as raised:
                _require_hiro_token(request_with_token("anything"))
        self.assertEqual(raised.exception.status_code, 401)

    def test_bridge_accepts_matching_secret(self):
        with patch.dict(os.environ, {"HIRO_INTERNAL_TOKEN": "shared-secret"}, clear=True):
            _require_hiro_token(request_with_token("shared-secret"))


class HiroEndpointTests(unittest.IsolatedAsyncioTestCase):
    async def test_internal_endpoint_skips_product_quota(self):
        body = ChatRequest(messages=[ChatMessage(role="user", content="Xin chào Hiro")])
        quota = MagicMock()
        with (
            patch.dict(os.environ, {"HIRO_INTERNAL_TOKEN": "shared-secret"}, clear=True),
            patch("routers.chat._ground_for_message_sync", return_value=""),
            patch("routers.chat._consume_quota_sync", quota),
            patch("routers.chat.generate", new=AsyncMock(return_value="Xin chào")),
        ):
            response = await hiro_internal_message(
                body, request_with_token("shared-secret"), None
            )

        self.assertEqual(response, {"reply": "Xin chào"})
        quota.assert_not_called()


if __name__ == "__main__":
    unittest.main()
