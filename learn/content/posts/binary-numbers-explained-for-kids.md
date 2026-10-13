---
title: "Binary Numbers Explained for Kids: How Computers Count with 0 and 1"
description: Why do computers use only 0s and 1s? A simple guide to binary for kids, with how to count in binary, convert numbers, store letters, and fun activities to try.
date: 2026-11-02 09:00
category: Tech Explained
tags: [binary, computer science, maths, beginner]
emoji: 🔢
level: Beginner
age: 9+
---

Every photo on your phone, every song, every game and every website is stored inside a computer as just two symbols: **0** and **1**. That's it. No other numbers, no letters, no colours. Just billions of zeros and ones.

That system is called **binary**, and once you understand it, you'll never look at a computer the same way again. Best of all, it's much easier than it sounds.

## Why do computers use binary?

Inside a computer are billions of tiny electronic switches called **transistors**. Each switch can be in one of two states: **on** or **off**.

We write "on" as **1** and "off" as **0**.

Using just two states makes computers simple, fast and reliable. It's much easier to build a switch that's clearly on or off than one that has to tell the difference between ten different levels. So everything a computer does is built from these simple on and off signals.

Each single 0 or 1 is called a **bit**, short for "binary digit".

## How we normally count

To understand binary, let's look at how we normally count, which is called **decimal** or base 10. We use ten digits: 0, 1, 2, 3, 4, 5, 6, 7, 8 and 9.

Each column in a number is worth ten times more than the column to its right:

| Thousands | Hundreds | Tens | Ones |
|---|---|---|---|
| 1000 | 100 | 10 | 1 |
| 2 | 3 | 4 | 5 |

So **2345** means 2 thousands + 3 hundreds + 4 tens + 5 ones.

## How binary counts

Binary works the same way, but with only two digits, 0 and 1. Each column is worth **twice** as much as the one to its right:

| 128 | 64 | 32 | 16 | 8 | 4 | 2 | 1 |
|---|---|---|---|---|---|---|---|

Each column can be either 0 (off) or 1 (on). To find the value of a binary number, add up the columns that have a 1.

**Example: what is 1011 in binary?**

| 8 | 4 | 2 | 1 |
|---|---|---|---|
| 1 | 0 | 1 | 1 |

8 + 2 + 1 = **11**. So binary `1011` is the number 11.

## Counting from 0 to 10 in binary

| Decimal | Binary |
|---|---|
| 0 | 0 |
| 1 | 1 |
| 2 | 10 |
| 3 | 11 |
| 4 | 100 |
| 5 | 101 |
| 6 | 110 |
| 7 | 111 |
| 8 | 1000 |
| 9 | 1001 |
| 10 | 1010 |

Notice the pattern? Every time a column fills up, it resets to 0 and adds 1 to the next column, just like going from 9 to 10 in normal counting. That's why `10` in binary means two, not ten. (There's an old joke: "There are 10 kinds of people in the world: those who understand binary and those who don't.")

## Turning a normal number into binary

Let's convert **13** to binary using the column values 8, 4, 2, 1:

1. Does 8 fit into 13? **Yes.** Write 1. Left over: 13 − 8 = 5.
2. Does 4 fit into 5? **Yes.** Write 1. Left over: 5 − 4 = 1.
3. Does 2 fit into 1? **No.** Write 0.
4. Does 1 fit into 1? **Yes.** Write 1. Left over: 0.

So 13 in binary is **1101**. Check: 8 + 4 + 1 = 13. ✅

Try these yourself (answers at the bottom of the page): **6**, **9**, **15**, **20**.

## Bits and bytes

Bits are usually grouped together:

- **8 bits** make a **byte**. One byte can store any number from 0 to 255.
- About a thousand bytes is a **kilobyte (KB)**.
- About a million bytes is a **megabyte (MB)**.
- About a billion bytes is a **gigabyte (GB)**.

A text message might be a few bytes, a photo a few megabytes, and a film several gigabytes. Your phone's storage is measured in gigabytes, which means it can hold *billions* of bytes, each made of 8 bits.

## How binary stores letters

Numbers are one thing, but how do computers store words? They use a **code** where every letter is given a number, and that number is stored in binary.

A famous code called **ASCII** gives each common character a number. For example:

| Character | Number | Binary |
|---|---|---|
| A | 65 | 01000001 |
| B | 66 | 01000010 |
| C | 67 | 01000011 |
| a | 97 | 01100001 |
| ! | 33 | 00100001 |

So the word **"Hi"** is stored as the numbers 72 and 105, which in binary are `01001000 01101001`.

Modern computers use a bigger code called **Unicode**, which includes letters from almost every language in the world, as well as symbols and emoji. Yes, even 😀 is stored as binary!

## How binary stores pictures and sound

- **Pictures** are made of tiny dots called **pixels**. Each pixel's colour is stored as numbers, usually three: how much red, green and blue light to mix. Every one of those numbers is stored in binary.
- **Sound** is stored by measuring the sound wave thousands of times every second and saving each measurement as a binary number.

Whatever it is, if a computer can store it, it's binary underneath.

## Try it: binary with your fingers

Hold up one hand. Each finger is a bit, worth (from your thumb) 1, 2, 4, 8 and 16. A finger up means 1, down means 0.

- Thumb up only = **1**
- Index finger up only = **2**
- Thumb and index finger up = **3**
- All five fingers up = 1 + 2 + 4 + 8 + 16 = **31**

With one hand, you can count from 0 to 31. With both hands (ten bits), you can count all the way to **1,023**!

## Try it: binary in Python

If you know a little Python, you can check your answers instantly:

```python
print(bin(13))             # 0b1101  (the 0b just means "this is binary")
print(int("1101", 2))      # 13      (turn binary text back into a number)
print(format(13, "08b"))   # 00001101 (show 8 bits)

word = "Hi"
for letter in word:
    print(letter, ord(letter), format(ord(letter), "08b"))
```

`ord()` gives a character's code number, and `format(number, "08b")` shows it as 8 binary digits. Try changing `word` to your own name! New to Python? Start with our [Python projects for beginners](/python-projects-for-beginners/).

## Why learn binary?

You don't need to think in binary to use a computer or to write most programs. But understanding it helps you see how computers really work, from storing your photos to sending messages across [the internet](/how-does-the-internet-work-explained-for-kids/). It's also a great example of an important idea in computer science: complex things can be built from very simple building blocks.

## Answers

6 = `110`, 9 = `1001`, 15 = `1111`, 20 = `10100`.

## Frequently asked questions

**What is binary in simple words?** Binary is a way of writing numbers using only two digits, 0 and 1. Computers use it because their tiny switches can only be on or off.

**What is the difference between a bit and a byte?** A bit is a single 0 or 1. A byte is a group of 8 bits, which can store a number from 0 to 255.

**Why does 10 mean 2 in binary?** In binary, each column is worth double the one to its right, so the columns are 1, 2, 4, 8 and so on. `10` means one 2 and zero 1s, which is 2.

**Do programmers write code in binary?** Almost never. Programmers write in languages like Python, Scratch and JavaScript. Special programs translate that code into the binary instructions the computer actually runs.
