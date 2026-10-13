---
title: "How to Debug Your Code: 12 Simple Tips for Beginners"
description: Code not working? 12 simple debugging tips for beginners, from reading error messages to rubber duck debugging, with Python, JavaScript and Scratch examples.
date: 2026-10-14
category: Learn by Doing
tags: [debugging, python, javascript, scratch, beginner]
emoji: 🐞
level: Beginner
age: 10+
---

Here's a secret that surprises most beginners: professional programmers spend a huge part of their day fixing things that don't work. Bugs aren't a sign that you're bad at coding. They're simply part of coding, for everyone.

What separates experienced programmers from beginners isn't that they make fewer mistakes. It's that they have a calm, step-by-step way of finding them. That skill is called **debugging**, and you can learn it.

## Why is it called a bug?

Engineers were calling problems "bugs" long before computers existed. The word became famous in computing thanks to a story from 1947, when the team working on the Harvard Mark II computer found a real moth stuck in one of its relays. They taped it into their logbook with the note "first actual case of bug being found". The term stuck.

## The debugging mindset

Before the tips, one idea that changes everything: **the computer is doing exactly what you told it to do.** Not what you meant, what you *wrote*. Your job is to find the gap between the two.

That means a bug is a puzzle, not a disaster. Stay curious, and you'll find it.

## 1. Read the error message (really read it)

When a program crashes, it usually tells you why. Beginners often panic and skip the message, but it's the most useful clue you'll get.

Here's a Python error:

```text
Traceback (most recent call last):
  File "game.py", line 4, in <module>
    print("Score: " + score)
TypeError: can only concatenate str (not "int") to str
```

Read it **from the bottom up**:

- The **last line** says what went wrong: you tried to join text (`str`) with a number (`int`).
- The lines above show **where**: line 4 of `game.py`.

The fix is to turn the number into text: `print("Score: " + str(score))`.

In JavaScript, errors appear in the browser's **Console**. Press **F12** (or right-click and choose **Inspect**) and open the Console tab. Red messages tell you the problem and the line number.

## 2. Look at the line before

Error messages point to where the computer *noticed* a problem, which isn't always where you *made* it. A missing bracket or quotation mark on line 7 might only cause an error on line 8. If the line the error points to looks fine, check the one just above it.

## 3. Print things out

The simplest debugging tool in the world is also one of the most powerful: show yourself what's happening.

```python
total = 0
for price in [2, 5, 3]:
    total = price
    print("price:", price, "total:", total)
print("Final total:", total)
```

Running this prints:

```text
price: 2 total: 2
price: 5 total: 5
price: 3 total: 3
Final total: 3
```

Now the bug jumps out. `total` is being replaced each time instead of added to. The line should be `total = total + price`.

In JavaScript, use `console.log(value)`. In Scratch, use a `say` block or tick a variable so it shows on the stage.

## 4. Check your spelling and capital letters

Computers are extremely fussy. To a computer, `Score`, `score` and `scroe` are three completely different things. A huge number of beginner bugs are simple typos.

Common culprits:

- A variable name spelled differently in two places.
- Capital letters: `Print` instead of `print` in Python.
- In Scratch, a broadcast message with a slightly different name than the `when I receive` block.

## 5. Check the brackets, quotes and colons

Every opening bracket `(`, `[` or `{` needs a matching closing one. Every opening quote needs a closing quote. In Python, every `if`, `for`, `while` and `def` line ends with a colon `:`.

Most code editors highlight matching brackets when you click next to one. Use that feature.

## 6. Check the indentation (Python)

Python uses spaces at the start of lines to decide which code belongs together.

```python
for i in range(3):
    print("Inside the loop")
print("After the loop")
```

Move the last line in by four spaces, and it runs three times instead of once. No error message appears, just the wrong result. If your loop does something odd, check which lines are indented.

## 7. Change one thing at a time

When you're frustrated, it's tempting to change five things at once and hope. Don't. If it starts working, you won't know which change fixed it. If it gets worse, you won't know which change broke it.

Change one thing, run the program, see what happens. Then the next.

## 8. Test small pieces

Long programs are hard to debug because the bug could be anywhere. Build and test in small steps. Write a few lines, run them, check they work, then add more.

If a big program is already broken, try commenting parts out (put `#` in front of lines in Python or `//` in JavaScript) until it works again. The bug is in the last piece you turned off.

## 9. Explain it to a rubber duck

This one sounds silly, and it works. Programmers call it **rubber duck debugging**: you explain your code, line by line, out loud, to a rubber duck (or a toy, a pet, or a patient sibling).

Halfway through explaining what a line *should* do, you often realise it doesn't do that at all. Saying it out loud forces your brain to slow down and check every step instead of assuming.

## 10. Check your assumptions

Bugs often hide in things you're *sure* are fine. "This variable definitely starts at 0." Does it? "This function definitely runs." Does it? Add a print statement and prove it.

A good question to ask: **"What do I expect to happen at this exact line, and what actually happens?"**

## 11. Take a break

If you've been staring at the same bug for twenty minutes, step away. Get a drink, walk around, come back in ten minutes. It's amazing how often the problem is obvious with fresh eyes. This isn't giving up; it's a genuine debugging technique.

## 12. Ask for help the smart way

When you're truly stuck, ask a teacher, tutor, friend or online community. You'll get better help, faster, if you include:

- **What you're trying to do.**
- **What happens instead,** including the full error message.
- **What you've already tried.**
- **The smallest piece of code** that shows the problem.

Often, just writing the question out clearly helps you spot the answer before you send it.

## Debugging in Scratch

Scratch doesn't show error messages, but bugs still happen. Scratch-specific tips:

- **Click a single script** to run just that script and watch what it does.
- **Show variables** on the stage (tick the box next to them) to see their values change.
- **Add `say` blocks** to show what's happening, like `say (join [lives: ] (lives))`.
- **Check which sprite the script is on.** A perfect script on the wrong sprite does nothing useful.
- **Check that broadcasts match** exactly, including spaces.

## A quick debugging checklist

When something isn't working, go through these in order:

1. What does the error message say, and which line?
2. Are there typos or capital letter mistakes?
3. Are all brackets, quotes and colons matched?
4. Is the indentation right?
5. What are the variables actually doing? Print them.
6. What did I change most recently?
7. Can I explain each line out loud?

## The good news

Every bug you fix teaches you something you'll never forget. The first time you spend an hour hunting for a missing colon, you'll never miss a colon again. Experienced programmers aren't people who never see bugs. They're people who have fixed thousands of them.

Practise on real projects: try our [10 Python projects for beginners](/python-projects-for-beginners/) or the [number guessing game](/python-number-guessing-game-for-kids/), and fix whatever goes wrong along the way.

## Frequently asked questions

**What does debugging mean?** Debugging is the process of finding and fixing mistakes, called bugs, in a computer program.

**What is the most common bug for beginners?** Typos and spelling mistakes in variable names, followed by missing brackets, quotes or colons, and (in Python) incorrect indentation.

**Is it normal to spend a long time fixing bugs?** Yes. Even professional developers regularly spend more time debugging than writing new code. It gets faster with practice.

**What is rubber duck debugging?** It's explaining your code out loud, line by line, to an object such as a rubber duck. Talking it through helps you notice where the code doesn't do what you think.
