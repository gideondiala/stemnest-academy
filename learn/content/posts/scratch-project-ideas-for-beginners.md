---
author: adorable-nwabugo
title: "25 Easy Scratch Project Ideas for Beginners (From First Steps to Real Games)"
description: 25 easy Scratch project ideas for kids and beginners, from talking pets to platformers, grouped by difficulty with the key blocks for each.
date: 2026-10-13
category: Learn by Doing
tags: [scratch, projects, beginner, kids coding, games]
emoji: 💡
level: Beginner
age: 7 to 13
---

Every young coder hits the same wall sooner or later. They have learned to make the cat move and say hello, and then comes the big question: *"What should I make now?"*

This list is our answer. It's 25 Scratch project ideas, starting with ones a seven-year-old can finish in half an hour and building up to proper games with scores, levels and enemies. For each idea you'll find what it teaches and the main blocks you'll need, so you can pick something that stretches you just the right amount.

> **New to Scratch?** It's free at [scratch.mit.edu](https://scratch.mit.edu). Click **Create** to start. If you want a step-by-step walkthrough first, try our [catch game tutorial](/how-to-make-a-catch-game-in-scratch/).

## Level 1: First steps (great for ages 7 and up)

These projects use only a handful of blocks. They're about getting comfortable with events, motion and looks.

### 1. Talking pet

Choose an animal sprite and make it say different things when you click it. Add a sound for each one.

**Teaches:** events, the `say` block, sounds. **Key blocks:** `when this sprite clicked`, `say [Hello!] for (2) seconds`, `start sound`.

### 2. Dance party

Pick two or three characters that have dance costumes (Scratch has several, like the dancers in the sprite library). Use `next costume` inside a loop to make them dance to music.

**Teaches:** loops and costumes. **Key blocks:** `forever`, `next costume`, `wait (0.3) seconds`, `play sound until done`.

### 3. Name animation

Spell your name with letter sprites from the library. Make each letter do something different when clicked: spin, change colour, grow, or play a sound.

**Teaches:** working with several sprites, effects. **Key blocks:** `turn (15) degrees`, `change [color] effect by (25)`, `change size by (10)`.

### 4. Underwater scene

Choose an underwater backdrop, add fish that swim back and forth, and make bubbles float up.

**Teaches:** movement and bouncing. **Key blocks:** `move (5) steps`, `if on edge, bounce`, `set rotation style [left-right]`.

### 5. Greeting card

Make an animated birthday or holiday card for someone in your family. Add a message that appears letter by letter, music, and a surprise when they click.

**Teaches:** timing and sequencing. **Key blocks:** `wait`, `show`, `hide`, `switch backdrop to`.

## Level 2: Interactive projects (ages 8 and up)

Now your projects start to respond to the player. You'll use keyboard controls, conditions and your first variables.

### 6. Keyboard-controlled character

Move a character around the stage with the arrow keys. Make it change costume as it walks so it looks like it's really moving.

**Teaches:** key events and coordinates. **Key blocks:** `when [right arrow] key pressed`, `change x by (10)`, `point in direction (90)`.

### 7. Virtual piano

Draw or choose eight key sprites. When you click each one (or press a keyboard key), it plays a different note. Scratch's **Music** extension has a `play note` block that makes this easy.

**Teaches:** extensions, events. **Key blocks:** `play note (60) for (0.5) beats` from the Music extension.

### 8. Drawing app

Use the **Pen** extension to draw on the stage by moving a sprite with the mouse. Add buttons to change colour, change pen size, and clear the screen.

**Teaches:** the Pen extension, following the mouse. **Key blocks:** `go to [mouse-pointer]`, `pen down`, `pen up`, `set pen color to`, `erase all`.

### 9. Quiz game

Ask questions with the `ask` block and check the answer. Keep score in a variable and say the final result at the end.

**Teaches:** input, conditions, variables. **Key blocks:** `ask [What is 6 x 7?] and wait`, `if <(answer) = [42]> then`, `change [score] by (1)`.

### 10. Clicker game

Click a cookie (or a coin, or a star) to earn points. Spend points on upgrades that earn points automatically.

**Teaches:** variables and simple game economy. **Key blocks:** `when this sprite clicked`, `change [points] by (1)`, a `forever` loop that adds points every second.

### 11. Digital pet

Create a pet with hunger and happiness meters that slowly go down. Feeding and playing buttons push them back up. If a meter reaches zero, the pet looks sad.

**Teaches:** variables that change over time. **Key blocks:** `change [hunger] by (-1)`, `wait (2) seconds`, `if <(hunger) < [3]> then`.

### 12. Animated story

Write a short story with two characters who talk to each other across several scenes. Use broadcasts so one character speaks only when the other has finished.

**Teaches:** broadcasts and scene changes. **Key blocks:** `broadcast [scene 2]`, `when I receive [scene 2]`, `switch backdrop to`.

## Level 3: Real games (ages 9 and up)

These are proper games with goals, scores and ways to win or lose. Each one teaches a core game-design skill.

### 13. Catch the falling objects

Move a basket left and right to catch falling apples. Score points for catches and lose lives for misses.

**Teaches:** random positions, collisions, lives. Full step-by-step guide: [how to make a catch game in Scratch](/how-to-make-a-catch-game-in-scratch/).

### 14. Maze game

Draw a maze and guide a character to the exit without touching the walls. Add a timer and more levels.

**Teaches:** colour collision and levels. Full guide: [how to make a maze game in Scratch](/how-to-make-a-maze-game-in-scratch/).

### 15. Whack-a-mole

Moles pop up from random holes for a short time. Click them before they hide to score points.

**Teaches:** random timing, `show` and `hide`, clicking. **Key blocks:** `go to x: (pick random ...) y: (...)`, `wait (pick random (0.5) to (1.5)) seconds`.

### 16. Pong

Two paddles and a bouncing ball. Play against a friend on one keyboard, or make one paddle follow the ball for a computer opponent.

**Teaches:** bouncing angles and two-player controls. **Key blocks:** `if <touching [Paddle]?> then`, `point in direction ((0) - (direction))`, which flips the ball back the way it came.

### 17. Flappy Bird

Tap to flap and fly through gaps between moving pipes. It's a great introduction to gravity and clones. Full guide: [how to make Flappy Bird in Scratch](/how-to-make-flappy-bird-in-scratch/).

### 18. Space shooter

Fly a spaceship along the bottom of the screen and shoot asteroids. Use clones for the lasers and the asteroids.

**Teaches:** clones, which let one sprite make many copies of itself. **Key blocks:** `create clone of [myself]`, `when I start as a clone`, `delete this clone`.

### 19. Platformer

Jump between platforms, avoid hazards and reach the flag. This is the game that teaches gravity properly. Full guide: [how to make a platformer game in Scratch](/how-to-make-a-platformer-game-in-scratch/).

### 20. Racing game

A top-down car that you steer with the arrow keys around a track. Driving onto the grass slows you down; crossing the finish line records your lap time.

**Teaches:** direction-based movement, colour sensing, timers. **Key blocks:** `move (speed) steps`, `turn (5) degrees`, `if <touching color [green]?> then`.

## Level 4: Challenges (ages 10 and up)

Ready to push yourself? These projects combine many skills and need careful planning.

### 21. Two-player fighting game

Two characters on one keyboard, each with movement, a jump and an attack. Health bars go down when hit.

**Teaches:** managing lots of variables and states at once.

### 22. Tower defence

Enemies walk along a path while you place towers that shoot them automatically.

**Teaches:** clones, distance checking, and lists.

### 23. Snake

The classic game where a snake grows longer every time it eats. You'll need lists to remember where each part of the body is.

**Teaches:** lists, which are one of the most powerful tools in Scratch.

### 24. Interactive quiz show with levels

A full game show with categories, a timer for each question, lifelines, and a high-score table saved in a list.

**Teaches:** lists, timers and organising a big project.

### 25. Your own invention

The best project of all is the one you dream up. Mix ideas from this list, or make a game about something you love: football, dinosaurs, space, your favourite book. Plan it on paper first, then build it one small piece at a time.

## Tips for finishing projects (not just starting them)

- **Start small.** Get the most basic version working first, then add features. A finished simple game beats an unfinished amazing one.
- **Write the rules down first.** What does the player do? How do you win? How do you lose?
- **Test often.** Click the green flag after every few blocks. It's much easier to find a problem in five new blocks than in fifty.
- **Use "See inside".** On the Scratch website you can open other people's shared projects and look at their code. It's one of the best ways to learn, as long as you give credit if you remix.
- **Ask for feedback.** Let a friend or family member play. Watching someone else play shows you exactly what is confusing or too hard.

## For parents and teachers

These projects work well as weekly challenges at home or in a coding club. Younger children often enjoy Level 1 projects with an adult nearby, while 10 to 13-year-olds can usually work through Level 3 independently. If your child races through the list and wants a bigger challenge, it may be time to try text-based coding. Our comparison of [Scratch vs Python](/scratch-vs-python-which-first/) explains how to tell when they're ready.

## Frequently asked questions

**What is the easiest Scratch project for a beginner?** A talking pet or a dance party. Both need only a few blocks and give a fun result in under 30 minutes.

**What age is Scratch for?** Scratch is designed for children aged about 8 to 16, but younger children can enjoy simple projects with help. ScratchJr is a simpler app for ages 5 to 7.

**Can you make real games in Scratch?** Yes. Scratch can make platformers, shooters, puzzle games and much more. Many of the skills carry straight over to other programming languages.

**Is it okay to copy Scratch projects?** Looking at other projects to learn is encouraged. If you remix a project, Scratch automatically credits the original creator, and it's good manners to say thank you in your notes.
