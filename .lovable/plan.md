## Scope

Three new SIMA 2 capabilities, all wired into the existing `device-automation` bot loop. No changes to ADB server.

---

### 1. Goal reasoning

- Maintain an explicit goal stack per session in `bot_sessions.config.goals` (default: `["dismiss popups", "reach Level 1", "follow tutorial", "clear Level 1"]`).
- Each tick: send current top goal to Gemini in the system prompt and require Gemini to return a `currentGoal` field with its active sub-goal and a `goalAchieved` boolean.
- When `goalAchieved=true`, pop the top goal, log a `goal_complete` row in `bot_actions`, advance to the next goal.
- Surface the active goal in agent logs (prefix every action description with `[goal: …]`).

### 2. Conversational interface (mid-run human instructions)

- New table `agent_instructions` — `id, session_id, instruction, status('pending'|'consumed'), created_at, consumed_at`.
- Frontend: small chat input on the active session card (in `BotCard.tsx` or a new `AgentChatPanel.tsx`) — posts to a new edge function action `send_instruction` which inserts into `agent_instructions`.
- Bot loop: before each Gemini call, fetch the latest pending instruction for the session, prepend it to the user prompt as `HUMAN OVERRIDE: "…"`, mark it consumed, log a `human_instruction` row in `bot_actions`.
- Realtime list of past instructions + agent acknowledgements rendered in the same panel.

### 3. Self-improvement loop

- On `level_failed` (already detected): summarize the attempt with one Gemini call (`game_state`, `objective`, `outcome='failed'`, `reward_reasoning`, `action_sequence` from this attempt's `bot_actions`) and insert into `agent_experiences`.
- Before each new attempt's first Gemini call, fetch the 3 most recent failed `agent_experiences` for this `game_name` and inject into Gemini's system prompt as a `LESSONS FROM PRIOR FAILURES:` section.
- Aggregate: bump `game_profiles.total_sessions`, update `success_rate` after every terminal state.

---

## Technical details

**DB migration**
```sql
CREATE TABLE public.agent_instructions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL,
  instruction TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  consumed_at TIMESTAMPTZ
);
ALTER TABLE public.agent_instructions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to agent_instructions"
  ON public.agent_instructions FOR ALL USING (true) WITH CHECK (true);
CREATE INDEX idx_agent_instructions_session_pending
  ON public.agent_instructions(session_id, status, created_at DESC);
```

**Edge function `device-automation/index.ts`**
- New action handler `send_instruction` (inserts row, returns 200).
- In `bot_loop`:
  - Load goals from `session.config.goals` (seed if missing).
  - Load latest pending instruction → prepend to Gemini user prompt → mark consumed.
  - Load last 3 failed `agent_experiences` for this `game_name` → inject into system prompt.
  - Parse `currentGoal` and `goalAchieved` from Gemini response; on achieve, pop + persist `config.goals` + log `goal_complete` action.
  - On `level_failed` branch (existing retry path): build summary and `INSERT INTO agent_experiences` before relaunching.

**Frontend**
- `useDeviceAutomation.ts`: add `sendInstruction(sessionId, text)` calling the new edge action; subscribe to `agent_instructions` realtime channel.
- New `src/components/AgentChatPanel.tsx`: input + scrollable feed of past instructions and matching `bot_actions.human_instruction` acknowledgements. Mounted inside `BotCard.tsx` for the active session.

**Out of scope** — no changes to `adb-server/`, no UI tab additions (still Games + Devices only), no auth changes.
