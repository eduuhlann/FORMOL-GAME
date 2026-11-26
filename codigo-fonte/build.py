"""Gera 'JOGAR - FORMOL.html' (arquivo único) a partir de shell.html + three.min.js + áudio + game.js.
Uso:  python build.py      (rode dentro da pasta codigo-fonte)"""
import os, base64, json
here = os.path.dirname(os.path.abspath(__file__))
root = os.path.dirname(here)
shell = open(os.path.join(here, 'shell.html'), encoding='utf-8').read()
three = open(os.path.join(here, 'vendor', 'three.min.js'), encoding='utf-8').read()
game = open(os.path.join(here, 'game.js'), encoding='utf-8').read()
aud = {}
for sub in ('narracao', 'passos', 'altofalante'):
    d = os.path.join(root, 'audio', sub)
    for f in sorted(os.listdir(d)):
        if f.endswith('.mp3'):
            aud[f[:-4]] = base64.b64encode(open(os.path.join(d, f), 'rb').read()).decode()
out = (shell.replace('<script>/*THREE*/</script>', '<script>' + three + '</script>')
            .replace('<script>/*AUDIO*/</script>', '<script>window.FORMOL_AUDIO=' + json.dumps(aud) + ';</script>')
            .replace('<script>/*GAME*/</script>', '<script>' + game + '</script>'))
open(os.path.join(root, 'JOGAR - FORMOL.html'), 'w', encoding='utf-8').write(out)
print('ok:', len(aud), 'áudios embutidos')
