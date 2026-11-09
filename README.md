# driving-school-video-pipeline

Automated DMV quiz shorts for The Driving School. Read CLAUDE.md first (the brief), then docs/findings.md.

Quick start
    cp .env.example .env            # add OPENAI_API_KEY and ELEVENLABS_API_KEY
    make setup                      # python deps, playwright chromium (needs ffmpeg + node 20+)
    make dry                        # renders a silent test video from docs/sample_set.json, no API calls
    make audition                   # hear the hook line in your ElevenLabs voices, then set voice_en in config.yaml
    make one F=pass5 L=en           # one real video -> out/<id>/video.mp4 + post.json (caption, hashtags)
    make batch F=signs7 L=es N=10

Outputs: out/<id>/video.mp4, plan.json (full timeline), post.json (caption + hashtags + question ids).
cache/ holds questions, speakable rewrites, TTS audio and the used-question ledger. Safe to delete, costs money to rebuild TTS.
