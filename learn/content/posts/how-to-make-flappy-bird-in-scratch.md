---
title: "How to Make Flappy Bird in Scratch (Step-by-Step Tutorial)"
description: Make Flappy Bird in Scratch step by step: gravity, flapping, endless pipes with clones, scoring and a high score. An easy tutorial for kids.
date: 2026-10-14
category: Learn by Doing
tags: [scratch, games, intermediate, kids coding]
emoji: 🐦
level: Intermediate
age: 9 to 14
---

Flappy Bird took over the world's phones back in 2014. The game is ridiculously simple: tap to flap, fly through the gaps between pipes, and don't touch anything. It's also ridiculously hard to put down.

That simplicity makes it a perfect Scratch project. In this tutorial you'll build your own version and learn two big ideas along the way: **gravity**, which makes the bird fall naturally, and **clones**, which let one pipe sprite create an endless stream of obstacles.

> **What you need:** the free Scratch editor at [scratch.mit.edu](https://scratch.mit.edu). Click **Create**. If you've never used variables in Scratch, try our [catch game](/how-to-make-a-catch-game-in-scratch/) first.

## The plan

- The **bird** falls because of gravity. Pressing space (or clicking) makes it flap upwards.
- **Pipes** appear on the right with a gap at a random height, then slide to the left.
- Flying through a gap scores a point.
- Touching a pipe or the ground ends the game.

## Step 1: Set the scene

1. Delete the cat sprite.
2. Choose a backdrop. *Blue Sky* works nicely.
3. Add a bird. The **Parrot** sprite in the Scratch library has flapping costumes, which is perfect. Set its size to around `35`.

## Step 2: Gravity and flapping

Select the bird. Make a variable called `speed` (For this sprite only). Then build:

```scratch
when green flag clicked
go to x: (-120) y: (0)
set [speed] to (0)
forever
    change [speed] by (-0.6)
    change y by (speed)
    if <key (space) pressed?> then
        set [speed] to (6)
    end
end
```

**How it works:** every frame, gravity makes `speed` a bit more negative, so the bird falls faster and faster. Pressing space sets `speed` to 6, which throws the bird upwards before gravity takes over again. This is the same idea used in our [platformer tutorial](/how-to-make-a-platformer-game-in-scratch/).

Try it. Holding space makes the bird shoot up like a rocket, which isn't very Flappy-Bird-like. We want one flap per press.

## Step 3: One flap per press

Replace the `if key space pressed` part with this version, which only flaps when the key goes down, not while it's held:

```scratch
if <key (space) pressed?> then
    if <(flapped) = (0)> then
        set [speed] to (6)
        set [flapped] to (1)
        next costume
    end
else
    set [flapped] to (0)
end
```

Make a new variable `flapped` first. It remembers whether we've already flapped for this key press. When the key is released, it resets to 0, ready for the next flap. The `next costume` makes the wings move.

**Tip:** to play with the mouse or a touchscreen too, use `<<key (space) pressed?> or <mouse down?>>` as the condition.

## Step 4: Tilt the bird

Real Flappy Bird tilts up when it flaps and nose-dives as it falls. Add this inside the `forever` loop:

```scratch
point in direction ((90) - ((speed) * (4)))
```

When `speed` is positive (going up), the bird points up a little. When it's negative (falling), it tips down. Small touches like this make your game feel polished.

## Step 5: Draw the pipe

1. Click **Paint** to create a new sprite called `Pipe`.
2. Draw a **tall green rectangle at the top** and another **at the bottom**, with a gap in the middle about three times the height of your bird. Both pieces are part of one costume.
3. Make the costume taller than the stage (stretch it beyond the top and bottom of the drawing area) so that moving it up and down never shows the ends.

Keeping both pipes and the gap in one costume makes things easy: moving the sprite up or down moves the gap.

## Step 6: Endless pipes with clones

A **clone** is a copy of a sprite that runs its own scripts. Instead of drawing twenty pipes, one pipe sprite will make copies of itself forever.

Select the **Pipe** sprite:

```scratch
when green flag clicked
hide
forever
    create clone of (myself)
    wait (1.8) seconds
end

when I start as a clone
go to x: (260) y: (pick random (-90) to (90))
show
repeat until <(x position) < (-260)>
    change x by (-3)
end
delete this clone
```

**What's happening:**

- The original pipe hides and acts as a factory, making a new clone every 1.8 seconds.
- Each clone starts just off the right edge at a random height, so the gap moves up and down.
- It slides left until it's off the left edge, then deletes itself so the game doesn't fill up with invisible pipes.

Change `pick random (-90) to (90)` to make the gaps vary more or less, and `wait (1.8) seconds` to change the spacing.

## Step 7: Crashing

Back on the **bird**, add a check inside its `forever` loop:

```scratch
if <<touching (Pipe)?> or <(y position) < (-170)>> then
    broadcast (game over)
    stop [this script]
end
```

And add a separate script to stop everything neatly:

```scratch
when I receive (game over)
say [Ouch!] for (1) seconds
stop [all]
```

Hitting a pipe or falling to the bottom of the screen ends the game.

## Step 8: Scoring

Make a variable `score` **for all sprites** and tick it so it shows on the stage. Set it to 0 when the green flag is clicked (on the bird's script, before the `forever` loop).

The simplest way to score is to give a point each time a pipe passes the bird. In the **pipe clone** script, change the `repeat until` loop to:

```scratch
set [scored] to (0)
repeat until <(x position) < (-260)>
    change x by (-3)
    if <<(x position) < (-120)> and <(scored) = (0)>> then
        change [score] by (1)
        set [scored] to (1)
    end
end
```

Make `scored` a variable **for this sprite only**, so every clone has its own copy. The moment a pipe passes the bird's x position (-120), it adds one point, and `scored` stops it adding more.

## Step 9: High score

Make a variable `high score` for all sprites. In the bird's `when I receive (game over)` script, before `stop all`, add:

```scratch
if <(score) > (high score)> then
    set [high score] to (score)
end
```

Now the best score stays on screen between games, as long as the project stays open.

## Common problems

- **The bird flies off the top.** Add `if <(y position) > (170)> then set y to (170)` to keep it on screen.
- **Pipes appear on the left.** Check the clone goes to `x: 260`, not `x: -260`.
- **The game ends instantly.** The original pipe sprite may be visible and touching the bird. Make sure the green flag script starts with `hide`.
- **Score goes up by lots at once.** The `scored` variable must be "For this sprite only".

## Make it harder (or easier)

- **Speed up over time:** change the pipe speed from `-3` to `(-3) - ((score) / (10))`.
- **Smaller gaps:** draw a second pipe costume with a narrower gap and switch to it when the score passes 10.
- **Sound effects:** a flap sound in the flap block and a crash sound on game over.
- **Start screen:** show "Press space to start" and only begin when the player is ready.

## What you learned

- **Velocity and gravity** for natural movement.
- Detecting a **single key press** with a helper variable.
- **Clones** to create endless objects from one sprite, and why deleting them matters.
- Using **local variables** so each clone keeps its own information.

Clones are one of the most powerful tools in Scratch. Once you're comfortable with them, you can build space shooters, rain effects, tower defence games and much more. Find your next challenge in our list of [25 Scratch project ideas](/scratch-project-ideas-for-beginners/).

## Frequently asked questions

**What is a clone in Scratch?** A clone is a temporary copy of a sprite. It looks the same and runs any `when I start as a clone` scripts. Clones are deleted when the project stops or when they run `delete this clone`.

**Is there a limit to how many clones I can make?** Yes, Scratch allows up to 300 clones at once. That's why each pipe deletes itself after leaving the screen.

**Why does my bird fall too fast?** Make the gravity number smaller, for example `-0.4` instead of `-0.6`.

**Can I play my Flappy Bird game on a phone?** Shared Scratch projects can be played in a phone browser, but use `mouse down?` as well as the space key so a tap makes the bird flap.
