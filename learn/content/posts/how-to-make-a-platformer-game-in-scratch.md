---
title: "How to Make a Platformer Game in Scratch (Gravity, Jumping and Levels)"
description: Build a platformer in Scratch with real gravity, jumping, solid walls, lava and levels. A step-by-step Scratch 3 tutorial with every block explained.
date: 2026-10-14
category: Learn by Doing
tags: [scratch, games, intermediate, kids coding]
emoji: 🏃
level: Intermediate
age: 9 to 14
---

Platformers are the games where a character runs and jumps across ledges, like Super Mario or Geometry Dash. They look simple, but they hide one of the most satisfying ideas in game programming: **gravity**.

In this tutorial you'll build a platformer from scratch with a character that falls realistically, jumps when you press up, lands on platforms, bumps into walls, avoids lava and reaches a flag to finish the level. Then you'll add more levels.

It's a step up from beginner projects, so if you're brand new to Scratch, warm up with the [catch game](/how-to-make-a-catch-game-in-scratch/) or [maze game](/how-to-make-a-maze-game-in-scratch/) first.

> **What you need:** the free Scratch editor at [scratch.mit.edu](https://scratch.mit.edu). Click **Create**.

## How gravity works in games

In real life, a falling object gets faster and faster. Games copy this with a variable usually called **y velocity**: how fast the character is moving up or down right now.

Every fraction of a second, the game does two things:

1. **Gravity pulls:** subtract a little from y velocity, so the character speeds up as it falls.
2. **Move:** change the character's y position by the y velocity.

When you jump, you set y velocity to a big positive number. The character shoots upwards, gravity slows it down, it stops for a split second at the top, and then it falls back down faster and faster. That smooth arc is exactly what makes jumping feel good.

## Step 1: Draw the level

1. Click the **Stage**, open the **Backdrops** tab and choose **Paint**. Name the backdrop `Level 1`.
2. Draw the ground and some floating platforms using the **Rectangle** tool in **one exact colour**. We'll use green.
3. Leave gaps between platforms that are jumpable but not too easy.
4. Draw a small pool of **lava** in a second colour, like bright red, somewhere the player has to jump over.

Every surface the player can stand on must be that same green. The game will check for it, so a slightly different shade would let the player fall straight through.

## Step 2: The player sprite

1. Add a small sprite for the player. Something chunky like *Ball* or a simple square you paint yourself works best while you're learning, because odd shapes can catch on platform edges.
2. Set its **Size** so it fits comfortably on your platforms (try `40`).
3. Click **Variables**, then **Make a Variable**, name it `y velocity`, and choose **For this sprite only**.

## Step 3: Gravity and landing

Select the player and build this script:

```scratch
when green flag clicked
go to x: (-200) y: (100)
set [y velocity] to (0)
forever
    change [y velocity] by (-1)
    change y by (y velocity)
    if <touching color [green]?> then
        change y by ((0) - (y velocity))
        set [y velocity] to (0)
    end
end
```

Set the colour in the `touching color` block with the dropper tool by clicking a platform on the stage.

**What's happening:**

- Each loop, gravity reduces `y velocity` by 1, so the player falls faster and faster.
- `change y by (y velocity)` moves the player.
- If that move pushed the player into a platform, we **undo it** by moving the same distance the other way, and set the velocity to 0 because the player has landed.

Click the green flag. Your player should drop and land on the ground. That's gravity!

## Step 4: Jumping

A player should only be able to jump while standing on something, otherwise they could fly by pressing up repeatedly. The perfect place to check is the moment we detect the landing. Update the `if` block:

```scratch
if <touching color [green]?> then
    change y by ((0) - (y velocity))
    set [y velocity] to (0)
    if <key (up arrow) pressed?> then
        set [y velocity] to (12)
    end
end
```

Press up while standing on a platform and the player leaps into the air in a smooth arc. Too floaty? Make the jump `10`. Want higher jumps? Try `14`. Want heavier gravity? Change `-1` to `-1.5`. Tweaking these two numbers changes the whole feel of your game, so experiment.

## Step 5: Walking left and right with solid walls

Add this inside the same `forever` loop, **above** the gravity blocks:

```scratch
if <key (right arrow) pressed?> then
    change x by (5)
    if <touching color [green]?> then
        change x by (-5)
    end
end
if <key (left arrow) pressed?> then
    change x by (-5)
    if <touching color [green]?> then
        change x by (5)
    end
end
```

This is the same "move, check, undo" trick, but sideways. If walking would push the player into a platform, the step is cancelled, so platforms act like solid walls.

**Bonus polish:** add `point in direction (90)` in the right-arrow block and `point in direction (-90)` in the left-arrow block, and set the sprite's rotation style to left-right, so your character faces the way it's walking.

## Step 6: Lava and respawning

Add one more check inside the `forever` loop:

```scratch
if <touching color [red]?> then
    go to x: (-200) y: (100)
    set [y velocity] to (0)
end
```

Touch the lava and you're sent back to the start. If you'd like lives instead, make a `lives` variable, set it to 3 at the start, and subtract one each time.

## Step 7: The goal flag

1. Add a sprite to be the finish, like a flag or a star, and place it at the end of the level.
2. Add to the player's loop:

```scratch
if <touching (Flag)?> then
    broadcast (next level)
    wait (0.5) seconds
end
```

## Step 8: More levels

1. Paint more backdrops named `Level 2`, `Level 3` and so on, using the **same green and red**.
2. Make a variable `level` for all sprites.
3. Add this to the **Stage**:

```scratch
when green flag clicked
set [level] to (1)
switch backdrop to (Level 1)

when I receive (next level)
change [level] by (1)
if <(level) > (3)> then
    switch backdrop to (You Win)
    stop [all]
else
    switch backdrop to (join [Level ] (level))
end
```

4. On the player, add `when I receive (next level)` followed by `go to x: (-200) y: (100)` and `set [y velocity] to (0)`, so each level starts at the left.
5. Paint a `You Win` backdrop to celebrate.

If the flag needs to be in a different place on each level, give the flag sprite a `when backdrop switches to (Level 2)` script with its own `go to x: y:` block.

## Fixing common problems

| Problem | Why it happens | Fix |
|---|---|---|
| Player falls through platforms | Colour in the block doesn't exactly match | Use the dropper tool again; draw every platform in that colour |
| Player sinks slightly into the ground | Falling very fast moves it deep into the platform | Keep `y velocity` from getting too big: `if <(y velocity) < (-15)> then set [y velocity] to (-15)` |
| Player gets stuck in walls | The costume is an odd shape | Use a simple rectangular costume for collisions |
| Can't jump | The jump check is outside the landing `if` | Move the `key up arrow pressed?` check inside it, as in Step 4 |
| Player can jump again in mid-air | Jump is checked when not touching ground | Same fix as above |

That "maximum fall speed" fix in the table has a name in professional games: **terminal velocity**. It keeps the physics stable.

## Make it your own

- **Moving platforms:** a platform sprite that glides back and forth. (Tip: give moving platforms the same green colour.)
- **Coins:** sprites that add to a score and `hide` when touched.
- **Double jump:** allow one extra jump in mid-air using a `jumps left` variable.
- **Enemies:** a sprite that walks between two points and sends you back to the start.
- **Scrolling levels:** advanced, but very cool. Move the platforms instead of the player so levels can be wider than the screen.

## What you learned

You built a physics engine. That sounds grand, but it's true: velocity, gravity, collision detection and collision response are exactly what professional platformers are built on. The same ideas appear when people make games in Python, JavaScript or game engines like Unity.

Want more ideas for your next build? Browse our list of [25 Scratch project ideas](/scratch-project-ideas-for-beginners/) or try making [Flappy Bird in Scratch](/how-to-make-flappy-bird-in-scratch/), which uses the same gravity trick.

## Frequently asked questions

**Why do we use a variable for velocity instead of just "change y by"?** Because a fixed number moves at the same speed all the time, which looks robotic. A velocity that changes each frame makes falling speed up and jumps slow down at the top, just like real life.

**How do I make my player jump higher?** Increase the number in `set [y velocity] to (12)`. Bigger numbers mean higher jumps.

**Can I use a sprite for the ground instead of a colour?** Yes. Draw the level as a sprite called `Ground` and use `touching (Ground)?` instead of `touching color`. That lets you use any colours you like.

**How long does this project take?** About one to two hours for the basic level, plus as long as you like designing extra levels.
