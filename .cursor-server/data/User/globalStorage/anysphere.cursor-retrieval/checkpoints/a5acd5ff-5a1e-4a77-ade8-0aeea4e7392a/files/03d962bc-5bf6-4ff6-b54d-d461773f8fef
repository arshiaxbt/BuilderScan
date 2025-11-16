# OPTIMIZED VERSION - Run with python3 main_fast.py --offset N
# Speed optimizations: async requests, concurrent attempts, pre-warmed connections, faster timeouts
# Anti-detection: randomized timing, rotating user agents, human-like patterns
import datetime
import asyncio
import aiohttp
import argparse
import time
import random
import hashlib

URL = "https://www.itstheseason.christmas/api/advent/claim"

# Wallet addresses (FRESH WALLETS - Nov 12, 2025)
WALLETS: list[str] = [
    "0x51F67055A21Ae66C86C65d594D93E07dF1AEd6Ea",  # Fresh wallet 1
    "0x3Ee6ed7ee96A5901426963b8a756dC7ca33c6191",  # Fresh wallet 2
    "0x4058cd8733f6b4d64bdb95df669e35c63033a708",  # Fresh wallet 3
    "",  "",  "",  "",  "",  "",
    "",  "",  "",  "",  "",  "",
    "",  "",  "",  "",  "",  "",
    "",  "",
]

# Get only configured (non-empty) wallets
CONFIGURED_WALLETS = [w for w in WALLETS if w]
NUM_WALLETS = len(CONFIGURED_WALLETS)

# Rotating user agents to avoid detection
USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:122.0) Gecko/20100101 Firefox/122.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15",
]

def get_random_headers():
    """Generate randomized headers to avoid detection"""
    return {
        "accept": "*/*",
        "accept-encoding": "gzip, deflate, br",
        "accept-language": random.choice([
            "en-US,en;q=0.9",
            "en-GB,en;q=0.9,en-US;q=0.8",
            "en-US,en;q=0.9,es;q=0.8",
        ]),
        "content-type": "application/json",
        "origin": "https://www.itstheseason.christmas",
        "referer": "https://www.itstheseason.christmas/",
        "user-agent": random.choice(USER_AGENTS),
        "sec-ch-ua": f'"Chromium";v="{random.randint(118, 122)}", "Not_A Brand";v="8"',
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": random.choice(['"Windows"', '"macOS"', '"Linux"']),
        "sec-fetch-dest": "empty",
        "sec-fetch-mode": "cors",
        "sec-fetch-site": "same-origin",
        "cache-control": "no-cache",
        "pragma": "no-cache",
    }

# Speed optimizations
BURST_ATTEMPTS_MIN = 7  # Minimum concurrent attempts
BURST_ATTEMPTS_MAX = 12  # Maximum concurrent attempts (randomized)
TIMEOUT = 2.0  # Reduced timeout for faster failure recovery
CONNECTOR_LIMIT = 20  # Connection pool size


def in_burst_window(now_utc: datetime.datetime, random_offset: int = 0) -> bool:
    """Burst window AFTER hour changes when it's actually unlocked"""
    m = now_utc.minute
    s = now_utc.second
    ms = now_utc.microsecond
    
    # Attack RIGHT AFTER hour changes (when hour unlocks)
    # Start at 00:00 with small random offset for FCFS advantage
    if m == 0 and s <= 8:  # 0-8 seconds after hour change
        return True
    return False


def in_prepare_window(now_utc: datetime.datetime) -> bool:
    """Earlier prep window for connection warming"""
    return (now_utc.minute == 59 and 50 <= now_utc.second <= 57)


def get_submit_hour(now_utc: datetime.datetime) -> int:
    """Get the hour that just unlocked (1-24 for advent calendar)"""
    h = now_utc.hour
    # Advent calendar uses hours 1-24, not 0-23
    # Hour 0 (midnight UTC) = hour 24
    if h == 0:
        return 24
    return h


async def log_request(log_file: str, ts_utc: datetime.datetime, hour: int, wallet: str, status: int, body: str, error: str = ""):
    """Async logging to not block main loop"""
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
    
    # Non-blocking file write
    loop = asyncio.get_event_loop()
    await loop.run_in_executor(None, _write_log, log_file, line)


def _write_log(log_file: str, line: str):
    """Sync log writer for executor"""
    with open(log_file, "a", encoding="utf-8") as f:
        f.write(line)


async def send_claim_request(session: aiohttp.ClientSession, wallet: str, hour: int, log_file: str, attempt: int):
    """Send a single claim request with anti-detection measures"""
    # Add random delay to make requests less uniform (0-50ms jitter)
    await asyncio.sleep(random.uniform(0, 0.05))
    
    payload = {
        "walletAddress": wallet,
        "hour": hour,
    }
    
    now_utc = datetime.datetime.utcnow()
    
    # Use randomized headers for each request
    headers = get_random_headers()
    
    try:
        async with session.post(
            URL,
            json=payload,
            headers=headers,
            timeout=aiohttp.ClientTimeout(total=TIMEOUT),
            ssl=False  # Skip SSL verification for speed (use with caution)
        ) as resp:
            body_str = await resp.text()
            await log_request(log_file, now_utc, hour, wallet, resp.status, body_str)
            
            # Return success status
            if resp.status == 200 and "Successfully claimed" in body_str:
                return True, body_str
            return False, body_str
            
    except asyncio.TimeoutError:
        await log_request(log_file, now_utc, hour, wallet, -1, "", error=f"Timeout (attempt {attempt})")
        return False, "timeout"
    except Exception as e:
        await log_request(log_file, now_utc, hour, wallet, -1, "", error=f"{str(e)} (attempt {attempt})")
        return False, str(e)


async def burst_attack(session: aiohttp.ClientSession, wallet: str, hour: int, log_file: str):
    """Send multiple concurrent requests with randomization to avoid detection"""
    # Randomize number of attempts to avoid predictable patterns
    num_attempts = random.randint(BURST_ATTEMPTS_MIN, BURST_ATTEMPTS_MAX)
    
    tasks = []
    for i in range(num_attempts):
        task = asyncio.create_task(send_claim_request(session, wallet, hour, log_file, i+1))
        tasks.append(task)
        # Randomized stagger between launches (0.5-2ms) to avoid detection
        if i < num_attempts - 1:
            await asyncio.sleep(random.uniform(0.0005, 0.002))
    
    # Wait for all attempts
    results = await asyncio.gather(*tasks, return_exceptions=True)
    
    # Check if any succeeded
    for result in results:
        if isinstance(result, tuple) and len(result) == 2:
            success, body = result
            if success:
                return True
    
    return False


async def warm_connection(session: aiohttp.ClientSession):
    """Pre-warm the connection with DNS resolution and TCP handshake"""
    try:
        # Use randomized headers for warmup too
        headers = get_random_headers()
        async with session.get(
            "https://www.itstheseason.christmas/",
            headers=headers,
            timeout=aiohttp.ClientTimeout(total=3),
            ssl=False
        ):
            pass
    except Exception:
        pass


async def main(wallet_offset: int):
    """Main async loop with speed optimizations and anti-detection"""
    log_file = f"advent_log_fast_{wallet_offset}.txt"
    
    # Generate a random timing offset for this session (-1 to 1 second)
    # This makes each bot instance slightly different
    timing_offset = random.randint(-1, 1)
    
    # Optimized connector with connection pooling and keep-alive
    connector = aiohttp.TCPConnector(
        limit=CONNECTOR_LIMIT,
        limit_per_host=CONNECTOR_LIMIT,
        ttl_dns_cache=300,  # DNS cache for 5 minutes
        force_close=False,  # Keep connections alive
        enable_cleanup_closed=True
    )
    
    # Create persistent session
    async with aiohttp.ClientSession(connector=connector) as session:
        warmed_up_for_this_hour = None
        last_burst_hour = None
        
        print(f"🚀 Fast bot started with offset {wallet_offset}")
        print(f"🎭 Anti-detection: Randomized timing, rotating user agents")
        print(f"💰 Configured wallets: {NUM_WALLETS}")
        if NUM_WALLETS > 0:
            print(f"🎯 Wallets will cycle: {', '.join([w[:10]+'...' for w in CONFIGURED_WALLETS])}")
        print(f"📝 Logging to {log_file}")
        print(f"⏱️  Timing offset: {timing_offset}s (unique per session)")
        
        while True:
            now_utc = datetime.datetime.utcnow()
            utc_minute = now_utc.minute
            utc_second = now_utc.second
            utc_hour = now_utc.hour
            
            # (1) Connection warming - with randomized timing
            warmup_start = 50 + random.randint(-2, 2)  # 48-52 seconds
            if utc_minute == 59 and warmup_start <= utc_second <= 57:
                if warmed_up_for_this_hour != utc_hour:
                    print(f"🔥 Warming up connections for hour {utc_hour}...")
                    # Warm multiple times with random delays
                    await warm_connection(session)
                    await asyncio.sleep(random.uniform(0.1, 0.3))
                    await warm_connection(session)
                    await asyncio.sleep(random.uniform(0.1, 0.3))
                    await warm_connection(session)
                    warmed_up_for_this_hour = utc_hour
            
            # (2) Burst attack window - AFTER hour changes (when unlocked)
            if in_burst_window(now_utc, timing_offset):
                submit_hour = get_submit_hour(now_utc)  # Current hour (just unlocked)
                
                # Only attack once per hour to avoid spam
                if last_burst_hour != submit_hour:
                    last_burst_hour = submit_hour  # Set immediately to prevent re-attacking
                    
                    if NUM_WALLETS > 0:
                        # Cycle through configured wallets only
                        wallet_index = (submit_hour + wallet_offset) % NUM_WALLETS
                        wallet = CONFIGURED_WALLETS[wallet_index]
                        
                        print(f"⚡ BURST ATTACK: Hour {submit_hour}, Wallet #{wallet_index+1} ({wallet[:10]}...), Time: {utc_hour}:{utc_minute}:{utc_second:02d}")
                        success = await burst_attack(session, wallet, submit_hour, log_file)
                        if success:
                            print(f"✅ Successfully claimed hour {submit_hour}!")
                    else:
                        print(f"❌ ERROR: No wallets configured! Add wallets to WALLETS array.")
                    
                # Randomized sleep during burst window (40-60ms)
                await asyncio.sleep(random.uniform(0.04, 0.06))
                continue
            
            # (3) Randomized sleep during waiting period (80-120ms)
            await asyncio.sleep(random.uniform(0.08, 0.12))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Optimized FCFS claim bot")
    parser.add_argument("--offset", type=int, default=0, help="wallet index offset (default: 0)")
    args = parser.parse_args()
    
    # Run the async main loop
    asyncio.run(main(args.offset))

