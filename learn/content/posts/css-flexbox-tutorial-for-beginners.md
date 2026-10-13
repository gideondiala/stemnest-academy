---
title: "CSS Flexbox Tutorial for Beginners: Learn It in One Afternoon"
description: Learn CSS Flexbox in one afternoon: justify-content, align-items, gap, wrap and flex-grow explained simply, plus three real layouts to build.
date: 2026-10-13
category: Learn by Doing
tags: [css, web development, layout, beginner]
emoji: 📐
level: Beginner
age: 11+
---

Before Flexbox, lining things up on a web page was genuinely painful. Developers used tricks with floats and tables that broke whenever the screen size changed. Then Flexbox arrived and made layout feel almost easy.

Flexbox is the tool you reach for when you want to put things **in a row or a column** and control how they share the space. Navigation bars, rows of cards, buttons side by side, footers, centering things: Flexbox does all of them.

By the end of this guide you will understand the handful of properties that do 90% of the work, and you will have built three real layouts.

## The two big ideas

Flexbox has only two things you need to picture.

**1. The container and its items.** You turn on Flexbox on a **parent** element (the container). Its direct children become **flex items**, and the container decides how they are arranged.

**2. Two directions.** Every flex container has a **main axis** (the direction items flow, which is left to right by default) and a **cross axis** (the other direction, top to bottom by default).

Almost every Flexbox property is about one of those two axes. Once that clicks, the rest is just vocabulary.

## Your practice page

Make a file called `flex.html` and paste this in. We will change only the CSS as we go.

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Flexbox practice</title>
  <style>
    .container {
      background: #e0e7ff;
      padding: 10px;
      min-height: 220px;
    }
    .item {
      background: #4f46e5;
      color: white;
      padding: 20px;
      border-radius: 10px;
      font-family: sans-serif;
      font-size: 20px;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="item">1</div>
    <div class="item">2</div>
    <div class="item">3</div>
  </div>
</body>
</html>
```

Open it in a browser. You will see three boxes stacked on top of each other, each stretching across the whole width. That is normal block layout. Now let's flex it.

## Step 1: display flex

Add one line to `.container`:

```css
.container {
  display: flex;
}
```

The boxes jump into a row, side by side, each only as wide as its content. You have just made your first flex container.

## Step 2: Spacing with gap

The boxes are touching. The cleanest way to space them is `gap`:

```css
.container {
  display: flex;
  gap: 16px;
}
```

`gap` adds space *between* items only, never on the outside edges. It is much tidier than adding margins to every item.

## Step 3: justify-content (the main axis)

`justify-content` decides where items sit along the main axis, and what happens to any spare space.

```css
.container {
  display: flex;
  justify-content: center;
}
```

Try each of these values and watch what changes:

| Value | What it does |
|---|---|
| `flex-start` | Items packed at the start (the default) |
| `flex-end` | Items packed at the end |
| `center` | Items grouped in the middle |
| `space-between` | First item at the start, last at the end, equal space between |
| `space-around` | Equal space around each item (half-size gaps at the edges) |
| `space-evenly` | Exactly equal space everywhere, edges included |

`space-between` is the one you will use constantly. It is how you put a logo on the left and links on the right in a navigation bar.

## Step 4: align-items (the cross axis)

`align-items` controls the other direction. Because our container has a `min-height` of 220px, there is vertical room to play with:

```css
.container {
  display: flex;
  align-items: center;
}
```

| Value | What it does |
|---|---|
| `stretch` | Items stretch to fill the height (the default) |
| `flex-start` | Items at the top |
| `flex-end` | Items at the bottom |
| `center` | Items in the vertical middle |
| `baseline` | Items lined up by the bottom of their first line of text |

Put `justify-content: center` and `align-items: center` together and you have perfectly centered items. (There are other ways too, all covered in [how to center a div](/how-to-center-a-div-in-css/).)

## Step 5: flex-direction (rows or columns)

```css
.container {
  display: flex;
  flex-direction: column;
}
```

Now the items flow top to bottom. Here's the bit that confuses everyone at first: **the axes swap**. In a column, `justify-content` controls the vertical position and `align-items` controls the horizontal position. The main axis always follows the direction of flow.

The four values are `row` (default), `row-reverse`, `column` and `column-reverse`.

## Step 6: flex-wrap (when items don't fit)

Add more items to your HTML, say ten of them, and give each a width:

```css
.item {
  width: 150px;
}
```

By default Flexbox squeezes everything onto one line, even if the items have to shrink. To let them flow onto new lines like words in a paragraph, use:

```css
.container {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
}
```

Wrapping is what makes card layouts work on both big screens and small phones.

## Step 7: Controlling the items themselves

So far every property went on the container. A few go on the **items**.

### flex-grow: take up spare space

```css
.item:nth-child(2) {
  flex-grow: 1;
}
```

Item 2 now stretches to fill all the leftover space. If you give every item `flex-grow: 1`, they share the space equally. Give one item `flex-grow: 2` and it gets twice as much of the spare space as the others.

### flex-shrink: allow shrinking

Items are allowed to shrink by default (`flex-shrink: 1`). Set `flex-shrink: 0` on something that must keep its size, like a logo or an icon.

### flex-basis: the starting size

`flex-basis` sets an item's starting size before growing or shrinking happens. You will often see all three combined in the shorthand:

```css
.item {
  flex: 1 1 200px; /* grow, shrink, start at 200px */
}
```

That one line says: "start at 200px wide, grow to fill space, shrink if needed". Combined with `flex-wrap: wrap`, it creates a responsive card grid in a single rule.

### align-self: one item breaks the rule

```css
.item:nth-child(3) {
  align-self: flex-end;
}
```

This overrides `align-items` for one item only. Item 3 drops to the bottom while the others stay put.

## Three real layouts

Time to use what you've learned.

### Layout 1: A navigation bar

```html
<nav class="nav">
  <div class="logo">PixelNest</div>
  <ul class="links">
    <li><a href="#">Home</a></li>
    <li><a href="#">Games</a></li>
    <li><a href="#">About</a></li>
  </ul>
</nav>
```

```css
.nav {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 24px;
  background: #1e3a8a;
  color: white;
}

.links {
  display: flex;
  gap: 20px;
  list-style: none;
  margin: 0;
  padding: 0;
}

.links a {
  color: white;
  text-decoration: none;
}
```

Two flex containers working together: the outer one spreads the logo and the menu apart, the inner one lines up the links. Want it to turn into a hamburger menu on phones? Our [responsive navbar tutorial](/responsive-navbar-html-css/) shows you how.

### Layout 2: A row of cards that wraps

```css
.cards {
  display: flex;
  flex-wrap: wrap;
  gap: 20px;
}

.card {
  flex: 1 1 250px;
  background: white;
  padding: 20px;
  border-radius: 12px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.08);
}
```

On a wide screen the cards sit side by side. As the screen narrows they wrap onto new rows, and on a phone each card fills the width. No media queries needed.

### Layout 3: A footer that stays at the bottom

A classic annoyance: on a short page, the footer floats halfway up the screen. Flexbox fixes it.

```css
body {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  margin: 0;
}

main {
  flex-grow: 1;
}
```

The body becomes a column that is at least the height of the screen, and `main` grows to fill any spare space, which pushes the footer to the bottom.

## Flexbox or Grid?

You will hear about CSS Grid too. A simple rule of thumb:

- **Flexbox** is for arranging things in **one direction**, a row or a column. Navbars, button groups, lists of items.
- **Grid** is for **two directions at once**, rows and columns together. Photo galleries, whole page layouts.

They work brilliantly together. Many pages use Grid for the big structure and Flexbox inside each section.

## Cheat sheet

**On the container:**

- `display: flex` turns it on
- `flex-direction` sets row or column
- `justify-content` positions items on the main axis
- `align-items` positions items on the cross axis
- `flex-wrap` lets items move onto new lines
- `gap` sets the space between items

**On the items:**

- `flex-grow` takes a share of spare space
- `flex-shrink` controls shrinking
- `flex-basis` sets the starting size
- `flex` is the shorthand for all three
- `align-self` overrides alignment for one item
- `order` changes the visual order

## Practice ideas

1. Build a profile card with a round photo on the left and the name and bio on the right.
2. Make a pricing section with three plans side by side that stack on phones.
3. Recreate the bottom navigation bar of your favourite app with four evenly spaced icons.

Every one of these uses only the properties in this guide. Once you have built a couple, Flexbox will feel completely natural.

## Frequently asked questions

**Is Flexbox hard to learn?** Not really. Most people understand the basics in an afternoon. The trickiest part is remembering that the axes swap when you change `flex-direction` to column.

**Does Flexbox work on all browsers?** Yes. Flexbox is supported in all modern browsers on computers, tablets and phones.

**Why are my flex items not wrapping?** Flexbox does not wrap by default. Add `flex-wrap: wrap` to the container, and make sure the items have a width or `flex-basis`.

**Why doesn't justify-content do anything?** Usually because there is no spare space. If the items already fill the container, there is nothing to distribute. Try giving the items a smaller width.
