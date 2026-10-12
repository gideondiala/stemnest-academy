---
title: "Train Your First AI Model with Teachable Machine (No Coding Needed)"
description: Teach a computer to recognise rock, paper and scissors using your webcam and Google's free Teachable Machine — and learn how machine learning really works along the way.
date: 2026-10-13
category: Learn by Doing
tags: [ai, machine learning, teachable machine, beginner, kids coding]
emoji: 🤖
level: Beginner
age: 8+
---

Can you teach a computer to see? In this activity you will train a real **machine learning model** that recognises hand shapes for *rock, paper, scissors* — in about 20 minutes, with no coding at all.

You will use **Teachable Machine**, a free tool from Google that runs in your web browser. More importantly, you will discover *how* AI learns, and why it sometimes gets things wrong.

> **What you need:** a laptop or desktop computer with a webcam, and the Chrome or Edge browser. Go to **teachablemachine.withgoogle.com**. No account is needed.

## What is a machine learning model?

Normal programs follow rules a person writes: *"if the score is 10, show 'You win'."* But try writing rules for "this is a picture of a hand making scissors". What exactly makes scissors look like scissors? It's surprisingly hard to put into words.

**Machine learning** flips the idea around. Instead of writing rules, we give the computer lots of **examples** with **labels** (*this is rock, this is paper…*) and it finds the patterns itself. The result is called a **model**. Once trained, the model can make a guess — a **prediction** — about examples it has never seen.

You will do exactly that in three stages: **collect examples → train → test**.

## Step 1: Start an image project

1. Open **teachablemachine.withgoogle.com** and click **Get Started**.
2. Choose **Image Project**, then **Standard image model**.

You will see a row of boxes on the left called **classes**. A class is one category you want the model to recognise. There are two to start with.

## Step 2: Create your classes

1. Click the pencil icon next to **Class 1** and rename it `Rock`.
2. Rename **Class 2** to `Paper`.
3. Click **Add a class** and name it `Scissors`.
4. Add one more class called `Nothing`. This teaches the model what it looks like when *no* hand shape is shown — otherwise it is forced to choose rock, paper or scissors even when you are just sitting there.

## Step 3: Collect training examples

For each class:

1. Click **Webcam** and allow the browser to use your camera.
2. Make the hand shape in front of the camera.
3. Press and **hold** the **Hold to Record** button. It captures many pictures per second.
4. While recording, **move your hand around**: closer, further away, a little left and right, slightly turned. Aim for **150–300 images** per class.

For the **Nothing** class, record your face and background with no hand showing.

**Why move around?** If every "rock" picture shows your fist in exactly the same spot, the model might learn "rock = something in the middle of the screen" instead of learning the shape. Variety helps the model learn what actually matters. This is one of the most important lessons in AI: **a model is only as good as its training data.**

## Step 4: Train the model

Click **Train Model** and wait. Keep the browser tab open while it trains.

During training, the computer looks at every picture over and over and adjusts a huge number of tiny settings inside the model until it is good at telling the classes apart. Each full pass through the pictures is called an **epoch**.

## Step 5: Test it

When training finishes, the **Preview** panel turns on your webcam. Make each hand shape and watch the bars:

- The bars show the model's **confidence** for each class — how sure it is, from 0% to 100%.
- Try all three shapes. Then try something tricky: a half-open hand, two hands, a different background, or a friend's hand.

## Step 6: Investigate the mistakes

Your model will probably make some mistakes. That is not a failure — it is where the real learning happens. Try these experiments:

| Experiment | What you might notice | Why |
|---|---|---|
| Show your hand in a darker room | Confidence drops or guesses go wrong | Training pictures were all taken in bright light |
| Let a friend try | It may work less well for them | The model only saw *your* hand |
| Hold your hand much closer | Mistakes increase | Few training pictures were taken that close |
| Remove the "Nothing" class and retrain | It always picks something, even with no hand | It has no way to say "none of these" |

**How to fix it:** add more varied examples (different light, distances, backgrounds, and other people's hands — with their permission) and train again. This loop of *test → find weaknesses → improve the data → retrain* is exactly what AI engineers do every day.

## Step 7: Make a game with your model

Want to go further? Teachable Machine can **export** your model:

- Click **Export Model** to see the options. You can upload it to get a shareable link, or download it to use in your own code (for example, in a JavaScript website).
- Some free tools for young coders, such as PictoBlox and ML for Kids, let you use AI models inside Scratch-style block coding — so you could build a game where the computer plays rock, paper, scissors against your webcam hand.

## Think about it: AI and fairness

Imagine a company trained a face-recognition model using photos of only one group of people. It might work brilliantly for them and badly for everyone else. That is called **bias**, and it happens when training data does not represent everyone who will use the system.

Your rock, paper, scissors model shows the same thing on a small scale: it works best for the hand it was trained on. Good AI builders always ask:

- *Who is missing from my data?*
- *Who could be treated unfairly if my model is wrong?*

## Is my data safe?

According to Google's Teachable Machine site, the training happens **in your web browser**, and your pictures are not sent to Google's servers unless you choose to save the project to Google Drive or upload the model. Even so:

- Ask an adult before using a webcam for any online tool.
- Do not upload models that contain pictures of other people without their permission.

## What you learned

- What a **machine learning model** is: something that learns patterns from labelled examples.
- The three stages of machine learning: **collect data → train → test**.
- Why **varied, balanced training data** matters.
- What **confidence** means, and why models make mistakes.
- What **bias** is and why fairness matters in AI.

To understand the ideas behind this activity in more depth, read [What is machine learning? Explained for kids and parents](/what-is-machine-learning-explained-for-kids/).

## Frequently asked questions

**Is Teachable Machine free?** Yes. It is free to use in a web browser, and no account is needed.

**Can I train it on sounds or poses?** Yes. Teachable Machine also offers **Audio Projects** (for example, recognising claps and whistles) and **Pose Projects** (recognising body positions).

**Does this count as "real" AI?** Yes. Under the hood it uses a neural network — the same family of technology used in many professional image-recognition systems, just on a smaller scale.

**What age is this activity suitable for?** Children from about 8 can do it with an adult nearby; older children and teenagers can explore the export options and build projects with their models.
