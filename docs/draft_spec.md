# Taaleiland — product specification

## 1. What it is

An island that a child builds by practising the Dutch language. Short sessions, a few times a week, for several months.

## 2. The problem

Repetition is not the problem. Children spontaneously spend thousands of hours doing the same thing: mining ore in Minecraft, walking the same loop. That works because it produces something they wanted, and because there's always something they haven't seen yet. Homework repeats just as much, but produces nothing the child itself wanted. For a child who already finds language hard, that's where the resistance sits.

Most digital programs don't solve that: exercises in bulk, a workbook on a screen. This module flips it around. The repetition stays, but it produces resources the child uses to build an island, and behind every passage lies something new.

## 3. Who it's for

**The child — end user.** Ages 8–10 (Dutch groep 5–6), difficulty with reading and spelling, primarily children on a dyslexia treatment track. The child uses the module alone, in short sessions. It doesn't choose, doesn't buy and manages nothing.

The differences within this group are larger than in regular education: children start at different times and levels, so no single fixed content fits everyone well. An adult sets the level beforehand; within that, the module moves with what the child shows. Whoever clearly masters something finishes sooner — they don't get more work at a higher level.

**The organisation — customer.** Small treatment organisations with a strong approach of their own, but without the budget to have software built. What the big players roll out nationally is rarely better; it's just affordable for whoever can afford it. The organisation hands the module to its patients for free. The practitioner sets the level and can unlock things along the way. Nothing more.

**The parent — administrator and audience.** Holds the account and manages a few settings: font size, read-aloud speed (in consultation with the practitioner), optional cosmetic layers. The parent also carries out part of the treatment: often sits in on part of the session and does the homework at home.

The parent is also an audience. The child shows what it has built. That's the only social layer, and it requires no feature at all — just an island worth looking at.

## 4. How it reaches the child

**Island 1, via the organisation.** The practitioner hands out the module during the treatment track. Always free for the family. The parent creates the account (role division: §3).

Island 1 must feel complete on its own. A child who never gets to island 2 must not feel like it got stuck halfway.

**Island 1, outside the organisation.** Not available for now. Possibly later, as a paid variant and possibly in adapted form.

**Island 2, via the parent.** For sale after the treatment track ends, once the parent has clearly seen benefit from the first one. No practitioner, no link to the treatment — only the same didactic principles. The parent sets the level themselves. The price sits below that of a single private treatment session.

## 5. Rhythm and scope

How often and how long only becomes clear once children actually use it: 1×15 minutes, 2×5 minutes a day, or once a week for half an hour. We plan for roughly half an hour of content per week, however it's divided.

Within a session there should be variety: not the same thing for fifteen minutes straight, but chopping, then gluing, then pointing at the word read aloud — the same rule and the same words, from different angles.

The first version aims for roughly three months of content, with room to move to two or four. For the very first test that may be less, as long as it's a fair cross-section of what a child encounters over those months. These are guideposts, not requirements: the setup must be able to shift them without anything collapsing.

## 6. Flexibility and coherence

Two requirements that pull against each other. Coherence: task, mechanic, reward and place must interlock — a child aged eight to ten follows stories, checks cause and effect, and immediately notices if a reward is just bolted on. Flexibility: we don't yet know what works, so everything must be adjustable later.

There are dials to turn. Turn one, and **usually** one thing goes up and another goes down — by how much depends on where the others sit. That becomes clear along the way.

- **How tightly a task form is tied to the world.** Usable everywhere versus only where it fits thematically, and whether it carries meaning there: chopping is both separating sounds and chopping wood; pointing at the word read aloud has no counterpart. The stronger the meaning, the less free the placement: chopping can only happen where there are trees, and not every zone tolerates trees.
- **How tightly resources are bound.** To one task form (wood only from chopping) versus several forms; and whether the material sequence is one-way traffic or materials can come back.
- **How distinct a zone is, and what that costs.** Own tasks and props versus sharing a lot with other zones. The same dial sets the price of every change: a zone as a row in a list and a task as a form plus a word set keeps changes cheap; more bespoke work per zone gives more distinctiveness but makes every change more expensive.
- **Number of zones versus length per zone.** And how easily a zone can be added later: that needs room between zones so the rest doesn't have to shift.
- **How loosely rules and words sit relative to the theme.**
- **How tightly obstacles and structures are tied together.** A bridge over a gap, a ladder against a wall: the tighter that bond, the less free you are in what gets built where. And how quickly they escalate — ditch, ravine, gorge: the steeper that curve, the more the terrain has to grow along with it.
- **Loose spots on the side.** Underground, underwater, a small island: room to add things versus distance from the main line.

The test at every setting: could a nine-year-old explain why this happens here?

## 7. What it never does

**Never gets ahead.** A rule the child hasn't encountered yet — with the practitioner or at school — doesn't appear here. That way the module can never contradict the treatment.

**Never punishes.** No streaks, and nothing is lost for making a mistake.

**Records nothing personal about the child.** No name, age, photo or voice recording. No tracking or analytics: everything the module tracks stays on the device. The only thing that leaves the device is progress under the parent account — nothing to third parties, nothing for product improvement. No advertising.

**Never replaces the homework.** What happens offline stays the core. The module is separate from that, with overlapping content.

## 8. Why this project

It's not about revenue, but about whether we can build something children genuinely enjoy using to practise something difficult more often.

- Make dyslexia practice more enjoyable and easier to sustain.
- Help small local organisations that offer good, personal treatment but have no budget for their own software.
- Gain experience with webapps and LLMs, and build something that's actually used.
- Create a counterpart to digital "innovation" that turns out, on closer inspection, to be a digital workbook.

That's why island 1 can largely be free. If the concept works, there's room for island 2, an expansion of island 1, organisation-specific modules, or selling to other small organisations for a reasonable amount. Success here doesn't mean growth, but enough to keep existing and keep developing.

---

# Taaleiland — game design document

## 1. Overview

**Genre.** Building and discovery game with practice as the engine. Not a quiz with a game wrapped around it.

**Platform.** Web app in the browser, phone and tablet. No install, no app store.

**Target audience.** Children aged 8–10 (Dutch groep 5–6) with reading and spelling difficulties, usually in treatment. See product specification §3.

**Core concept.** A child builds up an island. Practice yields resources; resources build what's needed to get past an obstacle; behind it lies a zone the child hasn't seen yet.

**Design pillars**
- The exercise is part of the game's logic.
- Without reading text, you know where you are and what's needed now
- Playing alone is enough; showing it off is a bonus
- Not too childish

**Views** (from brainstorm.md)

1. Islands — 2D, map
2. Island — 3D, overview
2. Zone — 3D, lower and closer
3. Exercise — 2D

## 2. Core gameplay

**Main loop**

> practise → resource → build → obstacle cleared → discover next zone

**Player goals.** Short: finish the exercise and grab the resource. Medium: enough material for what needs building. Long: see what lies behind the next obstacle.

**Actions.** Practise (2D), build, view the island, enter a zone, collect. No walking or steering: the child doesn't move a character through the world.

**Win/lose.** There's no hard punishment; the island gets completed.

**Feedback** (from brainstorm.md). Not just right/wrong but also why, and immediately allowed to try again without penalty. Short loops: goal → action → feedback within seconds.

## 3. Progression

**Two clocks that aren't tied together.**

- *Fast* — the session. Starts, delivers repetition, ends with something that wasn't there before. Complete every time, even if the child then stays away for three weeks.
- *Slow* — the island that fills up over months. Passages are milestones, not gates being worked toward.

Don't link them one-to-one: the pace differs too much per child.

**Zones and passages.** A zone shows progress continuously. A passage is cleared to move on. Order is mostly linear, with small choices.

*Tension, not yet resolved:* brainstorm.md names autonomy — choice in order, pace, route — as a strong motivator, while the passages force a fixed order. Where the choice actually sits is still open.

**Visibility.** The whole island is visible from the start. No fog, no locks. What hasn't been done yet is hazier; what's done is sharp. At the end everything is sharp. *Open: what exactly "hazy" consists of — fewer props, flatter colour, softer shapes.*

**Material sequence.** Wood, then stone, then ore. One-way traffic: going back to wood after stone feels like a step backward, even with harder words. This ties the zone sequence together. (Dial: product specification §6.)

**Obstacles, increasing in scale.** Ditch → ravine → gorge. Forms from brainstorm.md.

> [!TIP]
Possible examples:
| # | Obstacle | Landform that really makes it |
|---|---|---|
| — | bridge | ravine or river |
| — | ladder | cliff edge, height difference |
| — | raft | shallow water |
| — | small boat | open water |
| — | suspension bridge | wide span |
| — | hot air balloon | unreachable plateau |
| — | land animal | vegetation or terrain you don't cross on foot |
| — | flying animal | bridge suspension |
| — | water animal | underwater zone |

## 4. Difficulty

**3–4 broad levels.** Same island, same zones, same tasks for everyone. Only the words differ. One island to build, no branching, and no child can tell it's on an easier setting.

**Setting it.** Who sets the level and when: product specification §3–4. The module doesn't change it itself.

**Adapting within an exercise.** With clear mastery, the exercise stops sooner.

**Unlocking.** The practitioner can skip something or mark it as done.

## 5. Economy

- *Building material* — comes from a zone's tasks.

**Effort, not correctness.** Finishing an exercise yields the resource. Mistakes cost nothing.

**Costs.** A passage costs several resources, so several sessions.
*Open: exact amounts — those follow from how many sessions a zone is worth.*

## 6. Exercise forms

**Principle.** A form returns across several zones with different words, different rules, different dressing and different in-game meaning. New forms are added later. A form that carries meaning in the world is stronger than one that doesn't.

> [!TIP]
**Possible examples from brainstorm.md**
| Form | Linguistic | In the world |
|---|---|---|
| Chopping | splitting a word into sounds (raam → /r/ /aa/ /m/) | chopping wood |
| Gluing | combining sounds into a word | building planks |
| Swap rows | rows differing by one letter, read at pace (kip–kap–kop) | *open* |
| Point at the word read aloud | listening and recognising | *no natural counterpart* |
| Make your own sentence or story | production instead of recognition | *open* |

> [!TIP]
**Spelling categories.** au/ou, ei/ij, other spelling-rule words, open and closed syllables, word recognition.
word flashes
fill in: ij or ei, au or ou, v f, s z, ch cht, c s k, th or t, x y q, ch as SJ, b as p, g or ch, g as zj, tie as tsie, etc
strong verbs
ij/ei words that both exist: leiden – lijden ("to lead" – "to suffer").

**Drilling for automaticity is fine, with pace and drill.** Short fast rounds, "beat your own time" against yourself, repetition with spaced repetition.

Open: which form in which zone, how many forms per zone, how many items per round.

## 7. World and content

**Candidate zones** (brainstorm.md): start camp, beach, forest, mountain, cave, volcano, sea, underwater, lake, river, waterfall, flower garden, lighthouse, harbour, ship, hot air balloon, jungle.

Not everything is a zone. A zone is recognisable from a distance, fills a zoomed-in view, has a natural edge for an obstacle, and doesn't feel like a place you've already been. Waterfall, flower garden and shipwreck are more like elements; lighthouse is a landmark.

Open: which zones, how many, in which order, and which obstacle goes where.

> [!TIP]
**Props** (brainstorm.md): lighthouse, planks, shells, waterfall, hot air balloon, saw, axe, hammer and nails, ore, trees, bridges, ladders, chests, barrels, crates, fences, boats, shipwreck field, ruined district, market quarter, storm belt, sea caves, whale skeleton, windmill, colossal statue, sea arch, blowhole that erupts on a timer.

**Collecting.** Pets. Resources.

## 8. Story

Arrival on a new island, discovering things step by step. Deliberately a fresh start, not more of the same: if the child recognises something, move on quickly; if not, no problem.

Brainstorm.md names narrative motivation as the strongest tool at this age — stronger than any points system — and states that the language must be the key, not the toll you pay. Humour belongs here too.

Open: whether there's an ongoing story, who else is on the island, why the child is there, and what the ending is.

## 9. UX

**Island view.** The whole island in view, low angle. Progress visible in what's built and what's sharp.

**Zone view.** Tap a zone: the camera descends and moves closer.

**At every start.** Visible at a glance where the child is and what's needed now — without reading.

**Read-aloud.** Web Speech API. Speed adjustable by the parent, in consultation with the practitioner. Words, not sounds.

**Typography as a tool** (brainstorm.md): variable and colour fonts, bold, colour, letter spacing to show structure within words.

**Accessibility.** Font size adjustable. No time pressure where it isn't intended.

On a mistake the child gets an immediate second try. Possibly with an explanation or a delay element to prevent click-through.

Everything touch first.

## 10. Visuals

**Style.** Low-poly, faceted, flat shaded.

**Camera.** Low angle, orbit and zoom. Descends when entering a zone.

**Cosmetic layers.** Reskins such as the pirate layer must remain possible: props swappable, not baked in.

Open: animation, effects, how much per zone is unique.

## 11. Sound

Feedback on chopping, gluing, building.

Open: music, ambient sound.

## 12. Technology

**Setup.** Web app.

**Performance target.** Phone, 60 fps.

**Storage.** See product specification §7.

**Render the cave separately** (brainstorm.md): only load the cave kit on entering, so a high tri-count doesn't count toward the island view.

## 13. Production

**MVP.** Roughly three months of content, or less provided it's a fair cross-section: multiple zones, multiple exercise forms, reuse of a form, multiple word levels, resources, building, a passage, visible progress, something to discover.

---
