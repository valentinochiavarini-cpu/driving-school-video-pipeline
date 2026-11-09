setup: ; pip install -r requirements.txt && npm install && npx playwright install chromium
dry:   ; python3 pipeline/run.py --format pass5 --lang en --dry-run
one:   ; python3 pipeline/run.py --format $(or $(F),pass5) --lang $(or $(L),en) --count 1
batch: ; python3 pipeline/run.py --format $(or $(F),pass5) --lang $(or $(L),en) --count $(or $(N),10)
audition: ; python3 pipeline/tts.py --audition "Most people fail this one. Can you pass the 2027 DMV test? Question one. What does this sign mean?"
