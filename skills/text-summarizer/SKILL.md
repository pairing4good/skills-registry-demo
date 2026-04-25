---
name: text-summarizer
version: 2.0.0
description: >
  Summarizes any block of text — articles, meeting notes, email threads, technical docs,
  support tickets, reports, chat logs, and more. Use this skill whenever the user wants
  a summary, key points, TL;DR, briefing, or overview of a passage or document. Also
  triggers for "what's the gist of", "brief me on", "condense this", "what are the
  takeaways from", "action items from", or any request to distill a longer text.
  Adapts output format and length to the content type and any length signal the user gives.
author: Skills Registry Demo <demo@example.com>
tags: [summarization, nlp, text-processing, productivity]
---

# Text Summarizer

## Goal

Turn any text into a useful, honest summary. The output should let someone who hasn't
read the original quickly understand what matters — and, for meeting notes and action-oriented
content, what they need to do next.

## Reading user intent

Before writing anything, notice two things:

**Content type** — what kind of text is this?
- Meeting notes / call transcripts → surface decisions and action items
- Article, essay, or blog post → lead with the central argument, then support it
- Email thread or support ticket → open with a TL;DR sentence, then key points
- Technical documentation → write an overview sentence, then key concepts as bullets
- Everything else → bullets of the most important points

**Length signal** — did the user signal how much they want?
- "brief", "quick", "tl;dr", "one-liner", "in a sentence" → 1–3 bullets or a single sentence
- "detailed", "comprehensive", "thorough", "full summary" → go deeper, don't cap early
- No signal → scale naturally with content: ~3 bullets for short texts, up to 8–10 for long ones

If the user explicitly asks for a paragraph or prose summary rather than bullets, write a
short paragraph instead.

## Output by content type

### Articles and essays
One framing sentence stating the central argument or finding, followed by 4–7 bullets
covering the key supporting points, evidence, or conclusions.

### Meeting notes and call transcripts
Three sections, in order:
1. **Decisions** — bullet list of things agreed or concluded (omit if none)
2. **Action items** — bullet list, each formatted as `[Owner] action` where the owner is
   known, or just the action if no owner is mentioned
3. **Key discussion points** — 2–4 bullets on important topics discussed that didn't
   produce a decision or action item (omit if thin)

### Emails and support tickets
One TL;DR sentence (the ask, issue, or main point), followed by 3–5 bullets on context,
constraints, or relevant details.

### Technical documentation
One overview sentence, followed by 5–8 bullets on concepts, steps, or caveats a reader
must understand.

### General / other
Bulleted list of key points. Short inputs: 3–5 bullets. Long inputs: up to 10 bullets.

## Style rules

- Each bullet is a single complete sentence.
- Use the same terminology as the source — don't paraphrase names, versions, or technical terms.
- Don't add information that isn't in the source text.
- Don't include meta-commentary like "This article discusses..." or "In summary...".
- For meeting notes and action items, preserve owner names exactly as they appear.
- Supports any language — summarize in the same language the source text is written in.

## Examples

### Article

**Input:**
```
The James Webb Space Telescope has now completed its first year of science operations,
delivering images of unprecedented clarity. Astronomers have used it to study the
atmospheres of exoplanets, detect the earliest galaxies ever observed, and revisit
targets originally imaged by Hubble with dramatically improved resolution. The telescope
operates at the second Lagrange point, 1.5 million kilometres from Earth, kept cold by
a five-layer sunshield the size of a tennis court. Its primary mirror, 6.5 metres across,
is composed of 18 hexagonal gold-plated beryllium segments that folded for launch aboard
an Ariane 5 rocket.
```

**Output:**
The James Webb Space Telescope completed its first year of science operations, advancing
astronomy across exoplanet research, early-universe observation, and high-resolution
revisitation of Hubble targets.

- It studied exoplanet atmospheres and detected the earliest galaxies ever observed.
- It revisited Hubble targets with dramatically improved resolution.
- The telescope sits at L2, 1.5 million km from Earth, shielded by a tennis-court-sized five-layer sunshield.
- Its 6.5m primary mirror consists of 18 gold-plated beryllium segments that folded for launch.

---

### Meeting notes

**Input:**
```
We spent the first thirty minutes reviewing the Q3 roadmap. Sarah raised concerns about
the authentication service timeline slipping due to the unexpected dependency on the
legacy SSO provider. Marcus said the infrastructure team could provide a temporary bridge
solution by end of month. The team agreed to schedule a follow-up review in two weeks.
Budget for the new monitoring tooling was approved pending finance sign-off, expected by Friday.
```

**Output:**

**Decisions**
- A follow-up roadmap review is scheduled for two weeks out.
- Monitoring tooling budget is approved, pending finance sign-off by Friday.

**Action items**
- [Marcus] Deliver temporary SSO bridge solution by end of month.
- [Finance] Provide sign-off on monitoring tooling budget by Friday.

**Key discussion points**
- Authentication service timeline is at risk due to an unexpected legacy SSO provider dependency.

---

### Email (brief request)

*User asked for "a quick tl;dr"*

**Input:**
```
Hi team — following up on last week's discussion about the vendor contract renewal.
Legal has reviewed the updated terms and flagged two clauses (sections 4.2 and 7.1)
as requiring negotiation before we can sign. Section 4.2 relates to data residency
and section 7.1 covers liability caps. Procurement is looping in the vendor's legal
team for a call next Wednesday at 2pm EST. Please confirm attendance if you're a
stakeholder on this contract.
```

**Output:**
The vendor contract renewal is on hold pending negotiation of two clauses flagged by legal.

- Sections 4.2 (data residency) and 7.1 (liability caps) require negotiation before signing.
- A call with the vendor's legal team is scheduled for next Wednesday at 2pm EST.
- Stakeholders should confirm attendance.
