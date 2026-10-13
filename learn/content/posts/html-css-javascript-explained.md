---
title: "HTML vs CSS vs JavaScript: What Each One Does (Explained Simply)"
description: What is the difference between HTML, CSS and JavaScript? A simple explanation of what each does, how they work together and which to learn first.
date: 2026-10-13
category: Tech Explained
tags: [html, css, javascript, web development, beginner]
emoji: 🏗️
level: Beginner
age: 10+
---

Open any website (a game, a news site, your school's homepage) and it is built from the same three languages: **HTML, CSS and JavaScript**. Each one has a different job. Once you understand those jobs, building websites suddenly makes much more sense.

## The house analogy

Think of a website as a house:

| Language | Job | In the house |
|---|---|---|
| **HTML** | Structure and content | The walls, rooms, doors and furniture |
| **CSS** | Style and layout | The paint, wallpaper, lighting and where furniture goes |
| **JavaScript** | Behaviour and interactivity | The electricity: lights that switch on, a doorbell that rings |

A house needs walls before you can paint them, and paint before the lights make it feel like home. Websites are the same: **HTML first, then CSS, then JavaScript**.

## HTML: the structure

**HTML** (HyperText Markup Language) describes *what* is on the page: headings, paragraphs, images, links, buttons and lists. It uses **tags** in angle brackets:

```html
<h1>My Pet Robot</h1>
<p>This is Bolt. He can dance and tell jokes.</p>
<img src="bolt.png" alt="A small silver robot waving">
<button>Tell me a joke</button>
```

- `<h1>` is the main heading.
- `<p>` is a paragraph.
- `<img>` shows an image, and `alt` describes it for people who can't see it.
- `<button>` makes a button.

On its own, HTML looks plain: black text on a white page. That is fine: HTML's job is **meaning**, not looks. Search engines and screen readers rely on good HTML to understand a page.

## CSS: the style

**CSS** (Cascading Style Sheets) controls *how* things look: colours, fonts, sizes, spacing, and where everything goes on the screen.

```css
body {
  font-family: Arial, sans-serif;
  background: #eef2ff;
}

h1 {
  color: #4338ca;
  text-align: center;
}

button {
  background: #f59e0b;
  color: white;
  border: none;
  padding: 12px 24px;
  border-radius: 20px;
  font-size: 18px;
}
```

A CSS **rule** has a **selector** (which elements to style, such as `h1`) and **declarations** in curly brackets (what to change, such as `color: #4338ca;`).

CSS also handles **layout**, which means putting things side by side, building grids, and making pages work on phones as well as laptops. Tools like Flexbox and Grid make this much easier than it used to be (see them in action in our [first website guide](/build-your-first-website-html-css/)).

## JavaScript: the behaviour

**JavaScript** makes a page *do* things: respond to clicks, check form answers, show a message, change content without reloading, run games and animations.

```js
const button = document.querySelector('button');
const jokes = [
  'Why did the robot go on holiday? To recharge its batteries!',
  'What do you call a pirate robot? Arrr2-D2!',
  'Why was the computer cold? It left its Windows open!'
];

button.addEventListener('click', () => {
  const random = Math.floor(Math.random() * jokes.length);
  alert(jokes[random]);
});
```

- `document.querySelector('button')` finds the button in the HTML.
- `addEventListener('click', …)` says: *when this button is clicked, run this code*.
- `Math.random()` picks a random joke from the list.

JavaScript is a full programming language with variables, loops, conditions and functions. These are the same ideas you may know from Scratch or Python.

## How they work together

Here is a complete mini web page using all three. Save it as `robot.html` and open it in your browser:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Bolt the Robot</title>
  <style>
    body { font-family: Arial, sans-serif; background: #eef2ff; text-align: center; padding: 40px; }
    h1 { color: #4338ca; }
    button { background: #f59e0b; color: white; border: none; padding: 12px 24px; border-radius: 20px; font-size: 18px; cursor: pointer; }
    #joke { font-size: 20px; margin-top: 24px; min-height: 30px; }
  </style>
</head>
<body>
  <h1>🤖 Bolt the Robot</h1>
  <p>Press the button and Bolt will tell you a joke.</p>
  <button id="joke-button">Tell me a joke</button>
  <p id="joke"></p>

  <script>
    const jokes = [
      'Why did the robot go on holiday? To recharge its batteries!',
      'What do you call a pirate robot? Arrr2-D2!',
      'Why was the computer cold? It left its Windows open!'
    ];
    document.getElementById('joke-button').addEventListener('click', () => {
      const random = Math.floor(Math.random() * jokes.length);
      document.getElementById('joke').textContent = jokes[random];
    });
  </script>
</body>
</html>
```

- The **HTML** creates the heading, paragraph, button and an empty `<p id="joke">`.
- The **CSS** inside `<style>` makes it colourful and centred.
- The **JavaScript** inside `<script>` puts a random joke into the empty paragraph each time you click.

In real projects, CSS and JavaScript usually live in separate files (`style.css` and `script.js`) linked from the HTML. It keeps things tidy, especially as sites grow.

## Is HTML a programming language?

Strictly speaking, **HTML and CSS are not programming languages**: HTML is a *markup* language (it labels content) and CSS is a *style sheet* language (it describes appearance). Neither has the loops, variables and decisions of a programming language. **JavaScript is a programming language.**

That doesn't make HTML and CSS less important. Every single website needs them, and doing them well takes real skill.

## Which should you learn first?

**Learn them in order: HTML → CSS → JavaScript.**

1. **HTML** first, because everything else attaches to it. Most beginners get comfortable in a few sessions.
2. **CSS** next, so your pages look the way you want. Layout takes practice, but results are visible immediately, which is very motivating.
3. **JavaScript** once you can build and style a page. Coming from Scratch or Python? You will recognise variables, loops and `if` statements straight away.

## Quick comparison

| | HTML | CSS | JavaScript |
|---|---|---|---|
| Type | Markup language | Style sheet language | Programming language |
| Controls | Content and structure | Appearance and layout | Behaviour and interactivity |
| Example | `<button>Play</button>` | `button { color: white; }` | `button.addEventListener('click', play)` |
| Can make decisions? | No | Limited (media queries) | Yes (`if`, loops, functions) |
| Learn | First | Second | Third |

## Try it yourself

- Change the jokes in the mini project to your own.
- Change the colours in the CSS.
- Add a second button that changes the background colour. (Hint: `document.body.style.background = 'lightgreen';`)

When you're ready for a bigger project, follow our step-by-step guides to [build your first website](/build-your-first-website-html-css/) and [make a responsive navbar](/responsive-navbar-html-css/).

## Frequently asked questions

**Do I need to install anything?** No. You can write HTML, CSS and JavaScript in any text editor and open the file in your browser. A free editor like VS Code makes it easier.

**How long does it take to learn HTML and CSS?** The basics take a few weeks of regular practice. Becoming really confident with layouts takes longer, and building real projects is the fastest way to get there.

**Is JavaScript the same as Java?** No! Despite the similar names, they are completely different languages.

**Can kids build real websites?** Absolutely. Many 11 to 14-year-olds build and publish their own websites with HTML and CSS.
