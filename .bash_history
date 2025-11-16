ls
journalctl -u valshi-x -f
top
journalctl -u valshi-x -f
systemctl status valshi-x
journalctl -u valshi-x -f
ps aux | grep bot.py
grep "WHALE_THRESHOLD" /root/valshi-x/credentials.py
journalctl -u valshi-x -f
journalctl -u valshi-x.service -f | grep -i whale
journalctl -u valshi-x.service -f
cd /root/valshi-x
# Push with your GitHub token
git push https://arshiaxbt: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@github.com/arshiaxbt/valshi-x.git main
cd /root/valshi-x
git push origin main
sudo journalctl -u valshi-bot.service --output cat -n 80
sudo journalctl -u valshi-bot -f
sudo systemctl restart valshi-bot
systemctl status valshi-x.service --no-pager -l | head -30
sudo journalctl -u valshi-bot -f
sudo journalctl -u valshi-x.service --output cat -n 80
sudo journalctl -u valshi-bot -f
systemctl status valshi-x.service --no-pager -l | head -30
/root/itsbot/manage.sh claims
/root/itsbot/manage.sh logs
/root/itsbot/manage.sh status
/root/itsbot/manage.sh stats
/root/itsbot/manage.sh claims
tail -f /root/itsbot/advent_log_fast_0.txt
tail -f /root/itsbot/systemd_output.log
/root/itsbot/monitor.sh
tail -f /root/itsbot/advent_log_fast_0.txt
/root/itsbot/watch_next_claim.sh
tail -f /root/itsbot/systemd_output.log
tail -3 /root/itsbot/systemd_output.log
tail -f /root/itsbot/systemd_output.log
grep "status=409" /root/itsbot/advent_log_fast_0.txt | grep -o "wallet=0x[^[:space:]]*" | sort -u
grep "Successfully claimed" /root/itsbot/advent_log_fast_0.txt
grep "status=200" /root/itsbot/advent_log_fast_0.txt
tail -f /root/itsbot/systemd_output.log
tail -f /root/itsbot/advent_log_fast_0.txt
tail -f /root/itsbot/systemd_output.log
tail -f /root/itsbot/advent_log_fast_0.txt
# لیست ساب‌دامین‌ها را همین‌جا کپی کن و اجرا کن
subs=( fuzzy.megaeth.com stash.megaeth.com testnetv2-dashboard.megaeth.com github.megaeth.com verify.megaeth.com coriander.megaeth.com uptime-v2.megaeth.com alpha.megaeth.com uptime.megaeth.com carrot.megaeth.com game.megaeth.com static.megaeth.com timothy.megaeth.com www.megaeth.com nft.megaeth.com token.megaeth.com docs.megaeth.com testnet.megaeth.com perftest.megaeth.com testnet-dashboard.megaeth.com main.megaeth.com megaeth.com old.megaeth.com sistema.megaeth.com mobile.megaeth.com ghe.megaeth.com events.megaeth.com ecommerce.megaeth.com quiz.megaeth.com aws.megaeth.com burrow.megaeth.com learning.megaeth.com developer.megaeth.com )
echo -e "subdomain,first_wayback_snapshot_iso8601"
for s in "${subs[@]}"; do
  ts=$(curl -s "http://web.archive.org/cdx/search/cdx?url=https://$s/*&output=json&limit=1&filter=statuscode:200&from=2010&to=2025&collapse=digest" \
        | jq -r '.[1][1]' 2>/dev/null);   if [[ -n "$ts" && "$ts" != "null" ]]; then
    iso=$(date -u -j -f "%Y%m%d%H%M%S" "$ts" "+%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || date -u -d "$ts" "+%Y-%m-%dT%H:%M:%SZ" 2>/dev/null);     echo "$s,$iso";   else     echo "$s,NO_WAYBACK_CAPTURE";   fi; done
cd /root/itsbot
git remote add origin https://github.com/arshiaxbt/its-xmas.git
git push -u origin main
cd /root/itsbot
git remote add origin https://github.com/arshiaxbt/its-xmas.git
git push -u origin main
