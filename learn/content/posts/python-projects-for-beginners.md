---
author: adorable-nwabugo
title: "10 Fun Python Projects for Beginners and Kids (With Full Code)"
description: 10 fun Python projects for beginners and kids, from a dice roller and quiz to a password generator and Hangman, each with full working code.
date: 2026-10-13
category: Learn by Doing
tags: [python, projects, beginner, kids coding, games]
emoji: 🐍
level: Beginner
age: 10+
---

The fastest way to learn Python is to build small things that work. Reading about loops is useful, but writing a dice game with a loop is how it actually sticks.

Here are ten beginner projects, roughly in order of difficulty. Every one is short enough to finish in a single sitting, and every one teaches a different skill. Each comes with complete code you can run straight away, plus a few ideas to make it your own.

> **What you need:** Python 3, which is free from python.org, or the beginner-friendly editor **Thonny** (thonny.org), which includes Python. A free online editor like Replit or Trinket works too. If you've never written Python before, start with our [number guessing game tutorial](/python-number-guessing-game-for-kids/), which explains the basics line by line.

## 1. Dice roller

**You'll learn:** importing modules, random numbers, loops.

```python
import random

print("Dice Roller")
while True:
    roll = random.randint(1, 6)
    print("You rolled a", roll)
    again = input("Roll again? (y/n): ")
    if again.lower() != "y":
        print("Thanks for playing!")
        break
```

`random.randint(1, 6)` picks a whole number from 1 to 6, just like a real die. The `while True` loop keeps going until the player types anything other than "y".

**Make it your own:** roll two dice and show the total. Ask how many sides the dice should have, for a Dungeons and Dragons style 20-sided die.

## 2. Mad Libs story generator

**You'll learn:** input, variables, f-strings.

```python
print("Let's write a silly story!")
name = input("A name: ")
animal = input("An animal: ")
food = input("A food: ")
place = input("A place: ")
verb = input("A verb ending in -ing: ")

story = f"""
One sunny morning, {name} found a {animal} eating {food} in {place}.
Instead of running away, the {animal} started {verb}.
{name} laughed so hard that everyone in {place} joined in.
"""
print(story)
```

The triple quotes let a string run over several lines, and the `f` at the start means anything inside `{curly brackets}` is replaced with the value of that variable.

**Make it your own:** write three different stories and use `random.choice()` to pick one.

## 3. Temperature converter

**You'll learn:** converting text to numbers, maths, functions.

```python
def celsius_to_fahrenheit(c):
    return c * 9 / 5 + 32


def fahrenheit_to_celsius(f):
    return (f - 32) * 5 / 9


choice = input("Convert from (C)elsius or (F)ahrenheit? ").upper()
value = float(input("Temperature: "))

if choice == "C":
    print(f"{value}°C is {celsius_to_fahrenheit(value):.1f}°F")
elif choice == "F":
    print(f"{value}°F is {fahrenheit_to_celsius(value):.1f}°C")
else:
    print("Please type C or F.")
```

`float()` turns the typed text into a number that can have a decimal point. Inside the f-string, `:.1f` rounds the answer to one decimal place.

**Make it your own:** add Kelvin, or convert distances between kilometres and miles.

## 4. Times tables quiz

**You'll learn:** loops, scoring, comparing answers.

```python
import random

score = 0
questions = 10

for number in range(1, questions + 1):
    a = random.randint(2, 12)
    b = random.randint(2, 12)
    answer = input(f"Question {number}: What is {a} x {b}? ")
    if answer.strip() == str(a * b):
        print("Correct!")
        score += 1
    else:
        print(f"Not quite. It's {a * b}.")

print(f"You scored {score} out of {questions}.")
```

`range(1, questions + 1)` counts from 1 to 10. We compare the player's answer with `str(a * b)` so that typing a word instead of a number doesn't crash the program.

**Make it your own:** time how long the quiz takes with the `time` module, or let the player choose which times table to practise.

## 5. Rock, paper, scissors

**You'll learn:** lists, `random.choice`, decision logic.

```python
import random

options = ["rock", "paper", "scissors"]
beats = {"rock": "scissors", "paper": "rock", "scissors": "paper"}
player_score = 0
computer_score = 0

while True:
    player = input("rock, paper or scissors? (or quit): ").lower()
    if player == "quit":
        break
    if player not in options:
        print("Try again.")
        continue
    computer = random.choice(options)
    print("Computer chose", computer)
    if player == computer:
        print("It's a draw!")
    elif beats[player] == computer:
        print("You win this round!")
        player_score += 1
    else:
        print("Computer wins this round!")
        computer_score += 1

print(f"Final score: you {player_score}, computer {computer_score}")
```

The `beats` **dictionary** stores which choice beats which. Instead of writing nine separate `if` statements, one line checks whether the player's choice beats the computer's.

**Make it your own:** add "lizard" and "Spock", or make it first to five points.

## 6. Password generator

**You'll learn:** strings, loops, the `string` and `secrets` modules.

```python
import secrets
import string

length = int(input("How long should the password be? "))
characters = string.ascii_letters + string.digits + "!@#$%&*?"

password = "".join(secrets.choice(characters) for _ in range(length))
print("Your new password:", password)
```

`string.ascii_letters` contains every letter from a to z in lower and upper case, and `string.digits` contains 0 to 9. We use the `secrets` module rather than `random`, because `secrets` is designed for anything security-related.

**Make it your own:** make sure every password includes at least one number and one symbol, or generate five passwords at once.

## 7. Countdown timer

**You'll learn:** the `time` module, counting backwards.

```python
import time

seconds = int(input("Countdown from how many seconds? "))

for remaining in range(seconds, 0, -1):
    minutes, secs = divmod(remaining, 60)
    print(f"{minutes:02d}:{secs:02d}")
    time.sleep(1)

print("Time's up!")
```

`range(seconds, 0, -1)` counts down instead of up. `divmod(remaining, 60)` splits the seconds into whole minutes and leftover seconds, and `:02d` pads numbers with a zero so 5 shows as 05.

**Make it your own:** turn it into a study timer that counts 25 minutes of work and then 5 minutes of break.

## 8. Simple calculator

**You'll learn:** functions, error handling.

```python
def calculate(a, operator, b):
    if operator == "+":
        return a + b
    if operator == "-":
        return a - b
    if operator == "*":
        return a * b
    if operator == "/":
        if b == 0:
            return "You can't divide by zero!"
        return a / b
    return "Unknown operator"


while True:
    text = input("Enter a sum like 7 * 6 (or quit): ")
    if text == "quit":
        break
    try:
        a, operator, b = text.split()
        print("=", calculate(float(a), operator, float(b)))
    except ValueError:
        print("Please type a number, a space, an operator, a space and a number.")
```

`text.split()` breaks "7 * 6" into three pieces. If the user types something unexpected, Python raises a `ValueError`, and the `try`/`except` catches it so the program carries on instead of crashing.

**Make it your own:** add powers (`**`) or remember the last answer so you can keep calculating with it.

## 9. Multiple-choice quiz

**You'll learn:** lists of dictionaries, looping through data.

```python
questions = [
    {"q": "Which planet is known as the Red Planet?", "options": ["Venus", "Mars", "Jupiter"], "answer": 2},
    {"q": "How many legs does a spider have?", "options": ["6", "8", "10"], "answer": 2},
    {"q": "What does CPU stand for?", "options": ["Central Processing Unit", "Computer Power Unit", "Core Program Utility"], "answer": 1},
]

score = 0
for item in questions:
    print("\n" + item["q"])
    for number, option in enumerate(item["options"], start=1):
        print(f"  {number}. {option}")
    choice = input("Your answer (number): ")
    if choice == str(item["answer"]):
        print("Correct!")
        score += 1
    else:
        right = item["options"][item["answer"] - 1]
        print(f"The answer was {right}.")

print(f"\nYou got {score} out of {len(questions)}.")
```

Storing questions as **data** in a list means you can add a hundred questions without writing any new code. `enumerate` numbers the options for you.

**Make it your own:** write a quiz about your favourite game, film or football team, and shuffle the questions with `random.shuffle(questions)`.

## 10. Hangman

**You'll learn:** sets, string building, game loops. This one pulls everything together.

```python
import random

words = ["python", "planet", "rocket", "jungle", "castle", "pirate", "laptop"]
word = random.choice(words)
guessed = set()
lives = 6

while lives > 0:
    display = " ".join(letter if letter in guessed else "_" for letter in word)
    print("\n" + display)
    if "_" not in display:
        print("You saved the day! The word was", word)
        break
    guess = input(f"Lives: {lives}. Guess a letter: ").lower()
    if len(guess) != 1 or not guess.isalpha():
        print("Please type one letter.")
    elif guess in guessed:
        print("You already tried that one.")
    elif guess in word:
        guessed.add(guess)
        print("Good guess!")
    else:
        guessed.add(guess)
        lives -= 1
        print("Nope!")
else:
    print("Out of lives! The word was", word)
```

A **set** stores the guessed letters and makes checking for repeats easy. The line that builds `display` goes through each letter of the word and shows it if it has been guessed, or an underscore if not.

The `else` on the `while` loop is a lesser-known Python feature: it runs only if the loop finishes without hitting `break`, which here means the player ran out of lives.

**Make it your own:** read the word list from a text file, add categories, or draw the hangman with text art.

## Tips for getting unstuck

- **Read the error message from the bottom up.** The last line says what went wrong; the lines above say where.
- **Check your indentation.** Python uses spaces to know which lines belong together. Four spaces per level is the standard.
- **Print things out.** Adding `print(variable)` in the middle of your code shows you what is really happening.
- **Change one thing at a time,** then run it again. Small steps make bugs easy to find.

Our guide on [how to debug your code](/how-to-debug-code-tips-for-beginners/) has plenty more tips.

## Where to go next

Finished all ten? You know more Python than you think. From here you could try drawing pictures with [Python turtle](/python-turtle-drawing-for-kids/), build a game with graphics using the Pygame library, or explore data and AI, which is one of the main reasons Python is so popular.

## Frequently asked questions

**Which Python project is best for a complete beginner?** The dice roller or the Mad Libs story. Both are under 15 lines and show results straight away.

**Do I need to install anything special?** No. Everything here uses only modules that come with Python: `random`, `string`, `secrets` and `time`.

**How long does each project take?** Most take 15 to 30 minutes for a beginner. Hangman might take an hour if you're new to sets and loops, and that's completely fine.

**What age can kids start Python projects like these?** Many children can manage them from around 10 or 11, especially if they've done some Scratch first. Younger children often enjoy them with a parent or tutor alongside.
