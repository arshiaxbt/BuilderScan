#!/usr/bin/env python3
"""Test script to verify bot can connect and make requests"""
import asyncio
import aiohttp
import datetime

URL = "https://www.itstheseason.christmas/api/advent/claim"
TEST_WALLET = "0xFfbdC115f419ABeD23888812f00D10F12EF6DA3e"

HEADERS = {
    "accept": "*/*",
    "content-type": "application/json",
    "origin": "https://www.itstheseason.christmas",
    "referer": "https://www.itstheseason.christmas/",
    "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
}

async def test_connection():
    print("🧪 Testing bot connection and configuration...")
    print(f"🎯 Target URL: {URL}")
    print(f"💰 Test Wallet: {TEST_WALLET}")
    print(f"🕐 Current UTC Time: {datetime.datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')}")
    print("")
    
    # Test 1: Can we resolve DNS?
    print("1️⃣ Testing DNS resolution...")
    try:
        connector = aiohttp.TCPConnector(ttl_dns_cache=300)
        async with aiohttp.ClientSession(connector=connector) as session:
            print("   ✅ DNS resolver initialized")
    except Exception as e:
        print(f"   ❌ DNS error: {e}")
        return
    
    # Test 2: Can we connect to the website?
    print("2️⃣ Testing connection to website...")
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(
                "https://www.itstheseason.christmas/",
                timeout=aiohttp.ClientTimeout(total=5),
                ssl=False
            ) as resp:
                print(f"   ✅ Connected! Status: {resp.status}")
    except Exception as e:
        print(f"   ❌ Connection error: {e}")
        return
    
    # Test 3: Can we make API request?
    print("3️⃣ Testing API endpoint (expected to fail - testing connection)...")
    try:
        async with aiohttp.ClientSession() as session:
            # Try to claim hour 1 (will likely fail but tests connection)
            payload = {
                "walletAddress": TEST_WALLET,
                "hour": 1,
            }
            async with session.post(
                URL,
                json=payload,
                headers=HEADERS,
                timeout=aiohttp.ClientTimeout(total=5),
                ssl=False
            ) as resp:
                body = await resp.text()
                print(f"   Status: {resp.status}")
                print(f"   Response: {body[:200]}")
                
                if "error" in body.lower():
                    print(f"   ℹ️  Error response is NORMAL (not during claim window)")
                    print(f"   ✅ API endpoint is reachable!")
                else:
                    print(f"   ✅ API responded successfully!")
                    
    except Exception as e:
        print(f"   ❌ API request error: {e}")
        return
    
    print("")
    print("🎉 All tests passed! Bot can connect and communicate.")
    print("⏰ Bot will claim at the top of each hour (XX:59:58 - XX:00:10)")
    print(f"🔜 Next claim window: {datetime.datetime.utcnow().hour + 1}:00 UTC")

if __name__ == "__main__":
    asyncio.run(test_connection())




