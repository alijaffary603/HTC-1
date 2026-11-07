"""Ask Gemini for the main skills behind each of the 162 occupations.

Writes config/skills.json, which publish.py uses to fill in "skills to build" on the
roles you could move into. Run once, read the output before committing it, and rerun
only if the occupation list changes. Costs a few cents.

    GEMINI_API_KEY=... python scripts/generate_skills.py
"""
import json
import os
import sys

import pandas as pd

from gridskills.paths import CONFIG, OUTPUTS

PROMPT = """For the Canadian occupation group "{title}" (NOC 2021 minor group {code}), list the
6 skills that matter most for getting hired in Alberta. Use short names a job seeker
would recognise, like "Blueprint reading" or "Payroll software". Mark the ones every
employer expects as "core" and the rest as "helpful"."""

SCHEMA = {
    "type": "object",
    "properties": {
        "skills": {
            "type": "array",
            "minItems": 3,
            "maxItems": 6,
            "items": {
                "type": "object",
                "properties": {
                    "skill": {"type": "string"},
                    "importance": {"type": "string", "enum": ["core", "helpful"]},
                },
                "required": ["skill", "importance"],
            },
        }
    },
    "required": ["skills"],
}


def generate(occupations, client, model):
    out = {}
    for code, title in occupations.items():
        interaction = client.interactions.create(
            model=model,
            input=PROMPT.format(title=title, code=code),
            response_format={"type": "text", "mime_type": "application/json", "schema": SCHEMA},
        )
        skills = json.loads(interaction.output_text)["skills"]
        out[code] = [{"skill": s["skill"].strip(), "importance": s["importance"]} for s in skills if s["skill"].strip()]
        print(f"{code} {title}: {', '.join(s['skill'] for s in out[code])}")
    return out


def main():
    from google import genai

    key = os.environ.get("GEMINI_API_KEY")
    if not key:
        sys.exit("set GEMINI_API_KEY first")
    scores = pd.read_csv(OUTPUTS / "scores.csv", dtype={"code": str}).drop_duplicates("code")
    occupations = dict(zip(scores.code, scores.title))
    skills = generate(occupations, genai.Client(api_key=key), os.environ.get("GEMINI_MODEL", "gemini-3.5-flash-lite"))
    (CONFIG / "skills.json").write_text(json.dumps(skills, indent=1, ensure_ascii=False), encoding="utf-8")
    print(f"wrote {len(skills)} occupations to config/skills.json")


if __name__ == "__main__":
    main()
