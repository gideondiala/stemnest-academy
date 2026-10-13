---
title: "Build a Quiz Game with JavaScript (HTML, CSS and JS for Beginners)"
description: Make a multiple-choice quiz game with HTML, CSS and JavaScript: questions, scoring, instant feedback, a progress bar and a results screen.
date: 2026-10-30 09:00
category: Learn by Doing
tags: [javascript, html, css, games, project, beginner]
emoji: ❓
level: Beginner
age: 12+
---

Quiz games are one of the best beginner JavaScript projects. They're fun to play, easy to share, and they teach the core skills of web programming: storing data, responding to clicks, updating the page and keeping score.

In this tutorial you'll build a complete multiple-choice quiz that shows one question at a time, tells the player instantly whether they're right, keeps score, shows a progress bar, and finishes with a results screen and a "Play again" button. You can fill it with questions about anything you like.

> **What you need:** a text editor (VS Code is free) and a browser, or a free online editor like CodePen. If you're new to the three web languages, read [HTML vs CSS vs JavaScript explained](/html-css-javascript-explained/) first. If you've built our [to-do list app](/javascript-to-do-list-app-tutorial/), this will feel familiar.

## How the game works

1. Show a question and four answer buttons.
2. When the player clicks an answer, show whether it was right (green) or wrong (red), and reveal the correct answer.
3. Add a point for a correct answer.
4. Show a **Next** button to move on.
5. After the last question, show the score and a **Play again** button.

## Step 1: The HTML

Create a folder called `quiz` with three files: `index.html`, `style.css` and `quiz.js`.

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Space Quiz</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <main class="quiz">
    <div class="progress"><div id="progress-bar"></div></div>
    <p id="counter"></p>

    <section id="question-screen">
      <h1 id="question"></h1>
      <div id="answers"></div>
      <p id="feedback"></p>
      <button id="next" hidden>Next</button>
    </section>

    <section id="result-screen" hidden>
      <h1>Quiz complete!</h1>
      <p id="score"></p>
      <p id="message"></p>
      <button id="restart">Play again</button>
    </section>
  </main>

  <script src="quiz.js"></script>
</body>
</html>
```

There are two **sections**: one for questions and one for the results. JavaScript will show one and hide the other using the `hidden` attribute. The `answers` box is empty; JavaScript will fill it with buttons for each question.

## Step 2: The CSS

```css
* {
  box-sizing: border-box;
}

body {
  margin: 0;
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding: 16px;
  font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
  background: linear-gradient(135deg, #0f172a, #4338ca);
}

.quiz {
  width: 100%;
  max-width: 520px;
  background: white;
  border-radius: 20px;
  padding: 24px;
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.35);
}

.progress {
  height: 10px;
  background: #e5e7eb;
  border-radius: 99px;
  overflow: hidden;
}

#progress-bar {
  height: 100%;
  width: 0;
  background: #6366f1;
  transition: width 0.3s ease;
}

#counter {
  color: #6b7280;
  font-weight: bold;
}

h1 {
  font-size: 22px;
  color: #1e1b4b;
}

#answers {
  display: grid;
  gap: 10px;
}

#answers button,
#next,
#restart {
  font: inherit;
  font-size: 17px;
  padding: 14px;
  border-radius: 12px;
  border: 2px solid #e5e7eb;
  background: white;
  cursor: pointer;
  text-align: left;
}

#answers button:hover:not(:disabled) {
  border-color: #6366f1;
  background: #eef2ff;
}

#answers button.correct {
  background: #dcfce7;
  border-color: #16a34a;
}

#answers button.wrong {
  background: #fee2e2;
  border-color: #dc2626;
}

#next,
#restart {
  margin-top: 16px;
  width: 100%;
  text-align: center;
  background: #6366f1;
  border-color: #6366f1;
  color: white;
  font-weight: bold;
}

#feedback {
  font-weight: bold;
  min-height: 24px;
}
```

The answers use **CSS Grid** to stack neatly with a gap, and two classes, `correct` and `wrong`, colour the buttons green or red. (Want to know more about layout? See our [Flexbox tutorial](/css-flexbox-tutorial-for-beginners/).)

## Step 3: The questions

Open `quiz.js`. We store all the questions in an **array of objects**. Each object holds the question, the four options, and the position of the correct answer (0 for the first option, 1 for the second, and so on).

```js
const questions = [
  {
    question: 'Which planet is closest to the Sun?',
    options: ['Venus', 'Mercury', 'Earth', 'Mars'],
    answer: 1
  },
  {
    question: 'What is the largest planet in our Solar System?',
    options: ['Saturn', 'Neptune', 'Jupiter', 'Uranus'],
    answer: 2
  },
  {
    question: 'Which planet is known as the Red Planet?',
    options: ['Mars', 'Venus', 'Mercury', 'Jupiter'],
    answer: 0
  },
  {
    question: 'What do we call a rock from space that lands on Earth?',
    options: ['A comet', 'A meteorite', 'A star', 'A moon'],
    answer: 1
  },
  {
    question: 'How long does it take Earth to travel once around the Sun?',
    options: ['One day', 'One month', 'One year', 'Ten years'],
    answer: 2
  }
];
```

Keeping questions as **data**, separate from the code that runs the game, means you can change the whole quiz without touching the game logic.

## Step 4: Grab the page elements

Below the questions, add:

```js
const questionEl = document.getElementById('question');
const answersEl = document.getElementById('answers');
const feedbackEl = document.getElementById('feedback');
const nextBtn = document.getElementById('next');
const counterEl = document.getElementById('counter');
const progressBar = document.getElementById('progress-bar');
const questionScreen = document.getElementById('question-screen');
const resultScreen = document.getElementById('result-screen');
const scoreEl = document.getElementById('score');
const messageEl = document.getElementById('message');
const restartBtn = document.getElementById('restart');

let current = 0;
let score = 0;
```

`current` remembers which question we're on, and `score` counts correct answers.

## Step 5: Show a question

```js
function showQuestion() {
  const q = questions[current];
  questionEl.textContent = q.question;
  counterEl.textContent = `Question ${current + 1} of ${questions.length}`;
  progressBar.style.width = `${(current / questions.length) * 100}%`;
  feedbackEl.textContent = '';
  nextBtn.hidden = true;
  answersEl.innerHTML = '';

  q.options.forEach((option, index) => {
    const button = document.createElement('button');
    button.textContent = option;
    button.addEventListener('click', () => checkAnswer(index, button));
    answersEl.append(button);
  });
}
```

- We look up the current question and put its text on the page.
- The counter shows "Question 1 of 5", and the progress bar grows as you go.
- For each option, we create a button. When it's clicked, it calls `checkAnswer` with the option's position.

## Step 6: Check the answer

```js
function checkAnswer(chosen, button) {
  const q = questions[current];
  const buttons = answersEl.querySelectorAll('button');
  buttons.forEach(b => (b.disabled = true));

  if (chosen === q.answer) {
    button.classList.add('correct');
    feedbackEl.textContent = 'Correct! 🎉';
    score++;
  } else {
    button.classList.add('wrong');
    buttons[q.answer].classList.add('correct');
    feedbackEl.textContent = `Not quite. The answer is ${q.options[q.answer]}.`;
  }

  nextBtn.hidden = false;
}
```

- First we **disable** all the buttons so the player can't change their answer or click more than once.
- If the chosen position matches the correct answer, the button turns green and the score goes up.
- If not, it turns red, and we also highlight the correct answer in green so the player learns something.
- Then the **Next** button appears.

## Step 7: Next question and results

```js
nextBtn.addEventListener('click', () => {
  current++;
  if (current < questions.length) {
    showQuestion();
  } else {
    showResults();
  }
});

function showResults() {
  questionScreen.hidden = true;
  resultScreen.hidden = false;
  progressBar.style.width = '100%';
  counterEl.textContent = '';
  scoreEl.textContent = `You scored ${score} out of ${questions.length}.`;

  const percent = (score / questions.length) * 100;
  if (percent === 100) {
    messageEl.textContent = 'Perfect score! You are a space expert! 🚀';
  } else if (percent >= 60) {
    messageEl.textContent = 'Great job! Try again for a perfect score.';
  } else {
    messageEl.textContent = 'Good try! Play again to learn more.';
  }
}

restartBtn.addEventListener('click', () => {
  current = 0;
  score = 0;
  resultScreen.hidden = true;
  questionScreen.hidden = false;
  showQuestion();
});

showQuestion();
```

- Clicking **Next** moves `current` on by one, then shows the next question or, if there are no more, the results.
- `showResults` swaps the screens and picks a message based on the percentage.
- **Play again** resets everything and starts over.
- The last line, `showQuestion()`, starts the game when the page loads.

Open `index.html` in your browser and play your quiz!

## Make it your own

1. **Your own topic:** football, animals, your favourite book, or revision questions for school. Just edit the `questions` array.
2. **Shuffle the questions** so the order changes each game. Add this function and call `shuffle(questions)` before the first `showQuestion()` and when restarting:

```js
function shuffle(list) {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
}
```

3. **Add a timer:** give the player 15 seconds per question using `setInterval`.
4. **Save a high score** with `localStorage`, like we did in the [to-do app](/javascript-to-do-list-app-tutorial/).
5. **Add sound effects** for right and wrong answers with the `Audio` object.

## Fixing problems

Press **F12** and open the **Console** tab to see errors.

- **The page is blank:** check that `quiz.js` is linked just before `</body>` and the file name matches.
- **"Cannot read properties of null":** an `id` in the JavaScript doesn't match the HTML exactly.
- **Wrong answers marked correct:** check the `answer` numbers. Remember, the first option is `0`, not `1`.

## What you learned

- Storing data in an **array of objects**.
- Creating elements and responding to **click events**.
- Using **variables** to track game state (current question and score).
- Showing and hiding parts of the page.
- Updating styles from JavaScript, like the progress bar width.

This pattern of data, state and rendering is used in almost every interactive website. From here, you could build a flashcard app, a personality quiz, or a revision tool for your friends. Our article on [how to revise for exams](/how-to-revise-for-exams-study-tips/) explains why quizzing yourself is such a powerful way to learn.

## Frequently asked questions

**Is a quiz game a good beginner JavaScript project?** Yes. It practises arrays, objects, events and updating the page, all in a small project that's fun to share.

**How do I add more questions?** Add more objects to the `questions` array, following the same pattern. The game automatically adjusts the counter and progress bar.

**Can I put my quiz online?** Yes. It's just HTML, CSS and JavaScript files, so you can publish it for free in the same way as described in our [first website guide](/build-your-first-website-html-css/).

**Why use `textContent` instead of `innerHTML`?** `textContent` treats text as plain text, which is safer and avoids accidentally running code if a question contains special characters.
