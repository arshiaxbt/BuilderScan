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

# Wallet addresses (removed already claimed wallets)
WALLETS: list[str] = [
    # "0xFfbdC115f419ABeD23888812f00D10F12EF6DA3e",  # REMOVED - Already claimed hour 1
    "0x61bc0dBf7f960679124FF9Be26C7617ca10BfEeB",
    "0x55322A6A9ec077a20C9352a75274975e09Ce7f75",
    "0x7529fcdb6f71b13e262dae0ede0d7c9aca5a554c",
    "",  "",  "",  "",  "",  "",
    "",  "",  "",  "",  "",  "",
    "",  "",  "",  "",  "",  "",
    "",  "",  "",
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
    """More aggressive burst window for FCFS with randomization"""
    m = now_utc.minute
    s = now_utc.second
    ms = now_utc.microsecond
    
    # Randomized start time between 59:57 and 59:59 to avoid detection
    burst_start = 58 + random_offset
    
    # Start earlier with randomization
    if m == 59 and s >= burst_start:
        return True
    # Extended window up to 00:10 for retries
    if m == 0 and s <= 10:
        return True
    return False


def in_prepare_window(now_utc: datetime.datetime) -> bool:
    """Earlier prep window for connection warming"""
    return (now_utc.minute == 59 and 50 <= now_utc.second <= 57)


def get_submit_hour(now_utc: datetime.datetime) -> int:
    h = now_utc.hour
    if now_utc.minute == 59:
        return (h + 1) % 24
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
    """Send multiple concurrent requests for FCFS advantage"""
    tasks = []
    for i in range(BURST_ATTEMPTS):
        task = asyncio.create_task(send_claim_request(session, wallet, hour, log_file, i+1))
        tasks.append(task)
        # Stagger launches slightly (microseconds) for better timing spread
        if i < BURST_ATTEMPTS - 1:
            await asyncio.sleep(0.001)  # 1ms delay between launches
    
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
        async with session.get(
            "https://www.itstheseason.christmas/",
            headers=HEADERS,
            timeout=aiohttp.ClientTimeout(total=3),
            ssl=False
        ):
            pass
    except Exception:
        pass


async def main(wallet_offset: int):
    """Main async loop with speed optimizations"""
    log_file = f"advent_log_fast_{wallet_offset}.txt"
    
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
        print(f"💰 Configured wallets: {NUM_WALLETS}")
        if NUM_WALLETS > 0:
            print(f"🎯 Wallets will cycle: {', '.join([w[:10]+'...' for w in CONFIGURED_WALLETS])}")
        print(f"📝 Logging to {log_file}")
        
        while True:
            now_utc = datetime.datetime.utcnow()
            utc_minute = now_utc.minute
            utc_second = now_utc.second
            utc_hour = now_utc.hour
            
            # (1) Connection warming - start earlier
            if in_prepare_window(now_utc):
                if warmed_up_for_this_hour != utc_hour:
                    print(f"🔥 Warming up connections for hour {utc_hour}...")
                    # Warm multiple times for better connection state
                    await asyncio.gather(
                        warm_connection(session),
                        warm_connection(session),
                        warm_connection(session)
                    )
                    warmed_up_for_this_hour = utc_hour
            
            # (2) Burst attack window
            if in_burst_window(now_utc):
                submit_hour = get_submit_hour(now_utc) + 1
                
                # Only attack once per hour to avoid spam
                if last_burst_hour != submit_hour:
                    last_burst_hour = submit_hour  # Set immediately to prevent re-attacking
                    
                    if NUM_WALLETS > 0:
                        # Cycle through configured wallets only
                        wallet_index = (get_submit_hour(now_utc) + wallet_offset) % NUM_WALLETS
                        wallet = CONFIGURED_WALLETS[wallet_index]
                        
                        print(f"⚡ BURST ATTACK: Hour {submit_hour}, Wallet #{wallet_index+1} ({wallet[:10]}...), Time: {utc_minute}:{utc_second:02d}")
                        success = await burst_attack(session, wallet, submit_hour, log_file)
                        if success:
                            print(f"✅ Successfully claimed hour {submit_hour}!")
                    else:
                        print(f"❌ ERROR: No wallets configured! Add wallets to WALLETS array.")
                    
                # Very short sleep during burst window
                await asyncio.sleep(0.05)  # 50ms
                continue
            
            # (3) Minimal sleep during waiting period
            await asyncio.sleep(0.1)  # 100ms for responsiveness


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Optimized FCFS claim bot")
    parser.add_argument("--offset", type=int, default=0, help="wallet index offset (default: 0)")
    args = parser.parse_args()
    
    # Run the async main loop
    asyncio.run(main(args.offset))

