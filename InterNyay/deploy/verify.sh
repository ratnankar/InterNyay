set -u
base=https://internyay.com
check() { printf '%-58s %s\n' "$1" "$2"; }
check "home status" "$(curl -s -o /dev/null -w '%{http_code}' $base/)"
check "home contains h1" "$(curl -s $base/ | grep -c '<h1')"
check "unknown path status (expect 404)" "$(curl -s -o /dev/null -w '%{http_code}' $base/no-such-page)"
check "robots.txt status" "$(curl -s -o /dev/null -w '%{http_code}' $base/robots.txt)"
check "sitemap.xml status" "$(curl -s -o /dev/null -w '%{http_code}' $base/sitemap.xml)"
check "www -> apex (expect 301 $base/)" "$(curl -s -o /dev/null -w '%{http_code} %{redirect_url}' https://www.internyay.com/)"
check "http -> https apex (expect 301)" "$(curl -s -o /dev/null -w '%{http_code} %{redirect_url}' http://internyay.com/)"
check "login X-Robots-Tag" "$(curl -sI $base/login | grep -i '^x-robots-tag' | tr -d '\r')"
