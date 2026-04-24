---
name: text-summarizer
version: 1.0.0
description: Condenses long-form text into a concise bulleted list of key points.
author: Skills Registry Demo <demo@example.com>
tags: [summarization, nlp, text-processing, productivity]
---

# Text Summarizer

## Overview
The text-summarizer skill reads any block of unstructured text and returns a bulleted list of the most important points. It is optimized for articles, meeting notes, technical documentation, and support tickets. Output length scales with input: short inputs yield 3–5 bullets; long inputs yield up to 10.

## Usage

### Invocation
Ask the model to summarize a passage, or pipe text into a prompt that references this skill.

### Input
- Plain text of any length (minimum ~100 words for meaningful output)
- Accepts markdown, HTML, or raw text
- Language: English (multilingual support planned for v1.1.0)

### Output
- A bulleted list (`- ` prefix) of key points
- Each bullet is a single, complete sentence
- No preamble or trailing commentary — bullets only

## Examples

### Example 1: Article summary
**Input:**
```
The James Webb Space Telescope has now completed its first year of science
operations, delivering images of unprecedented clarity. Astronomers have used it
to study the atmospheres of exoplanets, detect the earliest galaxies ever
observed, and revisit targets originally imaged by Hubble with dramatically
improved resolution. The telescope operates at the second Lagrange point, 1.5
million kilometres from Earth, kept cold by a five-layer sunshield the size of a
tennis court. Its primary mirror, 6.5 metres across, is composed of 18 hexagonal
gold-plated beryllium segments that folded for launch aboard an Ariane 5 rocket.
```
**Output:**
```
- The James Webb Space Telescope completed its first year of science operations.
- It has enabled study of exoplanet atmospheres, the earliest observable galaxies, and high-resolution revisits of Hubble targets.
- The telescope sits 1.5 million km from Earth at L2, protected by a tennis-court-sized five-layer sunshield.
- Its 6.5m primary mirror consists of 18 gold-plated beryllium segments that folded for launch.
```

### Example 2: Meeting notes summary
**Input:**
```
We spent the first thirty minutes reviewing the Q3 roadmap. Sarah raised concerns
about the authentication service timeline slipping due to the unexpected dependency
on the legacy SSO provider. Marcus said the infrastructure team could provide a
temporary bridge solution by end of month. The team agreed to schedule a follow-up
review in two weeks. Budget for the new monitoring tooling was approved pending
finance sign-off, expected by Friday.
```
**Output:**
```
- Q3 roadmap review identified a timeline risk in the authentication service due to a legacy SSO dependency.
- Infrastructure team will deliver a temporary bridge solution by end of month.
- A follow-up review is scheduled for two weeks out.
- Monitoring tooling budget was approved, pending finance sign-off by Friday.
```

## Notes
- Preserves named entities (people, organizations, dates) verbatim.
- Does not add information not present in the source text.
- For texts under 100 words, output may be a single bullet.
