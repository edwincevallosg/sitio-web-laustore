#!/usr/bin/env python3
from pathlib import Path
import json, re, sys

if len(sys.argv) != 2 or not sys.argv[1].startswith(('https://','http://')):
    raise SystemExit('Uso: python set-domain.py https://su-dominio.com')
base = sys.argv[1].rstrip('/')
root = Path(__file__).resolve().parent
for p in root.glob('*.html'):
    text = p.read_text(encoding='utf-8')
    text = re.sub(r'<link rel="canonical" href="\./([^\"]+)">', lambda m: f'<link rel="canonical" href="{base}/{m.group(1)}">', text)
    text = text.replace('content="assets/img/og-cover.png"', f'content="{base}/assets/img/og-cover.png"')
    text = text.replace('"url":"./index.html"', f'"url":"{base}/"').replace('"url":"./', f'"url":"{base}/')
    text = text.replace('"logo":"./assets/img/logo.svg"', f'"logo":"{base}/assets/img/logo.svg"').replace('"image":"./assets/img/og-cover.png"', f'"image":"{base}/assets/img/og-cover.png"')
    p.write_text(text, encoding='utf-8')
locs = [p.name for p in root.glob('*.html') if p.name != '404.html']
sitemap = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + ''.join(f'  <url><loc>{base}/{x}</loc><lastmod>2026-10-01</lastmod></url>\n' for x in sorted(locs)) + '</urlset>\n'
(root/'sitemap.xml').write_text(sitemap, encoding='utf-8')
(root/'robots.txt').write_text(f'User-agent: *\nAllow: /\nSitemap: {base}/sitemap.xml\n', encoding='utf-8')
config = json.loads((root/'site.config.json').read_text(encoding='utf-8')); config['baseUrl'] = base; (root/'site.config.json').write_text(json.dumps(config,ensure_ascii=False,indent=2),encoding='utf-8')
print(f'Dominio configurado: {base}')
