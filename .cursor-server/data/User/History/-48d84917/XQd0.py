# Run with python3 main.py --offset N (N is just any integer, for shift wallet index)
import datetime
import time
import requests
import argparse

URL = "https://www.itstheseason.christmas/api/advent/claim"

# 24개 지갑 주소 배열 - FRESH WALLETS (Nov 12, 2025)
WALLETS: list[str] = [
    # "0x51F67055A21Ae66C86C65d594D93E07dF1AEd6Ea",  # REMOVED - Got 409 at hour 12
    "0x3Ee6ed7ee96A5901426963b8a756dC7ca33c6191",  # Fresh wallet 1
    "0x4058cd8733f6b4d64bdb95df669e35c63033a708",  # Fresh wallet 2
    "",  # 

    "",  # 
    "",  # 
    "",  # 
    "",  # 
    "",  # 

    "",  # 
    "",  # 
    "",  # 
    "",  # 
    "",  # 

    "",  # 
    "",  # 
    "",  # 
    "",  # 
    "",  # 

    "",  # 
    "",  # 
    "",  # 
    "",  # 
]

# Get only configured (non-empty) wallets
CONFIGURED_WALLETS = [w for w in WALLETS if w]
NUM_WALLETS = len(CONFIGURED_WALLETS)

HEADERS = {
    "accept": "*/*",
    "accept-encoding": "gzip, deflate",
    "accept-language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
    "cache-control": "no-cache",
    "content-type": "application/json",
    "origin": "https://www.itstheseason.christmas",
    "pragma": "no-cache",
    "priority": "u=1, i",
    "referer": "https://www.itstheseason.christmas/",
    "sec-ch-ua": '"Google Chrome";v="135", "Not-A.Brand";v="8", "Chromium";v="135"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"Windows"',
    "sec-fetch-dest": "empty",
    "sec-fetch-mode": "cors",
    "sec-fetch-site": "same-origin",
    "user-agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/135.0.0.0 Safari/537.36"
    ),
}


def in_burst_window(now_utc: datetime.datetime) -> bool:
    """Burst window AFTER hour changes when it's actually unlocked"""
    m = now_utc.minute
    s = now_utc.second
    # Attack RIGHT AFTER hour changes (when hour unlocks)
    if m == 0 and s <= 8:
        return True
    return False


def in_prepare_window(now_utc: datetime.datetime) -> bool:
    # Earlier warmup for better connection state
    return (now_utc.minute == 59 and 50 <= now_utc.second <= 57)


def get_submit_hour(now_utc: datetime.datetime) -> int:
    """Get the hour that just unlocked (1-24 for advent calendar)"""
    h = now_utc.hour
    # Advent calendar uses hours 1-24, not 0-23
    # Hour 0 (midnight UTC) = hour 24
    if h == 0:
        return 24
    return h


def log_request(log_file: str, ts_utc: datetime.datetime, hour: int, wallet: str, status: int, body: str, error: str = ""):
    line = (
        f"{ts_utc.isoformat()}Z\t"
        f"hour={hour}\t"
        f"wallet={wallet}\t"
        f"status={status}\t"
    )
    if error:
        line += f"error={error}\n"
    else:
        short = body.replace("\n", " ")
        if len(short) > 500:
            short = short[:500] + "...(truncated)"
        line += f"body={short}\n"

    with open(log_file, "a", encoding="utf-8") as f:
        f.write(line)


def main(wallet_offset: int):
    session = requests.Session()
    # Performance optimizations
    session.mount('https://', requests.adapters.HTTPAdapter(
        pool_connections=10,
        pool_maxsize=20,
        max_retries=0  # No retries for speed
    ))
    warmed_up_for_this_hour = None

    # offset 따라 로그 파일 이름 바꿈
    log_file = f"advent_log_2_{wallet_offset}.txt"

    while True:
        now_utc = datetime.datetime.utcnow()
        utc_minute = now_utc.minute
        utc_second = now_utc.second
        utc_hour = now_utc.hour

        # (1) 예열 - Multiple warmups for better connection state
        if in_prepare_window(now_utc):
            if warmed_up_for_this_hour != utc_hour:
                try:
                    # Warm up connection multiple times
                    for _ in range(3):
                        session.get("https://www.itstheseason.christmas/", headers=HEADERS, timeout=2)
                        time.sleep(0.5)
                except Exception:
                    pass
                warmed_up_for_this_hour = utc_hour

        # (2) 폭격 - Attack AFTER hour changes (when unlocked)
        if in_burst_window(now_utc):
            submit_hour = get_submit_hour(now_utc)  # Current hour (just unlocked)
            
            if NUM_WALLETS == 0:
                print(f"❌ ERROR: No wallets configured!")
                time.sleep(1)
                continue
                
            # Cycle through configured wallets only
            wallet_index = (submit_hour + wallet_offset) % NUM_WALLETS
            wallet = CONFIGURED_WALLETS[wallet_index]

            payload = {
                "walletAddress": wallet,
                "hour": submit_hour,
            }
            try:
                # Reduced timeout for faster attempts
                resp = session.post(
                    URL,
                    json=payload,
                    headers=HEADERS,
                    timeout=2,
                )
                body_str = resp.text
                log_request(log_file, now_utc, submit_hour, wallet, resp.status_code, body_str)
                
                # If successful, log it
                if "Successfully claimed" in body_str:
                    print(f"✓ Successfully claimed hour {submit_hour}!")
            except Exception as e:
                log_request(log_file, now_utc, submit_hour, wallet, -1, "", error=str(e))
            
            # Minimal sleep for rapid retries during burst
            time.sleep(0.05)
            continue

        # (3) 대기
        if not (
            (utc_minute == 0 and utc_second >= 3)
            or (1 <= utc_minute <= 58)
            or (utc_minute == 59 and utc_second <= 55)
        ):
            continue

        # Reduced sleep for faster response time
        time.sleep(0.1)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--offset", type=int, default=1, help="wallet index offset for shift (default: 1)")
    args = parser.parse_args()
    main(args.offset)
