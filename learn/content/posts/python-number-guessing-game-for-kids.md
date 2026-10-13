---
title: "Python for Kids: Build a Number Guessing Game (Step by Step)"
description: Write your first Python game: a number guessing game with hints, a guess counter and play again. Every line explained for kids and beginners.
date: 2026-10-13
category: Learn by Doing
tags: [python, games, beginner, kids coding]
emoji: 🎯
level: Beginner
age: 10+
---

"I'm thinking of a number between 1 and 100…" The guessing game is the perfect first Python project. In about 25 lines of code you will use the most important ideas in programming: **variables, input, conditions, loops and random numbers**.

By the end, your game will:

- pick a secret number,
- tell the player "too high" or "too low" after each guess,
- count the guesses,
- cope with mistakes (like typing a word instead of a number),
- ask "Play again?".

> **What you need:** Python 3. Download it free from python.org, or install **Thonny** (thonny.org), a beginner-friendly editor that comes with Python built in. On a Chromebook or school computer, you can use a free online Python editor such as Replit or Trinket.

## Step 1: Say hello

Create a new file called `guess.py` and type:

```python
print("Welcome to the Number Guessing Game!")
print("I'm thinking of a number between 1 and 100.")
```

Run it (in Thonny, click the green **Run** button or press **F5**). You will see the two messages.

`print()` shows text on the screen. Text inside quotes is called a **string**.

## Step 2: Pick a secret number

Python can choose random numbers using its built-in `random` module.

```python
import random

secret = random.randint(1, 100)

print("Welcome to the Number Guessing Game!")
print("I'm thinking of a number between 1 and 100.")
```

- `import random` loads Python's random-number tools.
- `random.randint(1, 100)` picks a whole number from 1 to 100. Both 1 and 100 can be chosen.
- `secret = …` stores that number in a **variable** called `secret`. A variable is a named box that holds a value.

## Step 3: Ask for a guess

```python
guess = int(input("Your guess: "))
```

- `input()` waits for the player to type something and press Enter. It always gives back **text**.
- `int()` turns that text into a whole number, so we can compare it with `secret`.

## Step 4: Give hints with if, elif and else

```python
if guess < secret:
    print("Too low!")
elif guess > secret:
    print("Too high!")
else:
    print("You got it!")
```

Python checks each condition in order:

- `if`: is the guess smaller? Then say "Too low!"
- `elif` (short for *else if*): otherwise, is it bigger?
- `else`: if it is neither smaller nor bigger, it must be correct.

**Indentation matters in Python.** The four spaces before each `print` show that it belongs to the line above. Thonny and other editors add them for you after a colon (`:`).

## Step 5: Keep guessing with a loop

Right now the player only gets one guess. A `while` loop repeats code **while** something is true.

```python
import random

secret = random.randint(1, 100)
guess = 0
tries = 0

print("Welcome to the Number Guessing Game!")
print("I'm thinking of a number between 1 and 100.")

while guess != secret:
    guess = int(input("Your guess: "))
    tries = tries + 1

    if guess < secret:
        print("Too low! Try again.")
    elif guess > secret:
        print("Too high! Try again.")
    else:
        print(f"You got it in {tries} tries!")
```

- `!=` means "is not equal to". The loop keeps going until the guess matches.
- We start `guess` at `0` so the loop runs at least once (0 can never be the secret).
- `tries = tries + 1` adds one to the counter each time round.
- The `f` before the string makes it an **f-string**: anything inside `{ }` is replaced by its value, so the player sees "You got it in 6 tries!".

Run it and play a few rounds. 🎉

## Step 6: Don't crash on bad input

Try typing `hello` instead of a number. The program crashes with a `ValueError`, because `int("hello")` makes no sense. Real programs must cope with mistakes.

We can **try** the conversion and **catch** the error:

```python
while True:
    text = input("Your guess: ")
    try:
        guess = int(text)
        break
    except ValueError:
        print("Please type a whole number.")
```

- `while True` loops forever, until we `break` out of it.
- If `int(text)` works, `break` leaves the loop with a valid number.
- If it fails, Python jumps to `except ValueError` and asks again instead of crashing.

## Step 7: The complete game

Here is the finished program with input checking, a range check, a guess counter and "play again":

```python
import random


def get_guess():
    """Ask until the player types a whole number from 1 to 100."""
    while True:
        text = input("Your guess (1-100): ")
        try:
            number = int(text)
        except ValueError:
            print("That's not a whole number. Try again.")
            continue
        if 1 <= number <= 100:
            return number
        print("Please choose a number from 1 to 100.")


def play():
    secret = random.randint(1, 100)
    tries = 0
    print("\nI'm thinking of a number between 1 and 100.")

    while True:
        guess = get_guess()
        tries += 1
        if guess < secret:
            print("Too low!")
        elif guess > secret:
            print("Too high!")
        else:
            print(f"Correct! The number was {secret}. You took {tries} tries.")
            return tries


print("Welcome to the Number Guessing Game!")
best = None

while True:
    score = play()
    if best is None or score < best:
        best = score
        print("That's your best score so far!")
    again = input("Play again? (y/n): ").strip().lower()
    if again != "y":
        print(f"Thanks for playing! Your best was {best} tries.")
        break
```

**New ideas in this version:**

- **Functions** (`def get_guess():` and `def play():`) package code into named, reusable chunks. `return` sends a value back to wherever the function was called.
- The text in triple quotes under `def get_guess()` is a **docstring**: a note explaining what the function does.
- `continue` jumps straight back to the top of the loop.
- `1 <= number <= 100` checks that the number is in range. Python lets you write it just like in maths.
- `tries += 1` is a shortcut for `tries = tries + 1`.
- `best = None` means "no best score yet". After each game we keep the smallest number of tries.
- `.strip().lower()` removes spaces and makes the answer lowercase, so `Y`, `y` and ` y ` all count as yes.
- `\n` inside a string starts a new line.

## How to win every time (the computer science secret)

Is there a best strategy? Yes! Always guess the **middle** of the numbers that are still possible:

- Start with **50**. "Too high" means the number is 1 to 49, so guess **25**.
- "Too low" means 26 to 49, so guess **37**, and so on.

Each guess cuts the possibilities in half, so you will **always** find the number in **7 guesses or fewer** (because 2 × 2 × 2 × 2 × 2 × 2 × 2 = 128, which is more than 100). This strategy is called **binary search**, and computers use it to find things in huge lists incredibly fast.

## Common errors and what they mean

| Error message | What it means | Fix |
|---|---|---|
| `IndentationError` | The spaces at the start of a line are wrong | Line code up exactly as shown; use 4 spaces |
| `NameError: name 'radom' is not defined` | A spelling mistake | Check the spelling: it's `random` |
| `SyntaxError` near `if` or `while` | A missing colon | Lines starting `if`, `elif`, `else`, `while` and `def` end with `:` |
| `ValueError: invalid literal for int()` | Text was turned into a number | Use the `try`/`except` version from Step 6 |

## Challenges to try next

1. **Difficulty levels:** ask "easy, medium or hard?" and pick a number up to 10, 100 or 1000.
2. **Limited guesses:** the player loses after 10 wrong guesses.
3. **Hot or cold:** if the guess is within 5 of the secret, print "🔥 Very hot!".
4. **Swap roles:** *you* think of a number and the computer guesses it using binary search.

## What you learned

- Variables, strings and numbers.
- `input()` and `int()`, and why input must be checked.
- `if`, `elif` and `else` for decisions.
- `while` loops, `break` and `continue`.
- Functions with `def` and `return`.
- Handling errors with `try` and `except`.
- A real computer science idea: **binary search**.

If you have used Scratch before, you might notice these are the same ideas as Scratch's `forever`, `if` and variable blocks, just written as text. Our guide to [Scratch vs Python](/scratch-vs-python-which-first/) explains how the two connect.

## Frequently asked questions

**What age should children start learning Python?** Many children are ready around 10 or 11, once they can type comfortably and read instructions carefully. Younger children often start with Scratch.

**Is Python free?** Yes. Python and editors such as Thonny and VS Code are completely free.

**Why does my game pick the same number every time I test it?** It doesn't. `random.randint` picks a new number each run. If you set `secret = 42` while testing, remember to change it back!
