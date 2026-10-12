---
title: How to Build a Responsive Navbar with HTML and CSS (Hamburger Menu Included)
description: Build a clean, accessible navigation bar that turns into a hamburger menu on phones — full HTML, CSS and a tiny bit of JavaScript, explained line by line.
date: 2026-10-13
category: Learn by Doing
tags: [html, css, javascript, web development, beginner]
emoji: 🧭
level: Beginner
age: 11+
---

Almost every website has a **navigation bar** (navbar) at the top: a logo on one side and links on the other. On a phone there is not enough room for all the links, so they hide behind a "hamburger" button (☰).

In this tutorial you will build exactly that, from an empty file, and understand every line. You will use:

- **HTML** for the structure (what is on the page),
- **CSS** for the look and the layout (Flexbox and a media query),
- **JavaScript** — just five lines — to open and close the menu.

> **What you need:** a text editor (VS Code is free, or use an online editor such as CodePen) and a web browser. New to these languages? Read [HTML vs CSS vs JavaScript explained](/html-css-javascript-explained/) first.

## What we are building

- On a **wide screen**: logo on the left, links in a row on the right.
- On a **narrow screen** (under 700 pixels): logo on the left and a ☰ button on the right. Tapping it shows the links in a column underneath.

## Step 1: The HTML

Create a folder called `navbar`, and inside it a file called `index.html`:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Responsive Navbar</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>

  <header class="navbar">
    <a href="#" class="logo">Pixel<span>Nest</span></a>

    <nav>
      <ul class="nav-links" id="nav-links">
        <li><a href="#">Home</a></li>
        <li><a href="#">Games</a></li>
        <li><a href="#">Projects</a></li>
        <li><a href="#">About</a></li>
        <li><a href="#" class="nav-button">Join</a></li>
      </ul>
    </nav>

    <button class="menu-toggle" aria-label="Open menu" aria-expanded="false" aria-controls="nav-links">
      <span class="bar"></span>
      <span class="bar"></span>
      <span class="bar"></span>
    </button>
  </header>

  <main>
    <h1>Welcome!</h1>
    <p>Make your browser narrower to see the menu change.</p>
  </main>

  <script src="script.js"></script>
</body>
</html>
```

**What each part does:**

- `<meta name="viewport" …>` tells phones to use the real screen width. Without it, phones pretend to be a desktop and shrink everything, and the media query in Step 4 would never trigger.
- `<header>` and `<nav>` are **semantic** tags: they tell browsers, screen readers and search engines that this is the site header and the main navigation.
- The links are in a **list** (`<ul>` and `<li>`), because a menu *is* a list of links. This is the standard, accessible way.
- The menu button is a real `<button>` with three empty `<span>` bars that we will style into the ☰ icon. It comes *after* the `<nav>` so that, on phones, it sits at the far right of the bar.
- `aria-label`, `aria-expanded` and `aria-controls` tell screen-reader users what the button is and whether the menu is open.

Open `index.html` in your browser. It looks plain — that is fine. HTML is about meaning; CSS will make it look good.

## Step 2: Basic styles

Create `style.css` in the same folder:

```css
* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

body {
  font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
  background: #f5f7fb;
  color: #1f2937;
}

main {
  padding: 40px 20px;
}

h1 {
  margin-bottom: 10px;
}
```

`box-sizing: border-box` makes widths include padding and borders, which makes layouts much easier to reason about. Removing the default margins gives us a clean start.

## Step 3: Lay out the navbar with Flexbox

Add this to `style.css`:

```css
.navbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 24px;
  background: #1e3a8a;
  position: relative;
}

.logo {
  color: #ffffff;
  font-size: 24px;
  font-weight: 800;
  text-decoration: none;
}

.logo span {
  color: #fbbf24;
}

.nav-links {
  display: flex;
  gap: 24px;
  list-style: none;
  align-items: center;
}

.nav-links a {
  color: #e0e7ff;
  text-decoration: none;
  font-weight: 600;
  padding: 6px 2px;
}

.nav-links a:hover,
.nav-links a:focus {
  color: #ffffff;
  border-bottom: 2px solid #fbbf24;
}

.nav-links .nav-button {
  background: #fbbf24;
  color: #1e3a8a;
  padding: 8px 18px;
  border-radius: 999px;
}

.nav-links .nav-button:hover {
  border-bottom: none;
  background: #fcd34d;
}

.menu-toggle {
  display: none;
}
```

**The key ideas:**

- `display: flex` on `.navbar` puts the logo, the nav and the button **in a row**.
- `justify-content: space-between` pushes the logo to the left and the links to the right.
- `align-items: center` lines everything up vertically.
- `.nav-links` is also a flex container, so the links sit side by side with a `gap` between them.
- `list-style: none` removes the bullet points.
- The menu button is hidden for now with `display: none` — we only want it on small screens.

Refresh the browser. You now have a proper desktop navbar.

## Step 4: Make it responsive with a media query

A **media query** applies CSS only when a condition is true — here, when the screen is 700 pixels wide or less.

```css
@media (max-width: 700px) {
  .menu-toggle {
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 5px;
    width: 44px;
    height: 44px;
    background: transparent;
    border: 0;
    cursor: pointer;
  }

  .bar {
    display: block;
    width: 26px;
    height: 3px;
    margin: 0 auto;
    background: #ffffff;
    border-radius: 3px;
    transition: transform 0.25s ease, opacity 0.25s ease;
  }

  .nav-links {
    display: none;
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    flex-direction: column;
    gap: 0;
    background: #1e3a8a;
    padding: 8px 24px 20px;
  }

  .nav-links.open {
    display: flex;
  }

  .nav-links li {
    width: 100%;
  }

  .nav-links a {
    display: block;
    padding: 12px 0;
  }
}
```

**What happens on a phone:**

- The ☰ button appears: a 44×44 pixel button (a comfortable size for a finger) with three white bars stacked by Flexbox.
- The links are hidden (`display: none`) and, when shown, appear in a **column** directly below the header (`position: absolute; top: 100%`). That works because we gave `.navbar` `position: relative`.
- A class called `open` will show the links. JavaScript adds and removes that class.

## Step 5: Five lines of JavaScript

Create `script.js`:

```js
const toggle = document.querySelector('.menu-toggle');
const links = document.querySelector('.nav-links');

toggle.addEventListener('click', () => {
  const isOpen = links.classList.toggle('open');
  toggle.setAttribute('aria-expanded', isOpen);
  toggle.setAttribute('aria-label', isOpen ? 'Close menu' : 'Open menu');
});
```

- `querySelector` finds the button and the list.
- `classList.toggle('open')` adds the class if it is missing and removes it if it is there. It also returns `true` when the menu is now open.
- We update `aria-expanded` and the label so screen readers announce "menu, expanded" or "collapsed".

Make your browser narrow (or press **F12** and use the phone icon in the developer tools) and tap the ☰. The menu opens and closes.

## Step 6 (bonus): Turn ☰ into ✕

A nice touch is turning the three bars into a cross when the menu is open. Add inside the media query:

```css
  .menu-toggle[aria-expanded="true"] .bar:nth-child(1) {
    transform: translateY(8px) rotate(45deg);
  }

  .menu-toggle[aria-expanded="true"] .bar:nth-child(2) {
    opacity: 0;
  }

  .menu-toggle[aria-expanded="true"] .bar:nth-child(3) {
    transform: translateY(-8px) rotate(-45deg);
  }
```

Because the JavaScript already updates `aria-expanded`, the CSS can react to it. The middle bar fades out, and the top and bottom bars move to the middle and rotate into an ✕. Each bar is 3px tall with a 5px gap, so moving 8px brings the outer bars exactly onto the middle one.

## Accessibility checklist

Good navbars work for everyone:

- ✅ Uses `<header>`, `<nav>`, `<ul>` and a real `<button>`.
- ✅ The button has a text label (`aria-label`) because it only shows an icon.
- ✅ `aria-expanded` tells screen readers whether the menu is open.
- ✅ Links show a visible style on `:focus`, so keyboard users can see where they are (press **Tab** to try it).
- ✅ The tap target is at least 44×44 pixels.
- ✅ Text has strong colour contrast against the dark blue background.

## Common mistakes

| Problem | Fix |
|---|---|
| The menu never changes on a phone | You are missing the `viewport` meta tag in the `<head>` |
| The dropdown appears in the wrong place | Add `position: relative` to `.navbar` |
| The ☰ button does nothing | Check `script.js` is linked just before `</body>` and the class names match exactly |
| Links are still in a row on mobile | Add `flex-direction: column` inside the media query |

## Challenges to try next

1. **Sticky navbar:** add `position: sticky; top: 0; z-index: 10;` to `.navbar` so it stays visible while scrolling (keep it working with the dropdown by testing on a phone width).
2. **Active page:** add `class="active"` to the current page's link and give it a different colour.
3. **Close on click:** make the menu close when a link is tapped (hint: add a click listener to `links` that removes `open`).
4. **Dark mode:** use a media query `@media (prefers-color-scheme: dark)` to change colours automatically.

## What you learned

- Semantic HTML structure for navigation.
- **Flexbox** for rows, columns, spacing and alignment.
- **Media queries** for responsive design.
- Using JavaScript to **toggle a class**, and CSS to react to it.
- Basic **accessibility** with ARIA attributes.

Ready to put your navbar on a real website? Follow our [complete guide to building your first website](/build-your-first-website-html-css/).

## Frequently asked questions

**Can I make a hamburger menu without JavaScript?** Yes — a common trick uses a hidden checkbox and the `:checked` selector. It works, but a real button with JavaScript is better for accessibility, so we recommend the approach in this guide.

**Why 700px?** It is a sensible point where five links no longer fit comfortably. Choose whatever width suits your own links.

**Should I use Bootstrap or Tailwind instead?** Frameworks are useful later, but building a navbar by hand first teaches you what those frameworks are doing for you.
