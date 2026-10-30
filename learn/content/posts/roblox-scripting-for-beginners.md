---
title: "Roblox Scripting for Beginners: Learn Lua with 5 Small Projects"
description: Learn Roblox scripting with five small projects: a colour-changing brick, a disappearing floor, a speed pad and more. Lua basics explained for beginners.
date: 2026-11-06 09:00
category: Roblox and Minecraft
tags: [roblox, lua, games, beginner, kids coding]
emoji: 📜
level: Beginner
age: 10+
---

Placing bricks in Roblox Studio is fun, but scripts are what make a game feel alive. A script can make a floor vanish, a door open or a player run at double speed. If you have ever looked at Roblox code and thought "I could never do that", this guide is for you.

You will learn the basics of **Lua** by building five small projects. Each one is only a few lines long, and each one teaches one new idea.

> **Before you start:** you need Roblox Studio on a Windows PC or Mac. If you have never used it, follow [How to Make a Roblox Game](/how-to-make-a-roblox-game-for-beginners/) first, at least up to Step 3. You can do all of this privately. Nobody else needs to see your game.

## Where scripts live

Open a **Baseplate** project and make sure the **Explorer** and **Output** windows are showing. You can open both from the **View** tab.

To add a script to a part:

1. Add a part from the **Home** tab and tick **Anchored** in Properties.
2. In the Explorer, hover over the part and click the **+** button.
3. Choose **Script**.

A script that sits inside a part can reach that part using `script.Parent`, which means "the thing I am inside". You will use that in almost every project here.

Roblox uses **Luau**, its own version of Lua. Most guides, including this one, simply call it Lua.

## Project 1: Say hello

The new script already contains a line like this. Delete anything in the script and type:

```lua
print("Hello from my script!")
```

Press **Play** and look in the **Output** window. You should see your message.

`print` shows text in the Output window. Players never see it, so it is a tool for you. When something goes wrong, adding a `print` is often the fastest way to find out how far your code got.

## Project 2: A colour-changing brick

Now for the first thing you can actually see. Replace your code with this:

```lua
local part = script.Parent

while true do
	part.BrickColor = BrickColor.random()
	task.wait(1)
end
```

Press Play. The brick changes colour every second.

Two new ideas are hiding in there:

- **`local part = script.Parent`** makes a **variable**, a name that stores something so you can use it later.
- **`while true do ... end`** is a **loop**. It repeats the code between `do` and `end` forever.

`task.wait(1)` pauses for one second. Never leave the wait out of a forever loop. Without it, the loop never gives Roblox a chance to do anything else, and your game can freeze.

**Try this:** change the `1` to `0.2` for a party brick, or to `5` for a slow change.

## Project 3: A disappearing floor

This one is a favourite in obby games. The floor is there, then it fades away, then it comes back.

```lua
local part = script.Parent

while true do
	task.wait(2)
	part.Transparency = 0.8
	part.CanCollide = false
	task.wait(2)
	part.Transparency = 0
	part.CanCollide = true
end
```

Here is what the two properties do:

- **`Transparency`** controls how see-through a part is. `0` is solid and `1` is invisible.
- **`CanCollide`** decides whether players can stand on it. When it is `false`, they fall straight through.

These are the same settings you can see in the **Properties** window. Scripts can change almost any property while the game runs, and that one idea unlocks a huge amount of Roblox.

## Project 4: A speed pad

So far our scripts have run by themselves. Now the game will react to a player. Add a new flat part, anchor it, colour it green and add a script:

```lua
local pad = script.Parent

local function onTouch(hit)
	local humanoid = hit.Parent:FindFirstChild("Humanoid")
	if humanoid then
		humanoid.WalkSpeed = 40
	end
end

pad.Touched:Connect(onTouch)
```

Step on the pad and your character shoots off. A normal Roblox character has a `WalkSpeed` of 16, so 40 is very fast.

There are three new ideas here:

- **A function** is a named set of instructions. `onTouch` does nothing until something runs it.
- **An event** is something that happens in the game. `Touched` happens when something bumps into the part.
- **`Connect`** joins them together: "when the pad is touched, run `onTouch`".

The word `hit` is the thing that touched the pad, such as your character's foot. A foot sits inside the character, so `hit.Parent` is the whole character. The character contains a **Humanoid**, which holds its health and speed.

The line `if humanoid then` matters. Other parts can touch the pad too, and they have no Humanoid. Without the check, your script would throw an error when one landed on it.

**Try this:** make a red slow pad with a speed of `6`, then put a slow pad and a fast pad next to each other on your course.

## Project 5: A door that opens, then shuts

This last project combines everything so far. Make a tall thin part for a door, anchor it, and add this script:

```lua
local door = script.Parent
local isOpen = false

local function onTouch(hit)
	local humanoid = hit.Parent:FindFirstChild("Humanoid")
	if humanoid and not isOpen then
		isOpen = true
		door.Transparency = 0.7
		door.CanCollide = false
		task.wait(3)
		door.Transparency = 0
		door.CanCollide = true
		isOpen = false
	end
end

door.Touched:Connect(onTouch)
```

Walk into the door. It lets you through, then closes three seconds later.

Why do we need `isOpen`? A walking character touches a part many times a second. Without that check, the code would start again and again while the door is already open, and it would act strangely. Using a true or false variable to stop this is called a **debounce**, and you will meet it in nearly every real Roblox game.

## When your script does not work

Everyone hits errors, and the Output window is your best friend. Red text tells you the script name and the line number of the problem.

| What you see | What it usually means |
|---|---|
| Nothing happens at all | The script is not inside the part, or the part name is wrong |
| Red error mentioning `nil` | Your code looked for something that is not there, often a spelling mistake |
| The part falls through the floor | You forgot to tick **Anchored** |
| Studio freezes | A `while true do` loop has no `task.wait()` |
| An `Expected 'end'` error | A `function`, `if` or `while` is missing its `end` |

Lua cares about capital letters, so `WalkSpeed` works and `walkspeed` does not. For more ways to track down problems, read [How to Debug Code](/how-to-debug-code-tips-for-beginners/).

## Challenges to try next

1. Make the disappearing floor change colour just before it vanishes.
2. Make a speed pad that resets your speed to 16 after five seconds.
3. Build a door that only opens after you stand on a pad somewhere else. (Hint: one script can reach another part through `workspace`.)
4. Add the [coins and leaderboard from our obby tutorial](/how-to-make-a-roblox-game-for-beginners/).

## What you learned

- `print` shows messages in the Output window
- Variables store things you want to use later
- Loops repeat code, and forever loops need a wait
- Properties such as `Transparency` can change while the game runs
- Events and functions let your game react to players
- A debounce stops code running too many times

## Frequently asked questions

**Is Lua hard to learn?** Lua is one of the friendlier languages for beginners because it uses plain words such as `then`, `end` and `not`. Many children start at around 10, and younger coders can often manage with some help.

**Do I need to know another language first?** No. Lua works well as a first text language. If your child has already used Scratch, ideas such as loops, events and variables will feel familiar.

**Does Roblox coding work outside Roblox?** The Roblox parts, such as `Humanoid`, only work there. The ideas transfer to every language, including [Python](/python-projects-for-beginners/).

**Can I script on a phone or tablet?** Not in Roblox Studio, which runs on Windows and Mac computers.
