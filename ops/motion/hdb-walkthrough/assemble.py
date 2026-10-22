#!/usr/bin/env python3
"""Assemble locally generated graphics and Azure narration; no credentials needed."""
import array, hashlib, json, subprocess, wave
from pathlib import Path

ROOT = Path(__file__).resolve().parent
REPO = ROOT.parents[2]
RATE = 48000
STARTS = [0.12, 5.15, 10.15, 18.15, 25.10]
# Sentence boundaries measured in the trimmed PCM pauses, not guessed speech speed.
BREAKS = [(1.52, 2.46), (1.58, 2.48), (3.44, 4.44), (1.78, 2.68), (1.94, 2.94)]
CLAUSES = [
    ['Selling your HDB?', 'Start with real sold prices.'],
    ['Enter your postal code.', 'Choose your flat type.'],
    ['Compare recent sales, including the date and floor.',
     'Check whether they cover your block or the wider street.'],
    ['These are a starting point.',
     'Your floor, condition and remaining lease affect your price.'],
    ['Check your block’s sold prices.', 'No name or phone needed.'],
]

def run(args):
    subprocess.run(['ffmpeg', '-y', '-hide_banner', '-loglevel', 'error', *args], check=True)

def timestamp(v):
    ms = round(v * 1000)
    return f'{ms//3600000:02d}:{ms//60000%60:02d}:{ms//1000%60:02d}.{ms%1000:03d}'

def main():
    frames = array.array('h', [0]) * (30 * RATE)
    cues, segments = [], []
    for i, start in enumerate(STARTS):
        with wave.open(str(ROOT / f'sentence-{i+1}.wav'), 'rb') as wav:
            assert (wav.getframerate(), wav.getnchannels(), wav.getsampwidth()) == (RATE, 1, 2)
            source = array.array('h', wav.readframes(wav.getnframes()))
        voiced = [j for j, x in enumerate(source) if abs(x) > 35]
        low, high = max(0, voiced[0] - int(.08 * RATE)), min(len(source), voiced[-1] + int(.15 * RATE))
        clip = source[low:high]
        offset = round(start * RATE)
        end = start + len(clip) / RATE
        assert end <= ([5, 10, 18, 25, 30][i])
        frames[offset:offset + len(clip)] = clip
        pause_start, pause_end = BREAKS[i]
        cues.extend([
            {'start': start + .08, 'end': start + pause_start + .12, 'text': CLAUSES[i][0]},
            {'start': start + pause_end - .06, 'end': end, 'text': CLAUSES[i][1]},
        ])
        segments.append({'start':start, 'end':end, 'source':f'sentence-{i+1}.wav', 'trimStart':low/RATE, 'trimEnd':high/RATE})
    with wave.open(str(ROOT / 'assembled.wav'), 'wb') as wav:
        wav.setnchannels(1); wav.setsampwidth(2); wav.setframerate(RATE); wav.writeframes(frames.tobytes())
    run(['-i', str(ROOT/'assembled.wav'), '-af', 'loudnorm=I=-18:TP=-3:LRA=7', '-ar', '48000', '-c:a', 'pcm_s16le', str(ROOT/'narration.wav')])
    captions = 'WEBVTT\n\n' + '\n\n'.join(f'{timestamp(c["start"])} --> {timestamp(c["end"])}\n{c["text"]}' for c in cues) + '\n'
    (ROOT/'joetay-hdb-walkthrough-en.vtt').write_text(captions)
    (REPO/'assets/motion/joetay-hdb-walkthrough-en.vtt').write_text(captions)
    exports = []
    for form in ['desktop','mobile']:
        master = ROOT / f'joetay-hdb-walkthrough-{form}-silent.mp4'
        if not master.exists(): continue
        output = REPO / f'assets/motion/joetay-hdb-walkthrough-{form}.mp4'
        run(['-i',str(master),'-i',str(ROOT/'narration.wav'),'-map','0:v:0','-map','1:a:0',
             '-c:v','copy','-c:a','aac','-b:a','64k','-ar','48000','-t','30','-movflags','+faststart',
             '-metadata','title=Before you choose an asking price - Joe Tay',
             '-metadata','comment=Code-generated HDB walkthrough. Historical block 640 sales checked 22 October 2026. Azure en-SG-WayneNeural synthetic narration.', str(output)])
        run(['-i',str(output),'-f','null','-'])
        assert output.stat().st_size < 1_000_000
        probe = json.loads(subprocess.check_output(['ffprobe','-v','error','-show_entries','stream=codec_type,codec_name,width,height,sample_rate,channels:format=duration,size','-of','json',str(output)]))
        exports.append({'file':str(output),'bytes':output.stat().st_size,'sha256':hashlib.sha256(output.read_bytes()).hexdigest(),'probe':probe})
    (ROOT/'export.json').write_text(json.dumps({'provider':'Azure AI Speech','voice':'en-SG-WayneNeural','duration':30,'segments':segments,'cues':cues,'exports':exports},indent=2)+'\n')
    print(json.dumps({'segments':segments,'exports':exports},indent=2))

if __name__ == '__main__': main()
