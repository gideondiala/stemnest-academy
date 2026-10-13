---
title: "Build a To-Do List App with JavaScript (Beginner Project, Step by Step)"
description: Build a to-do list app with HTML, CSS and JavaScript. Add, tick off, delete and save tasks, with every line explained. A great first JS project.
date: 2026-10-13
category: Learn by Doing
tags: [javascript, html, css, web development, project, beginner]
emoji: ✅
level: Beginner
age: 12+
---

A to-do list is the classic first JavaScript app, and for good reason. It's small enough to finish in an afternoon, but it covers the skills behind almost every web app you use: reading what the user types, responding to clicks, changing the page, and saving data.

By the end of this tutorial, your app will let you:

- add tasks,
- tick them off as done,
- delete them,
- see how many are left,
- and **keep your list saved** even after closing the browser.

> **What you need:** a text editor (VS Code is free) and a web browser, or a free online editor like CodePen. You should know a little HTML and CSS. If you don't yet, read [HTML vs CSS vs JavaScript explained](/html-css-javascript-explained/) first.

## Step 1: The HTML

Create a folder called `todo` with three files: `index.html`, `style.css` and `app.js`. Start with the HTML:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>My To-Do List</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <main class="app">
    <h1>My To-Do List</h1>

    <form id="task-form">
      <input id="task-input" type="text" placeholder="What do you need to do?" autocomplete="off" required>
      <button type="submit">Add</button>
    </form>

    <ul id="task-list"></ul>

    <p id="counter"></p>
  </main>

  <script src="app.js"></script>
</body>
</html>
```

- The `<form>` holds a text box and an **Add** button. Using a form means pressing **Enter** also adds a task, for free.
- `required` stops empty tasks from being added.
- The `<ul>` is empty for now. JavaScript will fill it with tasks.
- The `<script>` tag goes at the end of the body, so the page exists before the JavaScript tries to use it.

## Step 2: Make it look good

Paste this into `style.css`:

```css
* {
  box-sizing: border-box;
}

body {
  margin: 0;
  min-height: 100vh;
  background: linear-gradient(135deg, #6366f1, #a855f7);
  font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
  display: grid;
  place-items: start center;
  padding: 40px 16px;
}

.app {
  width: 100%;
  max-width: 460px;
  background: white;
  border-radius: 18px;
  padding: 24px;
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.2);
}

h1 {
  margin-top: 0;
  color: #312e81;
}

form {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
}

input {
  flex: 1;
  padding: 12px;
  border: 2px solid #e5e7eb;
  border-radius: 10px;
  font-size: 16px;
}

input:focus {
  outline: none;
  border-color: #6366f1;
}

button {
  border: none;
  border-radius: 10px;
  padding: 12px 18px;
  font-size: 16px;
  font-weight: bold;
  cursor: pointer;
  background: #6366f1;
  color: white;
}

ul {
  list-style: none;
  padding: 0;
  margin: 0;
}

li {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 4px;
  border-bottom: 1px solid #f1f5f9;
}

li span {
  flex: 1;
  font-size: 17px;
}

li.done span {
  text-decoration: line-through;
  color: #9ca3af;
}

li input[type="checkbox"] {
  width: 20px;
  height: 20px;
  flex: none;
}

.delete {
  background: #fee2e2;
  color: #b91c1c;
  padding: 6px 10px;
}

#counter {
  color: #6b7280;
  margin-bottom: 0;
}
```

The interesting parts: Flexbox lines up each task's checkbox, text and delete button, and `li.done span` crosses out finished tasks. (New to Flexbox? Our [Flexbox tutorial](/css-flexbox-tutorial-for-beginners/) explains it all.)

## Step 3: Keep the tasks in an array

Here's the most important idea in this whole project. Instead of treating the page as the "truth", we keep the tasks in a JavaScript **array**, and we redraw the list from that array whenever something changes.

Open `app.js` and start with this:

```js
const form = document.getElementById('task-form');
const input = document.getElementById('task-input');
const list = document.getElementById('task-list');
const counter = document.getElementById('counter');

let tasks = [];
```

- `document.getElementById` finds an element on the page by its `id`, and we store each one in a **constant** so we can use it later.
- `tasks` is an empty array. Each task will be an **object** like `{ text: 'Do homework', done: false }`.

## Step 4: Draw the list

Add a function that turns the array into list items on the page:

```js
function render() {
  list.innerHTML = '';

  tasks.forEach((task, index) => {
    const li = document.createElement('li');
    if (task.done) li.classList.add('done');

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = task.done;
    checkbox.addEventListener('change', () => toggleTask(index));

    const text = document.createElement('span');
    text.textContent = task.text;

    const del = document.createElement('button');
    del.textContent = 'Delete';
    del.className = 'delete';
    del.addEventListener('click', () => deleteTask(index));

    li.append(checkbox, text, del);
    list.append(li);
  });

  const left = tasks.filter(task => !task.done).length;
  counter.textContent = tasks.length === 0
    ? 'Nothing to do. Enjoy your day!'
    : `${left} of ${tasks.length} tasks left`;
}
```

**What's happening:**

- `list.innerHTML = ''` empties the list so we can rebuild it.
- `forEach` runs the code once for each task, giving us the task and its position (`index`).
- `document.createElement` makes new HTML elements in JavaScript. We build a checkbox, a span for the text and a delete button, then `append` them into the `<li>`.
- We use `textContent` (not `innerHTML`) to put the task text on the page. That way, if someone types something like `<b>hello</b>`, it shows as plain text instead of being treated as HTML. It's a good safety habit.
- `filter` makes a new array containing only unfinished tasks, and `.length` counts them.

## Step 5: Add, tick and delete

Now the three actions:

```js
function addTask(text) {
  tasks.push({ text: text, done: false });
  save();
  render();
}

function toggleTask(index) {
  tasks[index].done = !tasks[index].done;
  save();
  render();
}

function deleteTask(index) {
  tasks.splice(index, 1);
  save();
  render();
}
```

- `push` adds a new task to the end of the array.
- `!tasks[index].done` flips true to false and false to true.
- `splice(index, 1)` removes one item at that position.

Every action follows the same pattern: **change the data, save it, redraw.** Keeping to that pattern is what stops apps from getting messy and confusing.

## Step 6: Respond to the form

```js
form.addEventListener('submit', event => {
  event.preventDefault();
  const text = input.value.trim();
  if (text === '') return;
  addTask(text);
  input.value = '';
  input.focus();
});
```

- When a form is submitted, browsers normally reload the page. `event.preventDefault()` stops that.
- `trim()` removes spaces from both ends, so a task that's only spaces is ignored.
- After adding, we clear the box and put the cursor back in it, ready for the next task.

## Step 7: Save with localStorage

Right now, refreshing the page wipes everything. Browsers have a simple storage area called **localStorage** that keeps text even after you close the tab.

```js
function save() {
  localStorage.setItem('tasks', JSON.stringify(tasks));
}

function load() {
  const saved = localStorage.getItem('tasks');
  if (saved) {
    tasks = JSON.parse(saved);
  }
}

load();
render();
```

- localStorage can only store **text**. `JSON.stringify` turns our array into text, and `JSON.parse` turns it back into an array.
- When the page opens, `load()` reads any saved tasks and `render()` draws them.

Open `index.html`, add some tasks, tick one off, and refresh the page. Your list is still there.

> **Good to know:** localStorage belongs to one browser on one device. Your list won't appear on your phone if you made it on your laptop. Syncing across devices needs a server and a database, which is a great next project once you're more experienced.

## The complete app.js

Here's everything together, in order:

```js
const form = document.getElementById('task-form');
const input = document.getElementById('task-input');
const list = document.getElementById('task-list');
const counter = document.getElementById('counter');

let tasks = [];

function save() {
  localStorage.setItem('tasks', JSON.stringify(tasks));
}

function load() {
  const saved = localStorage.getItem('tasks');
  if (saved) {
    tasks = JSON.parse(saved);
  }
}

function render() {
  list.innerHTML = '';

  tasks.forEach((task, index) => {
    const li = document.createElement('li');
    if (task.done) li.classList.add('done');

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = task.done;
    checkbox.addEventListener('change', () => toggleTask(index));

    const text = document.createElement('span');
    text.textContent = task.text;

    const del = document.createElement('button');
    del.textContent = 'Delete';
    del.className = 'delete';
    del.addEventListener('click', () => deleteTask(index));

    li.append(checkbox, text, del);
    list.append(li);
  });

  const left = tasks.filter(task => !task.done).length;
  counter.textContent = tasks.length === 0
    ? 'Nothing to do. Enjoy your day!'
    : `${left} of ${tasks.length} tasks left`;
}

function addTask(text) {
  tasks.push({ text: text, done: false });
  save();
  render();
}

function toggleTask(index) {
  tasks[index].done = !tasks[index].done;
  save();
  render();
}

function deleteTask(index) {
  tasks.splice(index, 1);
  save();
  render();
}

form.addEventListener('submit', event => {
  event.preventDefault();
  const text = input.value.trim();
  if (text === '') return;
  addTask(text);
  input.value = '';
  input.focus();
});

load();
render();
```

## If something doesn't work

Open the browser's developer tools (press **F12**) and check the **Console** tab for red error messages. The most common problems:

- **"Cannot read properties of null":** an `id` in the JavaScript doesn't match the HTML. Check spelling, for example `task-list`.
- **Nothing happens at all:** check `app.js` is linked at the bottom of `index.html` and the file name matches.
- **The page reloads when adding:** you're missing `event.preventDefault()`.

Our guide to [debugging your code](/how-to-debug-code-tips-for-beginners/) has many more tips.

## Upgrade ideas

1. **Clear completed:** a button that removes all ticked tasks in one go (hint: `tasks = tasks.filter(task => !task.done)`).
2. **Edit tasks:** double-click a task's text to change it.
3. **Filters:** buttons for All, Active and Done.
4. **Due dates:** add a date input and show overdue tasks in red.
5. **Dark mode:** a toggle that adds a `dark` class to the body.

## What you learned

- Selecting elements and responding to **events** (submit, click, change).
- Storing app data in an **array of objects**.
- **Rendering**: rebuilding the page from your data.
- Creating elements with JavaScript, and why `textContent` is safer than `innerHTML` for user input.
- Saving data with **localStorage** and **JSON**.

That "data, save, redraw" pattern is exactly how bigger tools and frameworks like React work under the hood. You've just built the foundation of real web development.

## Frequently asked questions

**Is a to-do list a good first JavaScript project?** Yes. It's one of the most popular first projects because it practises events, arrays, page updates and saving data in a small, useful app.

**Where is localStorage data kept?** In your browser, on your device. Clearing your browser data deletes it.

**Can I put my to-do app online?** Yes. Because it's just HTML, CSS and JavaScript files, you can publish it free in the same way as our [first website guide](/build-your-first-website-html-css/) explains.

**Do I need a framework like React?** Not for this. Learning plain JavaScript first makes frameworks much easier to understand later.
