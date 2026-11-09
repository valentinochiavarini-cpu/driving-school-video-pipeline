# driving-school-video-pipeline

Automated DMV quiz shorts for The Driving School. Start with CLAUDE.md (brief) and docs/PLAN.md (plan and decisions).

    npm install
    cp .env.example .env            # add OPENAI_API_KEY and ELEVENLABS_API_KEY
    npm run dry                     # silent test video from docs/sample_set.json, no API calls
    npm run audition                # hear the hook line in candidate voices, then set voiceEn in src/config.ts
    npm run make -- --format pass5 --lang en

Outputs: out/<id>/video.mp4, plan.json (timeline), post.json (caption, hashtags, question ids).
public/cache holds images and voice clips; cache/ holds question and text caches and the used-question ledger.
