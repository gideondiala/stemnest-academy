---
title: "How to Center a Div in CSS: 6 Easy Ways That Actually Work"
description: How to center a div in CSS: six methods that work, from Flexbox and Grid to margin auto, with copy-and-paste code and when to use each one.
date: 2026-10-14
category: Learn by Doing
tags: [css, html, web development, beginner, layout]
emoji: 🎯
level: Beginner
age: 11+
---

If you have ever tried to put a box in the middle of a web page, you know the feeling. You type `text-align: center`, nothing happens. You try `margin: auto`, it only moves sideways. Ten minutes later you are searching "how to center a div" like millions of developers before you.

The good news is that modern CSS makes this easy. You only need to know which tool fits which job. This guide shows you six methods, explains when to use each one, and gives you code you can copy straight into your project.

## First, what do we mean by "center"?

There are two directions:

- **Horizontally:** left to right, so the box sits in the middle of the row.
- **Vertically:** top to bottom, so the box sits halfway down its container.

Some methods only do one direction. The best methods do both at once. Keep that in mind and the rest of this guide will make a lot more sense.

For every example we will use the same simple HTML: a container with a box inside it.

```html
<div class="container">
  <div class="box">I am centered!</div>
</div>
```

And some basic styles so we can see what is happening:

```css
.container {
  height: 300px;
  background: #e0e7ff;
}

.box {
  width: 200px;
  padding: 20px;
  background: #4f46e5;
  color: white;
  text-align: center;
  border-radius: 12px;
}
```

The container needs a height so there is space to center the box vertically. Without a height, a container is only as tall as its contents, so there is nowhere to move to.

## Method 1: Flexbox (the one most people should use)

```css
.container {
  display: flex;
  justify-content: center;
  align-items: center;
}
```

That's it. Three lines, and the box is perfectly in the middle in both directions.

**How it works:** `display: flex` turns the container into a flex container. `justify-content: center` centers the children along the main direction (a row, so left to right). `align-items: center` centers them along the other direction (top to bottom).

Use Flexbox when you want to center one or more items, like a button, a card or a row of icons. It is supported by every modern browser, and it is the method you will use most often.

## Method 2: CSS Grid (the shortest)

```css
.container {
  display: grid;
  place-items: center;
}
```

Just two lines. `place-items: center` is a shortcut that centers the item both horizontally and vertically inside its grid area.

Grid is perfect for centering a single thing, such as a login form in the middle of the screen or a "loading" spinner. If you are already using Grid for your layout, this is the natural choice.

## Method 3: margin auto (horizontal only)

```css
.box {
  margin: 0 auto;
}
```

This is the classic way to center a block horizontally, and you will see it everywhere, especially for centering a whole page's content:

```css
.page {
  max-width: 900px;
  margin: 0 auto;
}
```

**How it works:** `auto` tells the browser to share the leftover space equally between the left and right margins, which pushes the box into the middle.

**The catch:** the box must have a width (or max-width) smaller than its container. A normal div stretches to the full width by default, so there is no leftover space to share. That is why `margin: auto` sometimes seems to "do nothing".

It also does not center vertically in normal page flow. For that, use Flexbox or Grid.

## Method 4: Absolute positioning with transform

```css
.container {
  position: relative;
}

.box {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
}
```

This one looks a bit mysterious, so let's go through it:

1. `position: relative` on the container makes it the reference point for the box.
2. `top: 50%` and `left: 50%` move the **top-left corner** of the box to the middle of the container.
3. That leaves the box slightly too far down and to the right. `transform: translate(-50%, -50%)` pulls it back by half of its own width and half of its own height.

The result is a perfectly centered box, even if you do not know its size.

Use this for things that float on top of other content, such as a pop-up window, a play button over a video, or a badge on top of an image. Absolutely positioned elements are taken out of the normal layout, so avoid this method for ordinary page sections.

## Method 5: text-align center (for text and inline items)

```css
.container {
  text-align: center;
}
```

This is the method everyone tries first, and it does work, but only for **inline content**: text, links, images and inline-block elements. It centers things *inside* a box, not the box itself.

So this centers the words inside `.box`, but a plain div would stay on the left. To center a small element like a button with `text-align`, make it inline-block:

```css
.button {
  display: inline-block;
}
```

## Method 6: Flexbox with margin auto (a neat trick)

```css
.container {
  display: flex;
}

.box {
  margin: auto;
}
```

Inside a flex container, `margin: auto` soaks up free space on **all four sides**, so the item ends up in the center both ways. It is handy when you want just one item centered and the others placed differently.

## Which method should I use?

| You want to center... | Best method |
|---|---|
| Anything, both directions | Flexbox (`justify-content` + `align-items`) |
| One item, shortest code | Grid (`place-items: center`) |
| A page or section horizontally | `max-width` + `margin: 0 auto` |
| A pop-up or overlay on top of content | Absolute position + `transform` |
| Text, links or images inside a box | `text-align: center` |

If you only remember one, remember Flexbox. It handles almost every case.

## Centering in the whole screen

A very common job is centering something in the middle of the whole browser window, like a welcome message. Give the container the full height of the screen:

```css
.container {
  min-height: 100vh;
  display: grid;
  place-items: center;
}
```

`100vh` means "100% of the viewport height", in other words the full height of the visible window. Using `min-height` instead of `height` means the container can still grow if the content is taller than the screen, which is important on small phones.

## Why isn't my div centering? (Quick fixes)

1. **The container has no height.** Vertical centering needs space. Add a `height` or `min-height`.
2. **You put the CSS on the wrong element.** Flexbox and Grid rules go on the **container (parent)**. `margin: auto` goes on the **box (child)**.
3. **The box is full width.** `margin: 0 auto` needs a `width` or `max-width` on the box.
4. **A typo in the class name.** `.contianer` will never match `class="container"`. Check spelling in both the HTML and the CSS.
5. **Something else overrides it.** Right-click the element, choose **Inspect**, and look at the Styles panel. Crossed-out rules are being overridden by something else.

## Try it yourself

Open a free online editor such as CodePen, paste the HTML and the basic styles from the top of this guide, then try each method one at a time. Change the box width, add a second box, and see how each method behaves. Ten minutes of playing will teach you more than an hour of reading.

Once you are comfortable, learn more about the layout tool behind Method 1 in our [CSS Flexbox tutorial for beginners](/css-flexbox-tutorial-for-beginners/), or put your skills to work on a full project with our guide to [building your first website](/build-your-first-website-html-css/).

## Frequently asked questions

**What is the easiest way to center a div?** Put `display: grid; place-items: center;` on the parent element. It centers the child both horizontally and vertically in two lines.

**Why doesn't `text-align: center` center my div?** Because `text-align` only affects inline content such as text and images. A div is a block element. Use Flexbox, Grid or `margin: 0 auto` instead.

**How do I center a div horizontally only?** Give the div a width and use `margin: 0 auto;`, or use `display: flex; justify-content: center;` on its parent.

**Does centering with Flexbox work on phones?** Yes. Flexbox and Grid work in all modern browsers on phones, tablets and computers.
