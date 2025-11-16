#!/usr/bin/env python3
"""
Manual claim script for already-unlocked hours
"""
import requests
import time
import random

URL = "https://www.itstheseason.christmas/api/advent/claim"

# Your active wallets
WALLETS = [
    "0x61bc0dBf7f960679124FF9Be26C7617ca10BfEeB",
    "0x55322A6A9ec077a20C9352a75274975e09Ce7f75",
    "0x7529fcdb6f71b13e262dae0ede0d7c9aca5a554c",
]

USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
]

def get_headers():
    return {
        "accept": "*/*",
        "accept-encoding": "gzip, deflate, br",
        "content-type": "application/json",
        "origin": "https://www.itstheseason.christmas",
        "referer": "https://www.itstheseason.christmas/",
        "user-agent": random.choice(USER_AGENTS),
    }

def try_claim(wallet, hour):
    """Try to claim a specific hour with a wallet"""
    payload = {
        "walletAddress": wallet,
        "hour": hour,
    }
    
    try:
        resp = requests.post(URL, json=payload, headers=get_headers(), timeout=5)
        return resp.status_code, resp.text
    except Exception as e:
        return -1, str(e)

def main():
    print("🎯 Manual Claim Script - Attempting Available Hours")
    print("=" * 60)
    print("")
    
    # Try hours 2-10 with each wallet
    claimed = []
    already_claimed = []
    errors = []
    
    for hour in range(2, 11):  # Hours 2-10
        print(f"\n📋 Attempting Hour {hour}...")
        
        for i, wallet in enumerate(WALLETS, 1):
            print(f"   Wallet #{i} ({wallet[:10]}...)... ", end="", flush=True)
            
            status, body = try_claim(wallet, hour)
            
            if status == 200:
                if "Successfully claimed" in body:
                    print("✅ SUCCESS!")
                    claimed.append(f"Hour {hour} with Wallet #{i}")
                else:
                    print(f"⚠️  Status 200 but: {body[:100]}")
            elif status == 409:
                print("⏭️  Already claimed")
                already_claimed.append(f"Hour {hour} (Wallet #{i})")
            elif status == 403:
                if "not unlocked yet" in body:
                    print("🔒 Not unlocked yet")
                else:
                    print(f"❌ 403: {body[:100]}")
                    errors.append(f"Hour {hour} Wallet #{i}: {body[:100]}")
            elif status == 429:
                print("⏸️  Rate limited")
                time.sleep(2)  # Wait before next attempt
            else:
                print(f"❌ Status {status}: {body[:100]}")
                errors.append(f"Hour {hour} Wallet #{i}: {body[:100]}")
            
            # Small delay between attempts
            time.sleep(0.5)
    
    # Summary
    print("\n")
    print("=" * 60)
    print("📊 SUMMARY")
    print("=" * 60)
    
    if claimed:
        print(f"\n✅ NEW CLAIMS ({len(claimed)}):")
        for c in claimed:
            print(f"   • {c}")
    else:
        print("\n❌ No new successful claims")
    
    if already_claimed:
        print(f"\n⏭️  ALREADY CLAIMED ({len(already_claimed)}):")
        for c in already_claimed[:5]:  # Show first 5
            print(f"   • {c}")
        if len(already_claimed) > 5:
            print(f"   ... and {len(already_claimed) - 5} more")
    
    if errors:
        print(f"\n⚠️  ERRORS ({len(errors)}):")
        for e in errors[:5]:
            print(f"   • {e}")
        if len(errors) > 5:
            print(f"   ... and {len(errors) - 5} more")
    
    print("\n" + "=" * 60)
    print("✅ Manual claim attempt completed!")
    print("")

if __name__ == "__main__":
    main()

