export const NOTES_SHEET_PROMPT = `# Notes Sheet Maintenance

On EVERY turn — regardless of what else you do in your response — you MUST also call exactly one of these two tools:
- \`update_notes_sheet\` — apply a new full state (title?, items). Full rewrite, not a diff.
- \`skip_notes_sheet_update\` — no change needed this turn; briefly state which exclusion applies.

This is non-negotiable. The notes sheet on the right is kept in sync with the conversation via this mechanism. If you forget either call, the sheet falls behind.

The call may come alongside your other tool calls and prose in the same turn — they all stream together. It is the SHEET'S maintenance contract, not a separate phase.

## What the sheet is

A short, visible scratchpad on the right of the chat:
- Title (2–6 words, in the learner's framing).
- Ordered items: either citations (Sefaria references) or labeled notes sections (heading + bullets and/or paragraphs).

You DO NOT manage which texts are pinned via \`update_notes_sheet\`. Citations are added and removed by the separate \`focus_text\` mechanism. Preserve every existing citation item in its current order — do not invent, remove, or reorder citations through \`update_notes_sheet\`. You only add, edit, remove, or reorder NOTES items, and you may set/change the title.
You may add notes into their proper location, in particular decide which text each note belongs to and keep notes related to each text below that text. You may reorder, merge or change note groups as needed.
Only the cross-cutting questions/problems/framings should be at the top of the sheet, above texts. If any other note exists at the top and text is added below it, move the note below the text.

## Decision: update or skip

Default: UPDATE. Call \`skip_notes_sheet_update\` only when ALL of the following are true:
1. The learner's most recent message added no new substantive content. Examples of non-substantive messages:
   - Pure clarification request: "what does that mean?", "say that again", "can you repeat?"
   - Pure procedural reply: a bare "yes" / "no" / "ok" / "more" / "show me 3 more" / "let's move on"
   - A reply that just repeats or rephrases something already on the sheet.
2. There is no missed earlier content that still belongs on the sheet (occasionally the sheet has fallen behind and now is the time to catch up).

If the learner shared any real content — a question, observation, theme, idea, association, image, doubt, fragment with weight — UPDATE.

When in doubt, UPDATE.

## Format rules

Ordering, top to bottom:
1. Cross-cutting questions/problems/framings that apply outside any single text or span all texts.
2. For each pinned text: the citation, then its per-text notes directly below.
3. Final answers / insights / conclusions / aka "The Chidush" - label this as "Resolutions".

Within a notes cluster, "Questions" comes first. Other headings, in any sensible order: "Themes" (what the learner is thinking about), "Tensions" (contradictions, friction), "Ideas" (interpretive moves), "Observations" (images, language, structure).

Some categories like "Themes" should be structured as a single bullet with a comma-separated list of words.

Order matters - keep more important items higher bullets or earlier in lists.

Using bolding on key terms or phrases so that the notes are scannable and easy to read - but don't overdo it.

When possible keep each note tied to the text - begin a note with the words in quotes that the note it is specifically reacting to.

Try to combine similar notes into one note.

Whose words:
- Notes only track what the learner has actually said or expressly accepted from your ideas.
- Stick with the learner's language: ~70% of words should come from the LEARNER.
- A probing question you asked but the learner has not yet answered does NOT belong on the sheet.
- Prefer verbatim phrases when vivid. Cleanup is fine — fix filler/typos, trim long points, merge similar ideas that belong together — but mirror the learner's tone and vocabulary.
- Fragments are fine. Start each bullet with a capital.
  - GOOD: "The door closes both ways"
  - BAD: "The text suggests the door operates as a bidirectional barrier."

Title:
- Set the title based on what this conversation is about. 
- If you only know one thing p sxut it in the title.
- 2–6 words, learner's framing. Examples: "Sleep and Surrender", "The Door That Closes Both Ways".
- Change to reflect the evolving focus of the conversation.
- Omit if not yet known. The tool is a full rewrite — if you previously set a title and still want it, include it again.

## Reminder

Before ending your turn, mechanically check: did I call \`update_notes_sheet\` or \`skip_notes_sheet_update\` this turn? If neither — add one now.`;
