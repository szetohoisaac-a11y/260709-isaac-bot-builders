---
name: gen-art
description: Turn a text prompt into a PNG image using Google's Gemini model. Use when the user runs /gen-art or asks to generate art from a written prompt.
---

# Generate art from a prompt

This skill turns a short text description into a PNG. It is **self-contained** —
the generator (`scripts/gen-asset-image.js`, Google Gemini) travels inside this
skill folder, so the skill works on its own, copied into any project.

Follow these steps.

1. **Get the prompt.** Use the user's description of the image they want. If they
   didn't give one, ask for a short, vivid prompt — e.g. *"a chunky blue battle
   robot, flat illustration, plain background"*.
2. **Run the generator** from this skill's folder:
   `node scripts/gen-asset-image.js "<the prompt>"`
   It saves a PNG under `assets/images/` and prints the exact path. To steer the
   filename and folder, add `--type <card|token|tile>` and `--id <NNN>`
   (e.g. `--type token --id 105`).
3. **Report what the script printed.** Tell the user the saved path. The script is
   **fail-soft**: with no `GOOGLE_API_KEY` set, or on a network/API error, it prints
   a friendly note and writes nothing — relay that note instead. No key is needed to
   try; it just won't produce an image without one.

Never invent a path or claim an image was saved that the script did not report —
the script's printed output is the only source of truth for whether a PNG exists.

## What it needs

- **Node** (v18+) to run the script. No `npm install` — built-ins only.
- **`GOOGLE_API_KEY`** in the environment (a `.env` file works) for real art. Optional:
  without it, the skill runs and reports the fail-soft note.
