---
title: How to Make a Catch Game in Scratch (Step-by-Step for Kids)
description: Build a complete "catch the falling apples" game in Scratch 3 with a moving player, falling objects, a score, lives and game over. Every block is explained.
date: 2026-10-13
category: Learn by Doing
tags: [scratch, games, beginner, kids coding]
emoji: 🍎
level: Beginner
age: 7 to 12
---

A catch game is one of the best first games to build in Scratch. It is short enough to finish in one sitting, but it uses the big ideas every game needs: **movement, loops, conditions, variables and random numbers**.

By the end of this guide you will have a game where a bowl moves left and right, apples fall from the sky, you score a point for each catch, and you lose a life for each miss.

> **What you need:** a computer with a web browser and the free Scratch editor at [scratch.mit.edu](https://scratch.mit.edu). Click **Create** to open the editor. You do not need an account to build the game, but you need one (free) to save it online.

## How the game works

Before touching any blocks, it helps to plan. Every game is a set of rules:

1. The **player** (a bowl) moves left and right with the arrow keys.
2. An **apple** starts at the top of the screen at a random place and falls down.
3. If the apple **touches the bowl**, the score goes up by 1 and the apple starts again at the top.
4. If the apple **reaches the bottom**, the player loses a life and the apple starts again.
5. When lives reach **0**, the game is over.

Writing the rules first is what real game designers do. It turns "make a game" into small jobs you can finish one at a time.

## Step 1: Set up the stage and sprites

1. In the bottom-right corner, click **Choose a Backdrop** and pick an outdoor scene, such as *Blue Sky*.
2. Delete the cat: right-click the cat sprite in the sprite list and choose **delete**.
3. Click **Choose a Sprite** and add **Bowl**. This is your player.
4. Add a second sprite: **Apple**.

Make both sprites a sensible size. Select a sprite and change **Size** in the sprite panel. Around `80` for the bowl and `60` for the apple works well.

## Step 2: Make the bowl move

Select the **Bowl** sprite and build this script:

```scratch
when green flag clicked
go to x: (0) y: (-140)
forever
    if <key (left arrow) pressed?> then
        change x by (-10)
    end
    if <key (right arrow) pressed?> then
        change x by (10)
    end
end
```

**Why it works:**

- `go to x: 0 y: -140` puts the bowl in the middle near the bottom every time the game starts. The Scratch stage is 480 steps wide (x from -240 to 240) and 360 tall (y from -180 to 180).
- `forever` keeps checking the keys many times every second.
- `if <key pressed?>` is a **condition**: the code inside only runs when the answer is "yes".
- `change x by -10` moves left; `change x by 10` moves right.

Click the green flag and test it. Too slow? Change `10` to `15`.

## Step 3: Make the apple fall

Select the **Apple** sprite. The apple needs to start at a random place along the top, then fall.

```scratch
when green flag clicked
go to x: (pick random (-220) to (220)) y: (170)
forever
    change y by (-5)
end
```

`pick random -220 to 220` chooses a new position each time, so the player cannot guess where the apple will appear. `change y by -5` moves the apple down a little on every loop.

Test it. The apple falls... and then gets stuck at the bottom. Next, we teach it what to do when it is caught or missed.

## Step 4: Create the score and lives variables

A **variable** is a labelled box that stores a number the game needs to remember.

1. Go to the orange **Variables** category.
2. Click **Make a Variable**, name it `score`, and choose **For all sprites**.
3. Make another one called `lives`.

Tick the boxes next to both so they show on the stage.

## Step 5: Catching and missing

Replace the apple's script with this complete version:

```scratch
when green flag clicked
set [score] to (0)
set [lives] to (3)
go to x: (pick random (-220) to (220)) y: (170)
forever
    change y by (-5)
    if <touching (Bowl)?> then
        change [score] by (1)
        go to x: (pick random (-220) to (220)) y: (170)
    end
    if <(y position) < (-170)> then
        change [lives] by (-1)
        go to x: (pick random (-220) to (220)) y: (170)
    end
end
```

**Why it works:**

- At the start, the score is set to 0 and lives to 3, so every new game starts fresh.
- `touching Bowl?` checks whether the apple overlaps the bowl. If it does, we add a point and send the apple back to the top.
- `y position < -170` checks whether the apple has reached the bottom edge. If so, the player loses a life.

Play it now. You have a working game!

## Step 6: Add game over

At the moment the game never ends, even when lives go below zero. Add one more check inside the apple's `forever` loop, at the end:

```scratch
if <(lives) = (0)> then
    say [Game over!] for (2) seconds
    stop [all]
end
```

`stop all` stops every script, so the bowl and apple freeze.

**Make it look better:** paint a new backdrop called *Game Over* with big text. Then, instead of the `say` block, use `switch backdrop to (Game Over)` before `stop all`.

## Step 7: Make it get harder

Great games get more difficult as you get better. Let's make the apple fall faster as the score grows.

1. Make a new variable called `speed`.
2. In the apple's script, after `set lives to 3`, add `set [speed] to (5)`.
3. Change `change y by (-5)` to `change y by ((0) - (speed))`.
4. Inside the "caught it" part, after `change score by 1`, add `change [speed] by (0.5)`.

Now each catch makes the next apple a little faster. (We write `0 - speed` because the apple must move *down*, which means a negative number.)

## Step 8: Sound and polish

- In the apple's **Sounds** tab, add a sound such as *Pop*. Put `start sound (Pop)` inside the "caught it" part.
- Add a sound for a miss, such as *Oops*, in the "missed it" part.
- Give the bowl a short `say [Ready?] for (1) seconds` at the start.

Small touches like these are what make players say "one more go!".

## Common problems and how to fix them

| Problem | Likely cause | Fix |
|---|---|---|
| The bowl does not move | The script is on the apple, not the bowl | Select the Bowl sprite and check the script is there |
| The score goes up many times for one catch | The apple stays touching the bowl | Make sure `go to x: … y: 170` is inside the "touching" block |
| Lives never go down | The apple never reaches y < -170 | Check the number, or make the bottom check `-160` |
| Score and lives show "0" but never change | Variables were made "For this sprite only" | Delete them and make them again "For all sprites" |

## Challenges to try next

1. **Bad apples:** add a second falling sprite (a rock). Catching it costs a life.
2. **Golden apple:** a rare sprite worth 5 points that appears only sometimes. Hint: use `pick random 1 to 10` and only show it when the answer is `1`.
3. **High score:** make a variable `high score`. At game over, `if score > high score then set high score to score`.
4. **Mouse control:** replace the arrow keys with `set x to (mouse x)` inside the bowl's `forever` loop.

## What you learned

You used the core building blocks of every video game:

- **Events**: `when green flag clicked` starts everything.
- **Loops**: `forever` keeps the game running.
- **Conditions**: `if … then` decides what happens.
- **Variables**: `score`, `lives` and `speed` remember important numbers.
- **Randomness**: `pick random` keeps the game surprising.

These ideas are exactly the same in "real" programming languages such as Python and JavaScript. Once you understand them in Scratch, you are ready for more. Next, try our guide to [making a maze game in Scratch](/how-to-make-a-maze-game-in-scratch/), or read [Scratch vs Python: which should you learn first?](/scratch-vs-python-which-first/)

## Frequently asked questions

**Is Scratch free?** Yes. Scratch is a free project from the MIT Media Lab and runs in a web browser. There is also a free desktop app.

**What age is this game suitable for?** Children from about 7 can build it with a little help; 9 to 12-year-olds can usually follow it alone.

**Can I share my game?** Yes. Create a free Scratch account, save your project, and click **Share**. Ask a parent first, and never put personal information in a shared project.
