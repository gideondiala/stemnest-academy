---
title: How to Make a Maze Game in Scratch (with Levels)
description: Make a maze game in Scratch with walls, a goal, a timer and multiple levels. A complete step-by-step Scratch 3 tutorial for beginners.
date: 2026-10-13
category: Learn by Doing
tags: [scratch, games, beginner, kids coding]
emoji: 🧩
level: Beginner
age: 8 to 13
---

Maze games are a brilliant second Scratch project. You get to **design your own level**, and you learn a powerful trick game programmers use all the time, called **collision detection**: knowing when the player bumps into something.

In this guide you will draw a maze, move a character through it with the arrow keys, stop it walking through walls, finish the level by reaching a goal, and then add a timer and more levels.

> **What you need:** the free Scratch editor at [scratch.mit.edu](https://scratch.mit.edu) (click **Create**). If you have never used Scratch, try our [catch game tutorial](/how-to-make-a-catch-game-in-scratch/) first. It is a gentle start.

## The plan

1. The **stage backdrop** is the maze. All walls are one colour (we will use dark blue).
2. The **player** moves with the arrow keys.
3. If the player **touches the wall colour**, it bounces back, so it can never go through a wall.
4. A **goal** sprite sits at the end. Touching it moves you to the next level.

## Step 1: Draw the maze

1. Click the **Stage** (bottom right), then the **Backdrops** tab.
2. Choose **Paint** to start a blank backdrop and name it `Level 1`.
3. Pick the **Rectangle** tool, set **Fill** to a dark blue, and draw thick walls. Leave paths at least as wide as your player.
4. Leave a gap on the left for the start and on the right for the finish.

**Tip:** use one exact colour for every wall. The game will check for that colour, so a slightly different shade would let the player walk straight through.

## Step 2: Add and shrink the player

1. Click **Choose a Sprite** and pick a small character. *Ball*, *Beetle* or the cat all work.
2. Set its **Size** so it fits easily through your paths (try `25` to `35`).
3. Drag it to the start of the maze. In the sprite panel, note its **x** and **y** numbers.

## Step 3: Move with the arrow keys

Select the player and build:

```scratch
when green flag clicked
go to x: (-210) y: (0)
forever
    if <key (up arrow) pressed?> then
        change y by (3)
    end
    if <key (down arrow) pressed?> then
        change y by (-3)
    end
    if <key (left arrow) pressed?> then
        change x by (-3)
    end
    if <key (right arrow) pressed?> then
        change x by (3)
    end
end
```

Replace `-210` and `0` with the start position you noted. Small steps (`3`) make the movement smooth and precise.

## Step 4: Stop the player going through walls

Here is the clever part. After each movement, we check whether the player is touching the wall colour. If it is, we **undo the move**.

Change each `if` block so it has an "undo" check inside. For the up arrow:

```scratch
if <key (up arrow) pressed?> then
    change y by (3)
    if <touching color [dark blue]?> then
        change y by (-3)
    end
end
```

To set the colour, click the colour square in the `touching color` block, choose the **dropper** tool at the bottom, and click a wall on the stage.

Do the same for the other three directions, always undoing with the opposite number:

| Arrow | Move | Undo if touching the wall |
|---|---|---|
| Up | `change y by 3` | `change y by -3` |
| Down | `change y by -3` | `change y by 3` |
| Left | `change x by -3` | `change x by 3` |
| Right | `change x by 3` | `change x by -3` |

**Why this works:** the player takes a tiny step, Scratch checks for a collision, and if there is one the step is cancelled before the screen redraws. To the player, it looks like a solid wall.

## Step 5: Add the goal

1. Add a sprite to be the goal, such as *Star*, *Gift* or a flag you paint yourself.
2. Place it at the end of the maze.
3. Add this script to the **player**, inside the `forever` loop, after the four arrow checks:

```scratch
if <touching (Star)?> then
    say [I made it!] for (2) seconds
    stop [all]
end
```

Play your maze from start to finish. Congratulations, you have made a real game!

## Step 6: Add a timer

Scratch has a built-in **timer** that counts seconds since it was last reset.

1. At the top of the player's script, after `go to x: y:`, add `reset timer`.
2. Make a variable called `time`.
3. Inside the `forever` loop, add `set [time] to (round (timer))`.

Now the stage shows how many seconds you have taken. Challenge your friends to beat your time!

## Step 7: Add more levels

Levels make players keep going. We will use **backdrops** for levels and a **broadcast** message to change between them.

1. Paint a second backdrop called `Level 2` with a harder maze (use the **same wall colour**).
2. Make a variable `level`.
3. Change the player's goal check to:

```scratch
if <touching (Star)?> then
    change [level] by (1)
    broadcast (next level)
    wait (0.5) seconds
end
```

4. On the **Stage**, add:

```scratch
when green flag clicked
set [level] to (1)
switch backdrop to (Level 1)

when I receive (next level)
if <(level) > (2)> then
    switch backdrop to (You Win)
    stop [all]
else
    switch backdrop to (join [Level ] (level))
end
```

5. Paint a `You Win` backdrop.
6. Move the player back to the start for each level: on the player, add `when I receive (next level)` → `go to x: (-210) y: (0)`. If the start or goal is in a different place on Level 2, move the Star in its own `when backdrop switches to (Level 2)` script.

`join [Level ] (level)` builds the backdrop name from the level number, so the same code works for 2, 3, 10 or 100 levels. You only need to paint them.

## Common problems

- **The player walks through walls.** The wall colour in the block does not exactly match the walls. Use the dropper tool again, and make sure every wall was drawn in the same colour.
- **The player gets stuck in a wall.** The player sprite is too big or the steps are too large. Make the sprite smaller or use `2` instead of `3`.
- **The game finishes straight away.** The goal is touching the start area. Move the Star further away.

## Challenges to try next

1. **Keys and doors:** add a key sprite. Doors (a different colour) only stop the player until the key is collected.
2. **Moving enemies:** add a ghost that glides between two points; touching it sends the player back to the start.
3. **Lives:** give the player 3 lives and lose one each time they touch an enemy.
4. **Collect coins:** coins add to the score and disappear (`hide`) when touched.

## What you learned

- **Collision detection** with `touching color`, and the "move, check, undo" pattern.
- **Broadcasts** to send messages between sprites and the stage.
- **Backdrops as levels**, and building names with `join`.
- Using the built-in **timer**.

The "move, check, undo" pattern is used in professional 2D games too. When you move on to Python or JavaScript, you will meet exactly the same idea. Read [Scratch vs Python](/scratch-vs-python-which-first/) to see what comes next.

## Frequently asked questions

**Can I use a sprite as the maze instead of the backdrop?** Yes. Draw the maze as a sprite and use `touching (Maze)?` instead of `touching color`. This lets you use any colours you like.

**Why not just use `move 10 steps` and `point in direction`?** You can, but arrow keys with `change x` and `change y` give simpler, tighter control for mazes.

**How many levels should a maze game have?** Three to five levels that get gradually harder is perfect for a first version.
