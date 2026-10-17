import base64

with open('frontend/public/favicon.png', 'rb') as f:
    b64 = base64.b64encode(f.read()).decode('utf-8')

svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="128" height="128">
  <image href="data:image/png;base64,{b64}" x="0" y="0" width="128" height="128" />
</svg>'''

with open('frontend/public/favicon.svg', 'w', encoding='utf-8') as f:
    f.write(svg)
with open('brand-assets/favicon.svg', 'w', encoding='utf-8') as f:
    f.write(svg)

print('favicon.svg created successfully!')
