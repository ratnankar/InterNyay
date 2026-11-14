set -euo pipefail
sudo install -m 644 internyay-headers.conf /etc/nginx/snippets/internyay-headers.conf
sudo install -m 644 internyay.com.conf /etc/nginx/sites-available/internyay.com
sudo ln -sf /etc/nginx/sites-available/internyay.com /etc/nginx/sites-enabled/internyay.com
sudo nginx -t
sudo systemctl reload nginx
