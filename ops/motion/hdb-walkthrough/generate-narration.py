#!/usr/bin/env python3
"""Generate approved narration through Azure; read the key without echo or storage."""
import getpass,json,wave,io
from pathlib import Path
from urllib.request import Request,build_opener,HTTPRedirectHandler
from urllib.error import HTTPError,URLError
from xml.sax.saxutils import escape
ROOT=Path(__file__).resolve().parent
HOST='https://southeastasia.tts.speech.microsoft.com'
VOICE='en-SG-WayneNeural'
SENTENCES=['Selling your HDB? Start with real sold prices.', 'Enter your postal code. Choose your flat type.', 'Compare recent sales, including the date and floor. Check whether they cover your block or the wider street.', 'These are a starting point. Your floor, condition and remaining lease affect your price.', 'Check your block’s sold prices. No name or phone needed.']
class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self,*args,**kwargs): return None
opener=build_opener(NoRedirect())
def main():
    key=getpass.getpass('Azure Speech key (hidden; not saved): ')
    headers={'Ocp-Apim-Subscription-Key':key,'User-Agent':'JoetayNarration/1.0'}
    try:
        with opener.open(Request(HOST+'/cognitiveservices/voices/list',headers=headers),timeout=30) as response:
            voices=json.load(response)
        voice=next((v for v in voices if v.get('ShortName')==VOICE),None)
        if not voice: raise RuntimeError('Selected Singapore English voice is unavailable in this region')
        print(json.dumps({'authenticated':True,'voice':voice['ShortName'],'locale':voice.get('Locale'),'gender':voice.get('Gender')}),flush=True)
        metadata={'provider':'Microsoft Azure AI Speech REST API','region':'southeastasia','voice':VOICE,'rate':'0%','outputFormat':'riff-48khz-16bit-mono-pcm','voice_type':'prebuilt synthetic voice; not Joe Tay or a clone','voiceMetadata':voice,'sentences':[]}
        for i,text in enumerate(SENTENCES,1):
            ssml=f'<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="en-SG"><voice name="{VOICE}"><prosody rate="0%">{escape(text)}</prosody></voice></speak>'
            request=Request(HOST+'/cognitiveservices/v1',data=ssml.encode(),headers={**headers,'Content-Type':'application/ssml+xml','X-Microsoft-OutputFormat':'riff-48khz-16bit-mono-pcm'},method='POST')
            with opener.open(request,timeout=45) as response: audio=response.read()
            with wave.open(io.BytesIO(audio),'rb') as wav:
                duration=wav.getnframes()/wav.getframerate(); assert wav.getframerate()==48000 and wav.getnchannels()==1
            (ROOT/f'sentence-{i}.wav').write_bytes(audio)
            metadata['sentences'].append({'text':text,'file':f'sentence-{i}.wav','duration':duration})
            print(json.dumps({'sentence':i,'duration':duration,'bytes':len(audio)}),flush=True)
        (ROOT/'azure-source.json').write_text(json.dumps(metadata,indent=2)+'\n')
    except HTTPError as error:
        print(json.dumps({'error':'Azure request rejected','httpStatus':error.code}),flush=True)
        raise SystemExit(1)
    except URLError:
        print('Azure connection failed; no credentials logged.',flush=True)
        raise SystemExit(1)
    finally:
        key=''; headers.clear()
if __name__=='__main__': main()
