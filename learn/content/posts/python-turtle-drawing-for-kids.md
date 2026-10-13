---
title: "Python Turtle for Kids: Draw Shapes, Stars and Spirals with Code"
description: Learn Python by drawing with turtle graphics: squares, stars, spirals and a mini drawing game. A step-by-step guide for kids with full code.
date: 2026-10-14
category: Learn by Doing
tags: [python, turtle, art, beginner, kids coding]
emoji: 🐢
level: Beginner
age: 9+
---

What if your first Python program made a picture instead of printing text? That's the magic of **turtle graphics**. You control a little turtle that carries a pen. Tell it to move forward and it draws a line. Tell it to turn and it changes direction. With a few loops, you can create stars, flowers and swirling rainbow spirals.

Turtle comes built into Python, so there's nothing extra to install. It's one of the best ways to learn loops, because you can *see* every repetition happen.

> **What you need:** Python 3 on a computer (free from python.org) or the beginner editor **Thonny** (thonny.org). Turtle opens a drawing window, so it works best on a computer rather than in some online editors. Trinket.io is a free online option that supports turtle.

## Your first line

Create a new file called `draw.py` and type:

```python
import turtle

t = turtle.Turtle()
t.forward(100)

turtle.done()
```

Run it. A window opens and the turtle (it looks like an arrow by default) draws a line 100 steps long.

- `import turtle` loads the turtle library.
- `t = turtle.Turtle()` creates a turtle and calls it `t`.
- `t.forward(100)` moves it forward 100 steps.
- `turtle.done()` keeps the window open so you can admire your work. Always keep this as the last line.

Want it to look like a real turtle? Add `t.shape("turtle")` after creating it.

## Drawing a square

A square is four sides and four turns. Each turn is 90 degrees.

```python
import turtle

t = turtle.Turtle()
t.shape("turtle")

t.forward(100)
t.right(90)
t.forward(100)
t.right(90)
t.forward(100)
t.right(90)
t.forward(100)
t.right(90)

turtle.done()
```

It works, but we typed the same two lines four times. Programmers hate repeating themselves, and that's what **loops** are for.

## Loops make it shorter

```python
import turtle

t = turtle.Turtle()
t.shape("turtle")

for i in range(4):
    t.forward(100)
    t.right(90)

turtle.done()
```

`for i in range(4):` repeats the indented lines four times. Same square, half the code.

## Any shape you like

Here's a neat bit of maths: to draw any regular shape, the turtle must turn a full circle (360 degrees) by the time it gets back to the start. So each turn is `360 divided by the number of sides`.

| Shape | Sides | Turn each time |
|---|---|---|
| Triangle | 3 | 120 |
| Square | 4 | 90 |
| Pentagon | 5 | 72 |
| Hexagon | 6 | 60 |
| Octagon | 8 | 45 |

Let's write a **function** that can draw any of them:

```python
import turtle

t = turtle.Turtle()


def shape(sides, length):
    for i in range(sides):
        t.forward(length)
        t.right(360 / sides)


shape(3, 100)
shape(6, 60)
shape(8, 40)

turtle.done()
```

`def shape(sides, length):` creates our own command. Now `shape(5, 80)` draws a pentagon with sides 80 long. Try `shape(50, 10)`: with that many tiny sides, it looks just like a circle.

## A star

A five-pointed star turns 144 degrees at each point.

```python
import turtle

t = turtle.Turtle()
t.color("gold")
t.begin_fill()

for i in range(5):
    t.forward(150)
    t.right(144)

t.end_fill()
turtle.done()
```

`begin_fill()` and `end_fill()` fill the shape with colour. `t.color("gold")` sets both the pen and fill colour. Turtle knows lots of colour names: `"red"`, `"blue"`, `"purple"`, `"orange"`, `"pink"`, `"turquoise"` and many more.

## A colourful spiral

Now for something that looks really impressive.

```python
import turtle

screen = turtle.Screen()
screen.bgcolor("black")

t = turtle.Turtle()
t.speed(0)
t.width(2)

colours = ["red", "orange", "yellow", "green", "blue", "purple"]

for i in range(180):
    t.color(colours[i % 6])
    t.forward(i * 2)
    t.right(59)

t.hideturtle()
turtle.done()
```

**What's new:**

- `screen.bgcolor("black")` makes the background black so the colours glow.
- `t.speed(0)` is the fastest drawing speed. (1 is slowest, 10 is fast, 0 is fastest of all.)
- `colours[i % 6]` picks the next colour from the list. The `%` sign gives the remainder after dividing, so as `i` goes 0, 1, 2 and up, `i % 6` cycles round 0 to 5 and the colours repeat.
- `t.forward(i * 2)` makes each line a little longer than the last, which creates the spiral.
- Turning 59 degrees, just under 60, makes the hexagon shape slowly twist.

Try changing `59` to `89`, `91` or `121` and see completely different patterns appear.

## A flower made of circles

```python
import turtle

t = turtle.Turtle()
t.speed(0)
t.color("deeppink")

for i in range(36):
    t.circle(80)
    t.right(10)

t.hideturtle()
turtle.done()
```

`t.circle(80)` draws a circle with a radius of 80. Drawing 36 circles, turning 10 degrees each time, rotates all the way round (36 × 10 = 360) and makes a flower.

## Moving without drawing

To move the turtle somewhere new without leaving a line, lift the pen:

```python
t.penup()
t.goto(-150, 100)
t.pendown()
```

The turtle window uses **coordinates**, just like Scratch: the centre is `(0, 0)`, x goes left and right, y goes up and down. Here's a little scene that uses `goto` to draw a house:

```python
import turtle

t = turtle.Turtle()
t.speed(5)


def square(size, colour):
    t.color(colour)
    t.begin_fill()
    for i in range(4):
        t.forward(size)
        t.left(90)
    t.end_fill()


# the walls
t.penup()
t.goto(-75, -100)
t.pendown()
square(150, "sandybrown")

# the roof
t.penup()
t.goto(-75, 50)
t.pendown()
t.color("firebrick")
t.begin_fill()
t.goto(0, 130)
t.goto(75, 50)
t.goto(-75, 50)
t.end_fill()

# the door
t.penup()
t.goto(-20, -100)
t.pendown()
t.color("saddlebrown")
t.begin_fill()
for side in [40, 70, 40, 70]:
    t.forward(side)
    t.left(90)
t.end_fill()

t.hideturtle()
turtle.done()
```

Lines starting with `#` are **comments**: notes for humans that Python ignores. They make longer programs much easier to follow.

## A mini drawing game

Turtle can respond to the keyboard too. This turns your turtle into an Etch A Sketch you control with the arrow keys:

```python
import turtle

screen = turtle.Screen()
t = turtle.Turtle()
t.shape("turtle")
t.speed(0)


def up():
    t.setheading(90)
    t.forward(10)


def down():
    t.setheading(270)
    t.forward(10)


def left():
    t.setheading(180)
    t.forward(10)


def right():
    t.setheading(0)
    t.forward(10)


def clear():
    t.clear()


screen.onkey(up, "Up")
screen.onkey(down, "Down")
screen.onkey(left, "Left")
screen.onkey(right, "Right")
screen.onkey(clear, "c")
screen.listen()
turtle.done()
```

`setheading` points the turtle in an exact direction (0 is right, 90 is up, 180 is left, 270 is down). `screen.onkey(up, "Up")` says "when the up arrow is pressed, run the `up` function", and `screen.listen()` tells the window to start listening for keys. Click on the turtle window first so it receives your key presses.

## Troubleshooting

- **The window opens and closes instantly:** add `turtle.done()` as the last line.
- **Nothing happens when I press keys:** click inside the turtle window first, and check you included `screen.listen()`.
- **"No module named turtle" or the window won't open online:** some online editors don't support turtle. Use Thonny, IDLE or Trinket.
- **Don't name your file `turtle.py`.** If you do, Python imports your file instead of the real turtle library and nothing works. Call it something like `draw.py`.

## Challenges

1. Draw your initials using `penup`, `goto` and `pendown`.
2. Make a row of five stars in different colours using a loop.
3. Draw a snowflake by repeating a "branch" function six times.
4. Use `random.choice` to draw shapes in random colours at random positions.
5. Add a key to the drawing game that changes the pen colour.

## What you learned

- **Loops** to repeat actions, and why they're so powerful.
- **Functions** with inputs to create your own commands.
- **Variables, lists and the remainder operator** for patterns.
- **Coordinates** and moving without drawing.
- **Events**: responding to key presses.

Turtle is a brilliant bridge between Scratch and "real" Python. If you enjoyed it, try something text-based next with our [10 Python projects for beginners](/python-projects-for-beginners/).

## Frequently asked questions

**Is Python turtle good for kids?** Yes. It's one of the best ways for children to learn Python, because every line of code produces something they can see. It's ideal from about age 9.

**Do I need to install turtle?** No. Turtle comes with Python. If you've installed Python from python.org, you already have it.

**Why does my turtle draw so slowly?** Add `t.speed(0)` for the fastest speed, and `t.hideturtle()` to hide the turtle while it draws.

**Can I save my turtle drawing?** The simplest way is to take a screenshot. Saving an image file directly takes extra steps beyond a beginner guide.
