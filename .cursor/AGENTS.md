# Agent Instructions
- Before exploring crawl or TTS, read the matching project skill: `.cursor/skills/crawler-workflow` or `.cursor/skills/tts-workflow`.
- If a change makes a fact in that skill false, patch only the stale bullet or map row and append one changelog line. Do not rewrite the skill. Leave it unchanged when the contract is still true.
- Codebase discovery stays on Codebase Memory MCP; route large shell/search/log/fetch output through context-mode MCP per `.cursor/rules/context-mode.mdc`.
