---
title: "How to Make a Space Shooter Game in Scratch (Clones, Lasers and Lives)"
description: Build an arcade space shooter in Scratch 3 with a moving spaceship, lasers, falling asteroids, explosions, score and lives. A step-by-step tutorial for kids.
date: 2026-10-21 09:00
category: Learn by Doing
tags: [scratch, games, intermediate, kids coding]
emoji: 🚀
level: Intermediate
age: 9 to 14
---

Space shooters are arcade classics. You fly a spaceship along the bottom of the screen, blast asteroids before they hit you, and try to survive as long as possible. They're also the perfect project for mastering **clones**, one of Scratch's most powerful features.

In this tutorial you'll build a complete game with a ship you control, lasers you fire with the space bar, asteroids that fall from the sky, explosions, a score, lives and a game over screen.

> **What you need:** the free Scratch editor at [scratch.mit.edu](https://scratch.mit.edu). If you've never used clones, the [Flappy Bird tutorial](/how-to-make-flappy-bird-in-scratch/) is a gentle introduction, but this guide explains everything you need.

## The plan

- The **ship** moves left and right along the bottom.
- Pressing **space** fires a **laser** upwards. Each laser is a clone.
- **Asteroids** appear at random places along the top and fall down. Each asteroid is a clone too.
- A laser hitting an asteroid destroys both and scores a point.
- An asteroid hitting the ship costs a life. No lives left means game over.

## Step 1: Set the scene

1. Delete the cat sprite.
2. Choose a space backdrop, such as *Stars* or *Galaxy*.
3. Add a ship sprite. The **Rocketship** sprite works well. Set its size to around `50`.
4. Add a **Rocks** sprite for the asteroids (size `60`), or paint your own.
5. Paint a new sprite for the laser: a small, thin, bright rectangle. Name it `Laser`.

Then make two variables **for all sprites**: `score` and `lives`.

## Step 2: Move the ship

Select the **ship**:

```scratch
when green flag clicked
set [score] to (0)
set [lives] to (3)
go to x: (0) y: (-140)
point in direction (0)
forever
    if <key (left arrow) pressed?> then
        change x by (-7)
    end
    if <key (right arrow) pressed?> then
        change x by (7)
    end
end
```

`point in direction (0)` makes the rocket face upwards. The ship slides left and right along the bottom. Scratch stops sprites going completely off the edge, so you don't need to worry about it disappearing.

## Step 3: Fire lasers with clones

Select the **Laser** sprite. The original laser stays hidden and acts as a "laser factory":

```scratch
when green flag clicked
hide
forever
    if <key (space) pressed?> then
        create clone of (myself)
        wait (0.25) seconds
    end
end

when I start as a clone
go to (Rocketship)
show
repeat until <touching (edge)?>
    change y by (12)
end
delete this clone
```

**How it works:**

- Every time space is pressed, the laser makes a copy of itself. The `wait (0.25) seconds` limits how fast you can fire, so you can't just hold space and fill the screen.
- Each clone jumps to the ship, appears, and flies upwards until it touches the edge of the stage.
- Then it deletes itself. This matters: Scratch allows up to 300 clones at a time, and lasers that keep flying offscreen forever would soon use them all.

**Tip:** if the laser starts in the middle of the ship, add `change y by (30)` after `go to (Rocketship)` so it appears at the nose.

## Step 4: Falling asteroids

Select the **Rocks** sprite:

```scratch
when green flag clicked
hide
forever
    create clone of (myself)
    wait (pick random (0.6) to (1.4)) seconds
end

when I start as a clone
go to x: (pick random (-220) to (220)) y: (180)
set size to (pick random (40) to (80)) %
show
repeat until <(y position) < (-170)>
    change y by (-4)
    turn right (3) degrees
end
delete this clone
```

Each asteroid starts at a random place along the top with a random size, then falls and slowly spins. Random waits between asteroids keep players on their toes.

## Step 5: Hitting asteroids

Now the satisfying part. Add a check **inside the asteroid clone's loop** so it explodes when a laser touches it. Replace the `repeat until` loop with this version:

```scratch
repeat until <(y position) < (-170)>
    change y by (-4)
    turn right (3) degrees
    if <touching (Laser)?> then
        change [score] by (1)
        start sound (Pop)
        repeat (5)
            change size by (15)
            change [ghost] effect by (20)
        end
        delete this clone
    end
end
```

(Add the *Pop* sound to the Rocks sprite first: open its **Sounds** tab and choose **Pop** from the library.)

When a laser hits, the score goes up, a sound plays, and the asteroid quickly grows and fades out for a simple explosion effect before disappearing.

**Should the laser disappear too?** In most shooters, yes. In the laser clone's loop, change `repeat until <touching (edge)?>` to:

```scratch
repeat until <<touching (edge)?> or <touching (Rocks)?>>
```

Now the laser stops when it hits an asteroid.

## Step 6: Losing lives

Asteroids that hit the ship should cost a life. Add another check inside the asteroid clone's loop:

```scratch
if <touching (Rocketship)?> then
    change [lives] by (-1)
    broadcast (ship hit)
    delete this clone
end
```

And on the **ship**, add a script to flash when hit and to end the game:

```scratch
when I receive (ship hit)
repeat (4)
    set [ghost] effect to (70)
    wait (0.1) seconds
    set [ghost] effect to (0)
    wait (0.1) seconds
end
if <(lives) < (1)> then
    broadcast (game over)
end

when I receive (game over)
hide
say [Game over!]
stop [all]
```

For a nicer ending, paint a **Game Over** backdrop and add `switch backdrop to (Game Over)` before `stop all`.

## Step 7: Make it get harder

Games should get tougher as you improve. Make the asteroids fall faster as the score rises. In the asteroid clone, change `change y by (-4)` to:

```scratch
change y by ((-4) - ((score) / (10)))
```

Every 10 points, asteroids fall one step faster per frame. You can also make them appear more often by changing the wait to `wait (pick random (0.4) to (1)) seconds` once the score passes 20.

## Step 8: Polish

- **Sounds:** a laser sound when firing, an explosion sound when asteroids break.
- **Scrolling stars:** a stars sprite that moves down slowly and jumps back to the top, to give a feeling of speed.
- **High score:** a `high score` variable updated at game over (`if score > high score then set high score to score`).
- **Start screen:** show "Press space to start" before the game begins.

## Fixing common problems

| Problem | Fix |
|---|---|
| Lasers don't appear | Make sure the clone script has `show`, and the original `hide` is only in the green flag script |
| The game freezes or slows down | Clones aren't being deleted. Check every clone ends with `delete this clone` |
| One asteroid takes many lives | `delete this clone` must be inside the `touching Rocketship` check |
| Score goes up but asteroids keep falling | The `delete this clone` is outside the `if touching Laser` block |
| Lasers fire from the wrong place | Check `go to (Rocketship)` names your ship sprite correctly |

## Challenges

1. **Power-ups:** a falling star that gives triple lasers for ten seconds.
2. **Enemy ships** that move sideways and shoot back.
3. **Boss battle:** a giant asteroid every 50 points that takes ten hits.
4. **Shields:** a shield variable that absorbs one hit before lives are lost.

## What you learned

- Using **clones** for many objects from one sprite, and why deleting them matters.
- **Collision detection** between different sprites.
- **Broadcasts** to coordinate events like being hit and game over.
- **Difficulty curves** with maths based on the score.
- Simple **visual effects** with size and ghost.

These are the same techniques used in professional 2D games. Looking for your next challenge? Try a [platformer with real gravity](/how-to-make-a-platformer-game-in-scratch/), or browse our [25 Scratch project ideas](/scratch-project-ideas-for-beginners/).

## Frequently asked questions

**What is a clone in Scratch?** A clone is a temporary copy of a sprite that runs its own `when I start as a clone` scripts. Clones are perfect for things that appear many times, like lasers and asteroids.

**Why does my game slow down after a while?** Clones that are never deleted keep running in the background. Make sure every laser and asteroid clone ends with `delete this clone`.

**How do I stop the player firing too fast?** Add a short `wait` after `create clone of (myself)` in the laser script. A quarter of a second works well.

**Can I play this game on a tablet?** Scratch games work in a tablet browser, but this game needs a keyboard. For touch screens, try making the ship follow the finger with `set x to (mouse x)` and fire when `mouse down?`.
