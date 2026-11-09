"""OpenAI chat helper (direct REST, JSON mode)."""
import json, urllib.request
from common import CONFIG, env

def chat_json(system, user, temperature=0.3, model=None):
    body = json.dumps({
        "model": model or CONFIG["openai"]["model"], "temperature": temperature,
        "response_format": {"type": "json_object"},
        "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
    }).encode()
    req = urllib.request.Request("https://api.openai.com/v1/chat/completions", data=body,
                                 headers={"Authorization": f"Bearer {env('OPENAI_API_KEY')}", "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=90) as r:
        return json.loads(json.load(r)["choices"][0]["message"]["content"])
