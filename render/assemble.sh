#!/bin/bash
# Usage: bash render/assemble.sh out/<id>   (expects plan.json + concat.txt + frames/ inside)
set -e
WORK="$1"; ROOT="$(cd "$(dirname "$0")/.." && pwd)"; SFX="$ROOT/cache/sfx"
mkdir -p "$SFX"
# Synthesized placeholders. Replace with licensed files of the same names any time.
[ -f "$SFX/tick.wav" ]   || ffmpeg -v error -y -f lavfi -i "sine=f=1800:d=0.06" -af "afade=t=out:st=0.02:d=0.04,volume=0.5,aformat=channel_layouts=stereo" "$SFX/tick.wav"
[ -f "$SFX/ding.wav" ]   || ffmpeg -v error -y -f lavfi -i "sine=f=880:d=0.5" -f lavfi -i "sine=f=1320:d=0.5" -filter_complex "[0][1]amix=inputs=2,afade=t=out:st=0.1:d=0.4,volume=0.4,aformat=channel_layouts=stereo[o]" -map "[o]" "$SFX/ding.wav"
[ -f "$SFX/whoosh.wav" ] || ffmpeg -v error -y -f lavfi -i "anoisesrc=c=brown:d=0.35:a=0.6" -af "bandpass=f=1200:w=800,afade=t=in:d=0.05,afade=t=out:st=0.1:d=0.25,aformat=channel_layouts=stereo" "$SFX/whoosh.wav"

ffmpeg -y -v error -f concat -safe 0 -i "$WORK/concat.txt" -vf "fps=30,format=yuv420p" -c:v libx264 -preset medium -crf 19 -r 30 "$WORK/video_silent.mp4"

python3 - "$WORK" "$SFX" "$ROOT" <<'PY'
import json, subprocess, sys, yaml
work, sfx, root = sys.argv[1:4]
cfg = yaml.safe_load(open(f"{root}/config.yaml"))["sfx"]
plan = json.load(open(f"{work}/plan.json"))
gain = {"vo": 1.0, "tick": cfg["tick_gain"], "ding": cfg["ding_gain"], "whoosh": cfg["whoosh_gain"]}
inputs, filters, names = [], [], []
for i, c in enumerate(plan["cues"]):
    f = c["file"] if c["kind"] == "vo" else f"{sfx}/{c['kind']}.wav"
    inputs += ["-i", f]; ms = int(c["at"] * 1000)
    filters.append(f"[{i}]aformat=sample_rates=44100:channel_layouts=stereo,volume={gain[c['kind']]},adelay={ms}|{ms}[a{i}]"); names.append(f"[a{i}]")
if cfg.get("music_path"):
    i = len(names); inputs += ["-stream_loop", "-1", "-i", cfg["music_path"]]
    filters.append(f"[{i}]aformat=sample_rates=44100:channel_layouts=stereo,volume={cfg['music_gain']},afade=t=out:st={plan['total']-2}:d=2[a{i}]"); names.append(f"[a{i}]")
filters.append("".join(names) + f"amix=inputs={len(names)}:normalize=0:dropout_transition=0,apad,atrim=0:{plan['total']:.3f},alimiter=limit=0.95[out]")
subprocess.run(["ffmpeg", "-y", "-v", "error", *inputs, "-filter_complex", ";".join(filters), "-map", "[out]", "-ar", "44100", f"{work}/mix.wav"], check=True)
PY

ffmpeg -y -v error -i "$WORK/video_silent.mp4" -i "$WORK/mix.wav" -c:v copy -c:a aac -b:a 160k -shortest -movflags +faststart "$WORK/video.mp4"
rm -f "$WORK/video_silent.mp4" "$WORK/mix.wav"
echo "video: $WORK/video.mp4 ($(ffprobe -v error -show_entries format=duration -of csv=p=0 "$WORK/video.mp4")s)"
