---
author: adorable-nwabugo
title: Build Your First Website from Scratch with HTML and CSS (Complete Beginner's Guide)
description: Build a real website from scratch with HTML and CSS. A beginner's step-by-step guide to planning, coding, styling and publishing it free.
date: 2026-10-13
category: Learn by Doing
tags: [html, css, web development, beginner, project]
emoji: 🌐
level: Beginner
age: 11+
---

Building your own website is one of the most satisfying things you can do with code. In this guide you will go from an empty folder to a **real website on the internet** that you can share with family and friends.

We will build a personal site called **"My Coding Journey"** with:

- a header with your name and navigation,
- a big welcome ("hero") section,
- an *About me* section,
- a gallery of projects laid out with CSS Grid,
- a contact section and a footer,
- a layout that works on phones, tablets and laptops.

You will only use **HTML** and **CSS**, the two languages every website is built on. No downloads are needed apart from a free code editor.

> **Before you start:** if you are not sure what HTML and CSS do, read [HTML vs CSS vs JavaScript explained](/html-css-javascript-explained/) (5 minutes).

## Part 1: Get set up

### What you need

- A computer (Windows, Mac, Linux or a Chromebook).
- A web browser (Chrome, Edge, Firefox or Safari).
- A code editor. We recommend **Visual Studio Code** (free, from code.visualstudio.com). On a Chromebook or school computer, you can use a free online editor such as CodePen or Replit instead.

### Create your project folder

1. Make a new folder on your computer called `my-website`.
2. Open VS Code, choose **File → Open Folder**, and open `my-website`.
3. Create two files: `index.html` and `style.css`.
4. Create a folder called `images` for any pictures you want to add.

Your folder should look like this:

```text
my-website/
├── index.html
├── style.css
└── images/
```

`index.html` is special: web servers show it automatically when someone visits your site's address.

## Part 2: Plan your page

Professional developers plan before they code. Grab paper and sketch boxes for each section, top to bottom:

1. **Header**: your name or logo, and links to the sections.
2. **Hero**: a big welcome message and a button.
3. **About**: a few sentences about you (no private details!).
4. **Projects**: three to six cards, each with a title and short description.
5. **Contact**: how people can reach you (a parent's or school email, or a link to your coding profile).
6. **Footer**: a copyright line.

> **Stay safe online:** never put your home address, school name, phone number, full date of birth or photos of yourself on a public website. Use a nickname or first name only, and ask a parent before publishing.

## Part 3: Write the HTML

Open `index.html` and type (or copy) this skeleton. Every HTML page starts like this:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>My Coding Journey</title>
  <meta name="description" content="A young coder's projects, games and websites.">
  <link rel="stylesheet" href="style.css">
</head>
<body>

</body>
</html>
```

- `<head>` holds information *about* the page: the title shown on the browser tab, a description for search engines, and the link to your CSS file.
- `<body>` holds everything visitors see.

Now add the sections inside `<body>`:

```html
<header class="site-header">
  <a href="#" class="logo">Alex<span>Codes</span></a>
  <nav>
    <a href="#about">About</a>
    <a href="#projects">Projects</a>
    <a href="#contact">Contact</a>
  </nav>
</header>

<main>
  <section class="hero">
    <h1>Hi, I'm Alex 👋</h1>
    <p>I'm learning to code and I build games, websites and AI projects.</p>
    <a href="#projects" class="button">See my projects</a>
  </section>

  <section id="about" class="section">
    <h2>About me</h2>
    <p>I started coding with Scratch and now I'm learning HTML, CSS and Python.
       I love making games that my friends can play, and one day I want to build
       an app that helps people.</p>
  </section>

  <section id="projects" class="section">
    <h2>My projects</h2>
    <div class="projects">
      <article class="card">
        <div class="card-icon">🍎</div>
        <h3>Apple Catcher</h3>
        <p>A Scratch game where you catch falling apples. It gets faster as your score goes up.</p>
      </article>
      <article class="card">
        <div class="card-icon">🧩</div>
        <h3>Maze Runner</h3>
        <p>A three-level maze game with a timer. Can you beat my record of 41 seconds?</p>
      </article>
      <article class="card">
        <div class="card-icon">🤖</div>
        <h3>Rock, Paper, Scissors AI</h3>
        <p>I trained a computer to recognise my hand shapes using a webcam.</p>
      </article>
    </div>
  </section>

  <section id="contact" class="section contact">
    <h2>Say hello</h2>
    <p>Want to collaborate on a project? Ask my parent to email
       <a href="mailto:hello@example.com">hello@example.com</a>.</p>
  </section>
</main>

<footer class="site-footer">
  <p>© 2026 Alex · Built with HTML and CSS</p>
</footer>
```

Save the file and double-click `index.html` to open it in your browser. You will see all your content in plain black text, one block under another. That is exactly right. HTML gives the page its **structure and meaning**. Now we make it beautiful.

**A few things to notice:**

- The navigation links point to `#about`, `#projects` and `#contact`. These match the `id` of each section, so clicking a link jumps to that section.
- Headings go in order: one `<h1>` for the page title, `<h2>` for sections, `<h3>` for cards. Search engines and screen readers use this order to understand your page.
- `<article>` is used for each project card, because each one makes sense on its own.

## Part 4: Style it with CSS

Open `style.css`. We will build the design in layers.

### 4.1 Colours and fonts

Start by saving your colours in **CSS variables**, so you can change the whole theme in one place later:

```css
:root {
  --primary: #4f46e5;
  --primary-dark: #3730a3;
  --accent: #f59e0b;
  --text: #1f2937;
  --muted: #6b7280;
  --background: #f8fafc;
  --card: #ffffff;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  line-height: 1.6;
  color: var(--text);
  background: var(--background);
}

h1, h2, h3 {
  line-height: 1.2;
}

a {
  color: var(--primary);
}
```

Refresh your browser. The font is already friendlier.

### 4.2 The header

```css
.site-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
  padding: 16px 24px;
  background: var(--card);
  box-shadow: 0 1px 8px rgba(0, 0, 0, 0.06);
  position: sticky;
  top: 0;
}

.logo {
  font-size: 22px;
  font-weight: 800;
  color: var(--text);
  text-decoration: none;
}

.logo span {
  color: var(--primary);
}

.site-header nav {
  display: flex;
  gap: 20px;
}

.site-header nav a {
  color: var(--text);
  font-weight: 600;
  text-decoration: none;
}

.site-header nav a:hover {
  color: var(--primary);
}
```

- **Flexbox** (`display: flex`) puts the logo and the links on one line, and `space-between` pushes them apart.
- `flex-wrap: wrap` lets the links drop onto a new line on very small screens instead of squashing.
- `position: sticky; top: 0` keeps the header visible as you scroll.

Want a hamburger menu for phones? Our [responsive navbar tutorial](/responsive-navbar-html-css/) shows you how.

### 4.3 The hero section

```css
.hero {
  text-align: center;
  padding: 90px 24px;
  color: #ffffff;
  background: linear-gradient(135deg, var(--primary), #9333ea);
}

.hero h1 {
  font-size: clamp(32px, 6vw, 56px);
  margin: 0 0 12px;
}

.hero p {
  font-size: 20px;
  max-width: 600px;
  margin: 0 auto 28px;
}

.button {
  display: inline-block;
  background: var(--accent);
  color: #1f2937;
  font-weight: 800;
  text-decoration: none;
  padding: 14px 28px;
  border-radius: 999px;
  transition: transform 0.15s ease;
}

.button:hover {
  transform: translateY(-2px);
}
```

- `linear-gradient` blends two colours for an eye-catching background.
- `clamp(32px, 6vw, 56px)` makes the heading grow with the screen width but never smaller than 32px or bigger than 56px. That's responsive text in a single line.
- `max-width` plus `margin: 0 auto` keeps the paragraph a comfortable reading width and centres it.

### 4.4 Sections and the project grid

```css
.section {
  max-width: 1000px;
  margin: 0 auto;
  padding: 60px 24px;
}

.section h2 {
  font-size: 32px;
  margin-top: 0;
}

.projects {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 24px;
}

.card {
  background: var(--card);
  border-radius: 16px;
  padding: 24px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.06);
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}

.card:hover {
  transform: translateY(-4px);
  box-shadow: 0 10px 24px rgba(0, 0, 0, 0.1);
}

.card-icon {
  font-size: 40px;
}

.card h3 {
  margin: 10px 0 6px;
}

.card p {
  color: var(--muted);
  margin: 0;
}
```

This one line is the magic of **CSS Grid**:

```css
grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
```

It means: *"make as many columns as fit, each at least 240px wide, and share any spare space equally."* On a laptop you get three columns, on a tablet two, and on a phone one. You don't need a single media query.

### 4.5 Contact and footer

```css
.contact {
  text-align: center;
}

.site-footer {
  text-align: center;
  padding: 24px;
  color: var(--muted);
  border-top: 1px solid #e5e7eb;
}
```

Refresh the page. You now have a modern, responsive website!

## Part 5: Test on different screens

1. In Chrome or Edge, press **F12** to open the developer tools.
2. Click the phone-and-tablet icon (**Toggle device toolbar**).
3. Choose different devices from the list at the top.

Check that:

- nothing is cut off or overlaps,
- the project cards stack into one column on a phone,
- text is easy to read without zooming,
- links and buttons are big enough to tap.

## Part 6: Make it yours

Now for the fun part. Make it your own:

- **Change the theme:** edit the colours in `:root`. Try `--primary: #059669;` for green.
- **Add your real projects:** a link to your Scratch game, a screenshot of your maze, a drawing you made.
- **Add an image:** save it in the `images` folder and use `<img src="images/game.png" alt="My maze game">`. Always write `alt` text describing the image. It is read aloud to blind users and shown if the image fails to load.
- **Add a second page:** create `games.html`, copy the header and footer into it, and link to it from the navigation.

## Part 7: Publish your website for free

A website on your computer can only be seen by you. To share it, it needs to be on a web server. Several services host simple HTML and CSS websites for free. Here is how to do it with **GitHub Pages**.

> GitHub accounts are for people aged 13 and over. If you are younger, ask a parent or teacher to publish the site with their account, or keep your site private on your computer for now.

1. Create a free account at github.com.
2. Click **New repository**, name it `my-website`, choose **Public**, and click **Create repository**.
3. Click **uploading an existing file**, drag in `index.html`, `style.css` and your `images` folder, then click **Commit changes**.
4. Go to the repository's **Settings → Pages**.
5. Under **Build and deployment**, choose **Deploy from a branch**, select the **main** branch and the **/ (root)** folder, and click **Save**.
6. Wait a minute or two, then refresh. GitHub shows your site's address, which looks like `https://your-username.github.io/my-website/`.

Share the link. Your website is live!

## Common problems and fixes

| Problem | Fix |
|---|---|
| None of my styles work | Check `<link rel="stylesheet" href="style.css">` is in the `<head>` and the file name matches exactly |
| My image does not show | Check the path and spelling, including capital letters: `images/Game.png` is not `images/game.png` on a web server |
| The navigation links do not jump | The `href="#about"` must match `id="about"` exactly |
| Cards are squashed on a phone | Check the `minmax(240px, 1fr)` line, and that the `viewport` meta tag is in the `<head>` |
| The published site shows "404" | Make sure the home page is named `index.html` (lowercase) and is in the top level of the repository |

## What you learned

- How every web page is structured, and how to use semantic tags (`header`, `main`, `section`, `article`, `footer`).
- CSS variables, Flexbox for rows, and **CSS Grid** for responsive galleries.
- Responsive text with `clamp()` and testing with developer tools.
- Writing good `alt` text and keeping personal information safe.
- Publishing a real website for free.

## Where to go next

- Add interactivity with **JavaScript**, for example a "dark mode" button or a mini quiz.
- Turn your header into a [mobile hamburger menu](/responsive-navbar-html-css/).
- Learn more about how the three web languages work together in [HTML vs CSS vs JavaScript](/html-css-javascript-explained/).

## Frequently asked questions

**How long does this project take?** Most beginners finish the first version in two to three hours, spread over a few sessions.

**Do I need to pay for a domain name?** No. Free hosts give you a free address. You can buy a custom name (like `alexcodes.com`) later if you want one.

**Is HTML a programming language?** Strictly, HTML is a *markup* language: it describes content rather than giving step-by-step instructions. That does not make it less important. Every website depends on it.

**What age can children start building websites?** Many children start HTML and CSS around 10 or 11, once they are comfortable typing. Younger learners often start with block-based coding like Scratch.
