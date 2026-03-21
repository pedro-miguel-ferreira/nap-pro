# The Vision

## The Problem

AI can write code. That's not the bottleneck anymore. The bottleneck is thinking — knowing what to build, why, and how the pieces fit together. Most AI-assisted development skips this step. You describe what you want, the AI writes code, and it works — until it doesn't. When it breaks, nobody knows what "correct" means, because correct was never defined.

This is vibe coding. It produces working software the way a lucky guess produces a right answer. You can't debug a guess. You can't iterate on a guess. You can't hand a guess to another agent and say "this is wrong, fix it."

## The Insight

What if you spent 15 minutes thinking — really thinking — with an AI that pushes back, stress-tests your ideas, chases rabbit holes? And what survived that 15 minutes got compressed into a napkin: twelve bullets, each one load-bearing. Not a spec. Not a PRD. A napkin — something you'd scratch on a napkin at a bar.

And then agents unfold that napkin. Bullets become specs. Specs become user journeys. Journeys become test cases — before any code exists. Tests define what "correct" means. Code is generated to pass the tests. When something breaks, agents read the test, the spec, the napkin — they know what was intended. They fix it.

The napkin is the source of truth. Code is disposable. The napkin is the product.

## NAP

NAP is the environment where this happens. It's where a human and an architect brainstorm napkins. It's where agents unfold napkins into running systems. It's where you come back from a nap and see everything that happened — every decision, every wrong turn, every recovery. Not a summary. The actual thinking, in full scrollback, in interactive terminals you can talk to.

It's an Electron app with an AI architect managing a team of AI agents, each working in their own terminal, communicating through poke/nap/done, building software from napkins.

## The Napkin Format

A napkin is a compressed idea document. Asterisks nested all the way down. Each bullet is an anchor — a pin that holds a bigger idea in place. The anchor is tiny. The idea it holds is big.

```
* order lifecycle
  * placed → confirmed → preparing → picked up → delivered → closed
  * any step can fail → refund flow (separate from main lifecycle)
  * problem: restaurant confirms but never prepares
    * need timeout per step (configurable per restaurant)
    * but: some restaurants are just slow — don't penalize legit slow prep
      * so: learn average prep time per restaurant, timeout = 2x their average
```

Labels, not sentences. Nesting is zooming in — deeper means more specific, not more verbose. If there's no tension, it doesn't need an anchor.

Files use the `.nap.md` extension.

## The Manifesto

1. **The napkin is the product.** Not the byproduct. The napkin IS the spec. Everything downstream is derived.

2. **Dive the rabbit holes.** Chase ideas until they collapse or click. Come back with a tag — three words, five max. The tags are the napkin.

3. **Compress until it cracks.** If an arrow between two words captures it, that's your spec. The cracking is how you find the load-bearing ideas.

4. **Two players. Human imagination, AI expansion.** The human stress-tests systems in pure thought. The AI explores twenty paths while the human walks one. This isn't vibe coding. This is ONLY thinking — compressed to its seed.

5. **The napkin unfolds into a system.** Bullets become specs. Specs become journeys. Journeys become tests — before any code exists. Tests define correct. Code is generated to pass them.

6. **The system self-heals because the napkin defined "right."** Tests fail. Agents read the error, the spec, the napkin. They know what was intended. They fix it.

7. **Bug? Napkin it. New requirement? Napkin it.** Always the napkin. Agents rebuild downstream. Code is disposable. The napkin is the source of truth.

8. **Only your imagination is the bottleneck.** Everything else is automated.

9. **The castle was always in the sky. You just wrote down the address.** When the bullets feel inevitable, hand them to the machines. The castle comes down, one agent at a time. It stands, because the napkin was right.
