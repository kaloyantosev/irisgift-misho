import urllib.request
import re

url = 'https://irispay.eu/resource/min/g=public_css?b441dc7a'
req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
try:
    with urllib.request.urlopen(req) as resp:
        css = resp.read().decode('utf-8', errors='ignore')
        print("CSS length:", len(css))
        fonts = set(re.findall(r'font-family\s*:\s*([^;]+);', css))
        for f in sorted(fonts):
            print("Found font:", f.strip())
        imports = re.findall(r'@import[^;]+;', css)
        print("Imports:", imports)
        font_faces = re.findall(r'@font-face\s*\{[^}]+\}', css)
        for ff in font_faces[:5]:
            print("Font face:", ff)
except Exception as e:
    print("Error:", e)
