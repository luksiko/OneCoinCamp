import hashlib
import hmac
import json
import urllib.parse
import pytest

from camper_monitor.telegram import validate_telegram_init_data


# Test Vector 1: Standard Telegram Mini App payload
BOT_TOKEN_1 = "123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11"
AUTH_DATE_1 = 1710000000
USER_1 = {"id": 123456789, "first_name": "John", "last_name": "Doe", "username": "johndoe"}
QUERY_ID_1 = "AAHdF6IQAAAAAN0XohDhrOrc"
# Expected hash: 2f373971862e44d0e6259cbd3db6d4bc5b704d59af8019340c8f0e392cfe3413
INIT_DATA_1 = (
    "auth_date=1710000000&query_id=AAHdF6IQAAAAAN0XohDhrOrc&user=%7B%22id%22%3A123456789%2C"
    "%22first_name%22%3A%22John%22%2C%22last_name%22%3A%22Doe%22%2C%22username%22%3A%22johndoe%22%7D"
    "&hash=2f373971862e44d0e6259cbd3db6d4bc5b704d59af8019340c8f0e392cfe3413"
)

# Test Vector 2: Payload with chat_instance and chat_type
BOT_TOKEN_2 = "987654:XYZ-UVW9876abCde-rst12A3b4c567de89"
AUTH_DATE_2 = 1725000000
USER_2 = {"id": 99887766, "first_name": "Alice", "username": "alice_tg"}
# Expected hash: 8f56a2e32ad57eef3860b18292c9d4051f9bca8311fb0b0a3346aeb58159845a
INIT_DATA_2 = (
    "auth_date=1725000000&chat_instance=8472947291823749&chat_type=sender&user=%7B%22id%22%3A99887766%2C"
    "%22first_name%22%3A%22Alice%22%2C%22username%22%3A%22alice_tg%22%7D"
    "&hash=8f56a2e32ad57eef3860b18292c9d4051f9bca8311fb0b0a3346aeb58159845a"
)


def test_signature_test_vector_1_valid():
    res = validate_telegram_init_data(
        init_data=INIT_DATA_1,
        bot_token=BOT_TOKEN_1,
        allowed_ids=["123456789"],
        current_time=AUTH_DATE_1 + 10,
    )
    assert res["user"]["id"] == 123456789
    assert res["user"]["username"] == "johndoe"
    assert res["auth_date"] == 1710000000


def test_signature_test_vector_2_valid_by_username():
    res = validate_telegram_init_data(
        init_data=INIT_DATA_2,
        bot_token=BOT_TOKEN_2,
        allowed_ids=["alice_tg"],
        current_time=AUTH_DATE_2 + 20,
    )
    assert res["user"]["id"] == 99887766
    assert res["user"]["username"] == "alice_tg"


def test_missing_init_data():
    with pytest.raises(ValueError, match="Missing Telegram WebApp initData"):
        validate_telegram_init_data("", BOT_TOKEN_1)
    with pytest.raises(ValueError, match="Missing Telegram WebApp initData"):
        validate_telegram_init_data(None, BOT_TOKEN_1)


def test_missing_hash():
    data_without_hash = "auth_date=1710000000&query_id=AAH"
    with pytest.raises(ValueError, match="missing hash"):
        validate_telegram_init_data(data_without_hash, BOT_TOKEN_1)


def test_missing_auth_date():
    data = "query_id=AAH&hash=2f373971862e44d0e6259cbd3db6d4bc5b704d59af8019340c8f0e392cfe3413"
    with pytest.raises(ValueError, match="missing auth_date"):
        validate_telegram_init_data(data, BOT_TOKEN_1)


def test_invalid_signature_tampered_data():
    tampered = INIT_DATA_1.replace("AAHdF6IQAAAAAN0XohDhrOrc", "TAMPERED_QUERY_ID")
    with pytest.raises(ValueError, match="Invalid Telegram WebApp initData signature"):
        validate_telegram_init_data(
            tampered,
            BOT_TOKEN_1,
            allowed_ids=["123456789"],
            current_time=AUTH_DATE_1 + 10,
        )


def test_invalid_signature_wrong_bot_token():
    with pytest.raises(ValueError, match="Invalid Telegram WebApp initData signature"):
        validate_telegram_init_data(
            INIT_DATA_1,
            "WRONG_BOT_TOKEN",
            allowed_ids=["123456789"],
            current_time=AUTH_DATE_1 + 10,
        )


def test_expired_auth_date():
    with pytest.raises(ValueError, match="Telegram WebApp initData expired"):
        validate_telegram_init_data(
            INIT_DATA_1,
            BOT_TOKEN_1,
            allowed_ids=["123456789"],
            max_age_seconds=3600,
            current_time=AUTH_DATE_1 + 3601,
        )


def test_future_auth_date():
    with pytest.raises(ValueError, match="auth_date is in the future"):
        validate_telegram_init_data(
            INIT_DATA_1,
            BOT_TOKEN_1,
            allowed_ids=["123456789"],
            current_time=AUTH_DATE_1 - 400,
        )


def test_unauthorized_user_rejected():
    with pytest.raises(ValueError, match="Unauthorized Telegram user"):
        validate_telegram_init_data(
            INIT_DATA_1,
            BOT_TOKEN_1,
            allowed_ids=["999999999"],
            current_time=AUTH_DATE_1 + 10,
        )


def test_no_allowed_ids_configured_rejected():
    with pytest.raises(ValueError, match="No authorized Telegram users or chats configured"):
        validate_telegram_init_data(
            INIT_DATA_1,
            BOT_TOKEN_1,
            allowed_ids=[],
            current_time=AUTH_DATE_1 + 10,
        )
