const { scene } = await import(process.env.SYSTEM_DIAGRAMS_LIB ?? new URL("./lib.mjs", import.meta.url).href);
const s = scene(process.argv[2]);
s.title("How does a task move through moskills, and what starts each skill?");
const xs = [50, 420, 790, 1160, 1530];
const ids = ["agree", "build", "prove", "done", "pause"];
const b = ids.map((id, i) => s.box(id, xs[i], 200, { w: 300, role: `${i + 1}. ` + ["Agree the\nwork", "Build in\nsteps", "Prove each\nstep", "Call it\ndone", "Pause and\nresume"][i] }));
for (let i = 0; i < 4; i++) s.arrow(b[i], b[i + 1], "then");
s.note(50, 345, "You approve the spec\nand the rules.", 22);
s.note(420, 345, "A failing test first,\nthen the code.", 22);
s.note(790, 345, "A check records exit\ncode and file hashes.", 22);
s.note(790, 410, "Stale proof: commit\nrefused.", 22, "#e03131");
s.note(1160, 345, "Every task proven,\nand you accepted.", 22);
s.note(1530, 345, "The next session gets\nthe exact next step.", 22);
s.group(50, 520, 560, 330, "Always on", "hooks, no choice", "#b2f2bb", [
  "Context · scope at every prompt",
  "Commit gate · refuses stale proof",
  "Visual flag · UI edit needs a look",
  "Version notice · at session start",
], { size: 22 });
s.group(660, 520, 600, 330, "The agent picks it", "from your words or the situation", "#d0bfff", [
  "/preview · /align-intent · /tdd",
  "/diagnose · /gatekeeper · /handoff",
  "/modular-build · /design-system",
  "/system-map · /shared-language",
  "/checkpoint · /learn · /project-dna",
  "/playground",
], { size: 22 });
s.group(1310, 520, 560, 330, "You ask for it", "your request or the slash command", "#ffd8a8", [
  "/council-loop · review by other models",
  "/compress-input · terse replies",
  "/writing-skills · write a skill",
  "/evolvebook · a guide per kind of job",
], { size: 22 });
s.legend("Blue box = one gate step  ·  arrow = next step after the gate passes  ·  red = refused  ·  zones = what starts a skill");
s.save("moskills-flow");
