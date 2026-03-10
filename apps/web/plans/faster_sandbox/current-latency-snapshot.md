# Current Latency Snapshot

Date: 2026-03-04 (local dev, `openai/gpt-5.2-codex`, prompt: `"hi"`)

## Cold Boot (new conversation)
- `elapsed`: **11.33s**
- `generation`: **10.26s**
- `client_generation_to_first_visible_output`: **11.33s**
- `sandbox_connect_or_create`: **476ms** (`created`)
- `opencode_ready`: **4.35s**
- `model_stream`: **2.54s**

## Warm Boot (same cached conversation, 2 runs)
- Run 1 `elapsed`: **7.21s**
- Run 2 `elapsed`: **6.17s**
- Best warm `elapsed`: **6.17s**
- Best warm `client_generation_to_first_visible_output`: **6.16s**
- Warm `sandbox_connect_or_create`: **445ms–900ms** (`reused`)

## Quick Takeaway
Current state is roughly **~11s cold** and **~6–7s warm** for visible output. We are still far from a 3s target.
