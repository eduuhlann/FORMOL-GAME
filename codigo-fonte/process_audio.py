"""Processa os MP3 da ElevenLabs para o jogo.
narr*.mp3  -> recorta silêncio, normaliza (-16 LUFS), mono 64 kbps -> audio/narrN.mp3
sfx_*.mp3  -> detecta cada passo (onsets), recorta ~0.45 s por passo, normaliza, mono 96 kbps -> audio/step_<tipo>_<i>.mp3
"""
import os, re, subprocess, sys, glob
import numpy as np
import os
HERE=os.path.dirname(os.path.abspath(__file__)); ROOT=os.path.dirname(HERE)
RAW=os.path.join(ROOT,'audio','originais_elevenlabs')+'/'; OUT=os.path.join(ROOT,'audio','tratado')+'/'; os.makedirs(OUT,exist_ok=True)
SR=44100
def load(path):
    pcm=subprocess.run(['ffmpeg','-v','error','-i',path,'-ac','1','-ar',str(SR),'-f','f32le','-'],capture_output=True,check=True).stdout
    return np.frombuffer(pcm,dtype=np.float32).copy()
def save(x,path,br):
    p=subprocess.run(['ffmpeg','-v','error','-y','-f','f32le','-ar',str(SR),'-ac','1','-i','-','-b:a',br,path],input=x.astype(np.float32).tobytes(),check=True)
for f in sorted(glob.glob(RAW+'narr*.mp3')):
    m=re.search(r'narr(\d)',os.path.basename(f))
    if not m: continue
    out=OUT+f'narr{m.group(1)}.mp3'
    subprocess.run(['ffmpeg','-v','error','-y','-i',f,'-af','silenceremove=start_periods=1:start_threshold=-45dB,areverse,silenceremove=start_periods=1:start_threshold=-45dB,areverse,loudnorm=I=-16:TP=-1.5','-ac','1','-ar','44100','-b:a','64k',out],check=True)
    print('narr',out)
kinds={}
for f in sorted(glob.glob(RAW+'sfx_*.mp3')):
    k=re.match(r'sfx_([a-z]+)_',os.path.basename(f)).group(1); kinds.setdefault(k,[]).append(f)
for k,files in kinds.items():
    n=0; maxn = 10 if k in ('tile','wet') else 8
    for f in files:
        x=load(f); env=np.convolve(np.abs(x),np.ones(256)/256,'same')
        thr=max(env.max()*0.18, 1e-3); hop=int(0.18*SR); i=0
        while i<len(x) and n<maxn:
            if env[i]>thr:
                s=max(0,i-int(0.015*SR)); e=min(len(x),s+int((0.55 if k=='flesh' else 0.42)*SR))
                seg=x[s:e].copy(); fade=int(0.06*SR); seg[-fade:]*=np.linspace(1,0,fade); seg[:64]*=np.linspace(0,1,64)
                pk=np.abs(seg).max()
                if pk>0.02:
                    seg=seg/pk*0.9; save(seg,OUT+f'step_{k}_{n}.mp3','96k'); n+=1
                i=e+int(0.08*SR)
            else: i+=128
    print(k,'steps:',n)
