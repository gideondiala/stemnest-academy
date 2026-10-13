---
title: "How to Make Your First Phone App for Free with MIT App Inventor"
description: Make your first phone app for free with MIT App Inventor. Build a talking app and a tap game step by step, then test it on your own phone.
date: 2026-10-14
category: Learn by Doing
tags: [apps, app inventor, beginner, kids coding, mobile]
emoji: 📱
level: Beginner
age: 10+
---

Lots of young people dream of making their own app. The surprise is how quickly you can actually do it. With **MIT App Inventor**, a free tool from the Massachusetts Institute of Technology, you design the screen by dragging buttons and pictures into place, and you program it with colourful blocks, a lot like Scratch.

In this guide you'll build two apps: **Talk To Me**, which speaks whatever you type, and **Tap Attack**, a simple game where you tap as fast as you can before the timer runs out. Then you'll run them on a real phone.

> **What you need:** a computer with the Chrome browser, a Google account to sign in (ask a parent if you're young), and ideally an Android phone or tablet for testing. iPhone users can also test with the MIT AI2 Companion app from the App Store, although a few features work differently on iOS. Go to **ai2.appinventor.mit.edu** to start.

## How App Inventor works

App Inventor has two main views, and you'll switch between them all the time:

- **Designer:** where you build what the app *looks like*. You drag **components** such as buttons, labels, text boxes and images onto a phone-shaped screen.
- **Blocks:** where you program what the app *does*. You snap blocks together, like in Scratch, to say what happens when someone taps a button.

There's a button for each view at the top right of the page.

## App 1: Talk To Me

### Step 1: Start a project

1. Sign in at **ai2.appinventor.mit.edu**.
2. Click **Projects → Start new project**.
3. Name it `TalkToMe` (no spaces allowed) and click **OK**.

You'll see the Designer, with a blank phone screen called **Screen1** in the middle.

### Step 2: Design the screen

From the **Palette** on the left:

1. Drag a **TextBox** (in the User Interface section) onto the screen.
2. Drag a **Button** underneath it.
3. Open the **Media** section and drag a **TextToSpeech** component onto the screen. It's **non-visible**, so it appears below the phone rather than on it. That's normal: it's a hidden helper that speaks.

Now use the **Properties** panel on the right to tidy things up:

- Select **TextBox1**: set **Hint** to `Type something to say`, and **Width** to **Fill parent** so it stretches across the screen.
- Select **Button1**: change **Text** to `Speak!`, and set **Width** to **Fill parent**. Change **BackgroundColor** to something bright.

### Step 3: Program it

Click **Blocks**. On the left you'll see the components you added.

1. Click **Button1** and drag out the block **when Button1.Click do**.
2. Click **TextToSpeech1** and drag **call TextToSpeech1.Speak message** into the gap inside the Click block.
3. Click **TextBox1** and drag the **TextBox1.Text** block (the light green one) into the **message** socket.

Your program reads like a sentence:

> **when** Button1 is clicked, **call** TextToSpeech1 to **speak** the text in TextBox1.

That's the whole app. Three blocks.

### Step 4: Test it on your phone

1. On your Android phone, install **MIT AI2 Companion** from the Google Play Store.
2. On your computer, click **Connect → AI Companion**. A QR code appears.
3. Open the Companion app on your phone and scan the code (or type the six-letter code).

Your app appears on the phone. Type something, tap **Speak!**, and your phone talks. Make sure the phone volume is up.

The best part: while connected, any change you make on the computer appears on the phone almost instantly. Change the button colour and watch it update.

> **Phone and computer must be on the same Wi-Fi network** for the Companion to connect. If it doesn't work, App Inventor also has an Android emulator you can install on your computer.

## App 2: Tap Attack (a mini game)

Now something with a score, a timer and a game over screen.

### Step 1: Design

Start a new project called `TapAttack`. Add:

1. A **Label** at the top. Set its **Text** to `Score: 0`, **FontSize** to `30`, and **Width** to **Fill parent**. In the Components panel, click **Rename** and call it `ScoreLabel`.
2. A second **Label** called `TimeLabel` with the text `Time: 10`.
3. A big **Button** called `TapButton`. Set **Text** to `TAP!`, **Width** and **Height** to **Fill parent**, **FontSize** to `40`.
4. A **Button** called `StartButton` with the text `Start`.
5. From the **Sensors** section, a **Clock**. It's non-visible. In its Properties, **untick TimerEnabled** and make sure **TimerInterval** is `1000` (that's 1000 milliseconds, or one second).

Renaming components is a habit worth starting now. `TapButton` is much easier to find in your blocks than `Button3`.

### Step 2: Make variables

Click **Blocks**. Open **Variables** and drag out **initialize global name to** twice:

- Rename the first to `score` and attach a **0** from the **Math** drawer.
- Rename the second to `timeLeft` and attach a **0** as well.

### Step 3: Start the game

```text
when StartButton.Click
    set global score to 0
    set global timeLeft to 10
    set ScoreLabel.Text to join "Score: " get global score
    set TimeLabel.Text to join "Time: " get global timeLeft
    set Clock1.TimerEnabled to true
    set TapButton.Enabled to true
```

You'll find **join** in the **Text** drawer, and **true** in the **Logic** drawer. The `set ... to` blocks are in each component's drawer.

### Step 4: Count the taps

```text
when TapButton.Click
    set global score to (get global score + 1)
    set ScoreLabel.Text to join "Score: " get global score
```

The **+** block is in the **Math** drawer.

### Step 5: Count down with the clock

```text
when Clock1.Timer
    set global timeLeft to (get global timeLeft - 1)
    set TimeLabel.Text to join "Time: " get global timeLeft
    if get global timeLeft = 0
        set Clock1.TimerEnabled to false
        set TapButton.Enabled to false
        set TimeLabel.Text to "Time's up!"
```

The **Clock1.Timer** event fires every second while the timer is enabled. When the time reaches zero, we stop the clock and switch off the tap button so no more points can be scored. You'll find **if** in the **Control** drawer and **=** in the **Math** drawer.

Finally, select **TapButton** in the Designer and untick **Enabled**, so nobody can tap before pressing Start.

Connect your phone and play. How many taps can you get in ten seconds?

### Make it better

- **High score:** add a `highScore` variable, and when time is up, check if the score beats it.
- **Save the high score:** add a **TinyDB** component (in the Storage section) to remember it even after the app closes.
- **Sound:** add a **Sound** component and play a click on each tap.
- **Vibrate:** the Sound component also has a **Vibrate** block for a little buzz on each tap.

## Installing your app properly

The Companion is great for testing. To install your app on a phone like a normal app:

1. Click **Build → Android App (.apk)**.
2. App Inventor shows a QR code. Scan it with your phone to download the app file.
3. Your phone may ask for permission to install apps from unknown sources. Ask a parent before changing this setting, and only install files you built yourself.

You can also share the `.apk` file with family members so they can try your app.

## Tips for App Inventor beginners

- **Save often.** App Inventor saves automatically, but use **Projects → Save project** after big changes too.
- **Right-click blocks** for options like duplicate and add comment.
- **Warnings and errors** show as yellow and red triangles at the bottom-left of the Blocks view. Click them to jump to the problem.
- **Explore the tutorials** on the App Inventor website. There are dozens of projects, from drawing apps to quizzes.

## What you learned

- Building an interface with **components** and **properties**.
- **Events** like button clicks and timers.
- **Variables** for score and time.
- **Conditions** for game over.
- Testing on a **real device**.

These are the same building blocks used in professional app development. When you're ready for typed code, the ideas carry straight over to languages like Swift (for iPhone), Kotlin or Java (for Android), or JavaScript with React Native. Our guide to the [best programming languages for kids](/best-programming-languages-for-kids/) can help you choose.

## Frequently asked questions

**Is MIT App Inventor free?** Yes. It's completely free and runs in a web browser.

**Can I make iPhone apps with App Inventor?** You can test many App Inventor apps on an iPhone with the MIT AI2 Companion app, but building and installing iPhone apps works differently from Android, and some features aren't available on iOS.

**Do I need to know how to code?** No. App Inventor uses blocks, so it's suitable for complete beginners. If you've used Scratch, it will feel very familiar.

**Can I put my App Inventor app on the Google Play Store?** It's possible, but publishing on app stores involves developer accounts, fees and age requirements. For young makers, sharing with family and friends is the perfect start.
