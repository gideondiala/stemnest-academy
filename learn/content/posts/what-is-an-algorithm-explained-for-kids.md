---
title: "What Is an Algorithm? Explained for Kids with Everyday Examples"
description: What is an algorithm? A simple explanation for kids with everyday examples, plus sorting and searching activities and how computers use them.
date: 2026-10-13
updated: 2026-10-30
category: Tech Explained
tags: [algorithms, computational thinking, beginner, parents]
emoji: 🧭
level: Beginner
age: 8+
---

You follow algorithms every single day. Brushing your teeth, making a sandwich, getting dressed for school: each one is a list of steps, done in the right order, to get a job done. That's all an algorithm is.

The word sounds complicated, but the idea is one of the simplest and most useful in all of computing. Once you understand it, you'll start seeing algorithms everywhere.

## The simple definition

> **An algorithm is a set of step-by-step instructions for solving a problem or completing a task.**

A good algorithm has three things:

1. **Clear steps.** Each step says exactly what to do, with no guessing.
2. **The right order.** The steps happen in a sequence that makes sense.
3. **An ending.** It finishes, and you get the result you wanted.

## An everyday example: making toast

Here's an algorithm for making toast:

1. Take a slice of bread out of the bag.
2. Put the bread in the toaster.
3. Push the lever down.
4. Wait until the toast pops up.
5. Put the toast on a plate.
6. Spread butter on the toast.

Now imagine you mix up the order. Spread butter on the bread, *then* put it in the toaster? That's a smoky kitchen. **Order matters** in algorithms.

## Why computers need algorithms

Computers are incredibly fast, but they can't think for themselves. They do exactly what they're told, nothing more. A program is simply an algorithm written in a language a computer understands, like Scratch, Python or JavaScript.

That's why programmers need to be very precise. Try this fun activity with a friend or a parent.

### The "robot sandwich" challenge

One person pretends to be a robot that follows instructions *exactly*. The other person writes instructions for making a jam sandwich. The robot must do precisely what's written.

"Put jam on the bread." The robot puts the whole jar on top of the bag of bread. "Open the jar first," you add. "Pick up the knife." Which end?

It's hilarious, and it teaches the most important lesson in programming: **computers can't fill in the gaps. Your instructions have to be complete and exact.**

## Three building blocks of every algorithm

Almost every algorithm, from making toast to running a video game, is built from just three ideas.

### 1. Sequence

Doing steps one after another, in order. Toast first, then butter.

### 2. Selection (making decisions)

Choosing what to do based on a question. In code, this is an **if** statement.

> **If** it's raining, take an umbrella. **Otherwise**, wear sunglasses.

### 3. Repetition (loops)

Doing something again and again. In code, this is a **loop**.

> **Repeat** 10 times: do a star jump.
> **Keep** stirring **until** the sauce is thick.

![The three building blocks of an algorithm: sequence, such as toast then butter; selection, such as taking an umbrella if it is raining; and repetition, such as ten star jumps](/diagram-algorithm-blocks.svg)

Put those three ideas together and you can describe almost anything. Here's an algorithm for crossing the road using all three:

1. Go to the edge of the pavement. *(sequence)*
2. **Repeat** until it's safe: look right, look left, look right again, listen. *(repetition)*
3. **If** it's safe, walk straight across. *(selection)*

## Algorithms in code

Here's how a computer program uses those same building blocks. This Python code checks some test scores:

```python
scores = [72, 45, 90, 61]

for score in scores:
    if score >= 50:
        print(score, "Pass")
    else:
        print(score, "Try again")
```

- The **loop** (`for score in scores`) repeats for every score.
- The **decision** (`if score >= 50`) chooses which message to show.
- Everything happens in **sequence**, from the first line to the last.

In Scratch, the same ideas appear as blocks: `repeat` and `forever` for loops, `if then else` for decisions, and blocks stacked in order for sequence.

## Sorting: a famous kind of algorithm

Computers sort things all the time: songs by name, emails by date, search results by how useful they are. There are many different sorting algorithms. Here's one you can try with playing cards or numbered pieces of paper.

### Bubble sort (try it yourself)

Lay out five cards in a row, in a random order, for example **5, 2, 8, 1, 4**.

1. Compare the first two cards. If the left one is bigger, swap them.
2. Move one place along and compare the next pair. Swap if needed.
3. Keep going to the end of the row. The biggest card has now "bubbled" to the end.
4. Go back to the start and repeat, until you get through a whole row with no swaps.

```text
Start:   5 2 8 1 4
Pass 1:  2 5 1 4 8
Pass 2:  2 1 4 5 8
Pass 3:  1 2 4 5 8
Pass 4:  1 2 4 5 8   (no swaps, so it's sorted!)
```

Bubble sort is easy to understand, but it's slow for big lists. Computer scientists have invented faster methods, which is a big part of what they study: not just *whether* an algorithm works, but *how quickly*.

## Searching: finding things fast

Imagine looking for a word in a dictionary. You could start at page one and read every word until you find it. That's called **linear search**, and it works, but it's very slow.

What you actually do is open the dictionary near the middle, see whether your word comes before or after, and throw away the half you don't need. Then you do the same with the half that's left. This is called **binary search**, and it's astonishingly fast. A dictionary with a million words needs only about 20 halvings to find any word.

You can see binary search in action in our [number guessing game tutorial](/python-number-guessing-game-for-kids/), where the best strategy always finds a number from 1 to 100 in seven guesses or fewer.

## Algorithms you use every day (without noticing)

- **Maps apps** use algorithms to find the quickest route through thousands of roads.
- **Video and music apps** use recommendation algorithms to suggest what you might like next.
- **Search engines** use algorithms to decide which pages to show first.
- **Games** use algorithms to control enemies, work out physics, and decide what happens when you press a button.
- **Your phone's camera** uses algorithms to focus, brighten photos and recognise faces.

Some of these, like recommendations, are built with **machine learning**, where the computer learns patterns from data rather than following only hand-written steps. Find out more in [What is machine learning?](/what-is-machine-learning-explained-for-kids/)

## Algorithms and fairness

Because algorithms make decisions, it matters how they're designed. An algorithm that recommends videos decides what millions of people watch. An algorithm that sorts job applications affects people's lives. If an algorithm is built on unfair rules or unfair data, it can treat some people unfairly.

That's why good programmers think carefully, test their algorithms, and ask: *"Is this fair to everyone it affects?"*

## Try it: write your own algorithm

Pick one of these and write the steps as clearly as you can. Then give your instructions to someone else and see if they can follow them exactly:

1. How to draw a smiley face.
2. How to find the tallest person in your family.
3. How to tidy your bedroom (use at least one loop and one decision!).
4. How to play rock, paper, scissors and decide who wins.

If they get confused, your algorithm needs more detail. That's debugging, and it's exactly what programmers do.

## Frequently asked questions

**What is an algorithm in simple words?** It's a list of steps that solves a problem or gets a task done, like a recipe.

**Is an algorithm the same as a program?** Not quite. An algorithm is the plan: the steps. A program is that plan written in a programming language so a computer can follow it.

**Who invented algorithms?** People have used step-by-step methods for thousands of years, especially in mathematics. The word itself comes from the name of a ninth-century Persian mathematician, al-Khwarizmi.

**Why should kids learn about algorithms?** Thinking in algorithms helps children break big problems into small steps, plan carefully and spot mistakes. These skills help in coding, maths, science and everyday life.
