---
title: "How to Make a Roblox Game: A Beginner's Guide to Roblox Studio and Lua"
description: Make your first Roblox obby in Roblox Studio: platforms, kill bricks, spinning bars, coins and checkpoints with simple Lua scripts. A beginner guide.
date: 2026-10-14
category: Learn by Doing
tags: [roblox, lua, games, beginner, kids coding]
emoji: 🧱
level: Beginner
age: 10+
---

Millions of children play Roblox every day. Far fewer realise they can **make** Roblox games themselves, with the same free tool the professional Roblox developers use. And the programming language behind it, **Lua**, is one of the friendliest languages to start with.

In this guide you'll build an **obby** (an obstacle course), which is the classic first Roblox game. You'll place platforms, write your first scripts to create a lava "kill brick", a spinning obstacle and collectable coins, and then test your game.

> **What you need:** a Windows PC or Mac (Roblox Studio isn't available on phones, tablets or Chromebooks), a free Roblox account, and **Roblox Studio**, which you can download free from the Roblox website. Young players should set this up with a parent. Roblox has parental controls in account settings, and it's worth looking at them together.

## Step 1: Open Roblox Studio and pick a template

1. Open Roblox Studio and log in.
2. Click **New** and choose the **Baseplate** template. You'll get a big flat grey floor and a spawn point.

Take a moment to find the important windows. If any are missing, open them from the **View** tab:

- **Explorer:** a list of everything in your game, like a family tree.
- **Properties:** the settings for whatever you have selected, such as colour, size and whether it's anchored.
- **Toolbox:** free models and assets.
- **Output:** where messages and errors from your scripts appear. Keep this open.

To move the camera, hold the **right mouse button** and use **W, A, S, D**. Scroll to zoom.

## Step 2: Build the course

An obby is a series of platforms the player jumps between.

1. On the **Home** tab, click **Part**. A grey block appears.
2. Use the **Scale** tool to make it into a flat platform and the **Move** tool to position it in the air.
3. In the **Properties** window, tick **Anchored**. This is the most important step. Anchored parts stay where you put them; unanchored parts fall when the game starts.
4. Change **BrickColor** or **Color** to make it bright.
5. Duplicate the platform with **Ctrl + D** (or **Cmd + D** on a Mac), move it further away and a little higher, and repeat to make a path.

Leave gaps the player can jump. A normal Roblox character can jump a bit more than its own height and roughly ten studs across, so start with small gaps and test.

**Tip:** rename your parts in the Explorer (double-click the name) so you can find them later, for example `Platform1`, `Platform2`.

## Step 3: Test your game

Click **Play** on the Home tab. Your character appears at the spawn point and you can try your course. Press **Stop** to return to editing.

Test after every few changes. It's much easier to fix one platform that's too far away than to find the problem in a course of fifty.

## Step 4: Your first script, a lava kill brick

Kill bricks are parts that send the player back to the start when touched. They're in almost every obby.

1. Add a new part, make it a thin flat strip, anchor it, and colour it bright red or orange. Name it `Lava`.
2. In the **Explorer**, hover over `Lava`, click the **+** button and choose **Script**.

A script window opens with `print("Hello world!")` in it. Delete that line and type:

```lua
local lava = script.Parent

lava.Touched:Connect(function(hit)
	local humanoid = hit.Parent:FindFirstChild("Humanoid")
	if humanoid then
		humanoid.Health = 0
	end
end)
```

Click **Play** and walk onto the lava. Your character breaks apart and respawns at the start.

**What each line means:**

- `script.Parent` is the thing the script is inside, the lava part. We store it in a **variable** called `lava`.
- `lava.Touched:Connect(...)` says "whenever something touches the lava, run this function". This is an **event**, like Scratch's `when this sprite clicked`.
- `hit` is the part that touched the lava, for example a player's foot.
- A player's foot belongs to their character model, and every character has a **Humanoid** inside it. `hit.Parent:FindFirstChild("Humanoid")` looks for one.
- If there is a Humanoid, a player touched the lava, so we set their health to 0.

The `if humanoid then` check matters. Without it, the script would crash when anything that isn't a player, such as a falling block, touched the lava.

**Make more lava fast:** once one lava part works, duplicate it. The script is copied too.

## Step 5: A spinning obstacle

1. Add a long, thin part to be a spinning bar, position it over a platform at about knee height, and **anchor** it.
2. Add a **Script** inside it:

```lua
local bar = script.Parent

while true do
	bar.CFrame = bar.CFrame * CFrame.Angles(0, math.rad(2), 0)
	task.wait()
end
```

- `while true do` repeats forever, just like Scratch's `forever` block.
- `CFrame` holds a part's position and rotation. Multiplying it by `CFrame.Angles(0, math.rad(2), 0)` turns the bar two degrees around its vertical axis.
- `task.wait()` pauses for one frame so the loop doesn't freeze the game.

Want it to knock players out? Put the kill brick code from Step 4 in a second script inside the same bar. Want it faster? Change `2` to `4`.

## Step 6: Collectable coins and a leaderboard

Let's give players a reason to explore.

**First, the leaderboard.** In the Explorer, find **ServerScriptService**, click **+** and add a **Script**:

```lua
game.Players.PlayerAdded:Connect(function(player)
	local leaderstats = Instance.new("Folder")
	leaderstats.Name = "leaderstats"
	leaderstats.Parent = player

	local coins = Instance.new("IntValue")
	coins.Name = "Coins"
	coins.Value = 0
	coins.Parent = leaderstats
end)
```

When a player joins, this creates a folder called `leaderstats` inside them with a number called `Coins`. Roblox has a special rule: anything inside a folder named exactly `leaderstats` shows up on the leaderboard in the top-right corner. The spelling must be exact, all lower case.

**Now the coin.** Add a small part, shape it like a coin (try **Cylinder** from the Part menu), make it gold, anchor it, and untick **CanCollide** so players can walk through it. Add a script inside it:

```lua
local coin = script.Parent

coin.Touched:Connect(function(hit)
	local player = game.Players:GetPlayerFromCharacter(hit.Parent)
	if player then
		player.leaderstats.Coins.Value += 1
		coin:Destroy()
	end
end)
```

`GetPlayerFromCharacter` checks whether the thing that touched the coin is a player's character. If it is, we add one coin to their score and `Destroy()` removes the coin so it can't be collected twice.

Duplicate coins along your course, especially in tricky or hidden spots.

## Step 7: Checkpoints

Long obbies need checkpoints so players don't restart from the very beginning.

1. On the **Model** tab, insert a **SpawnLocation** partway through the course and anchor it. Make sure **Neutral** is ticked in its Properties.
2. Add a **Script** inside it:

```lua
local checkpoint = script.Parent

checkpoint.Touched:Connect(function(hit)
	local player = game.Players:GetPlayerFromCharacter(hit.Parent)
	if player then
		player.RespawnLocation = checkpoint
	end
end)
```

Every player has a `RespawnLocation`, which is where they come back after falling or touching lava. This script sets it to the checkpoint the moment they step on it. Test it by touching the checkpoint and then jumping into lava. You should reappear at the checkpoint, not the start.

Add one checkpoint every few obstacles, so players feel progress without the course becoming too easy.

## Step 8: Finishing touches

- **A winning platform:** put a big platform at the end with a sign, or a part that shows a message when touched.
- **Lighting:** select **Lighting** in the Explorer and change `ClockTime` to make it sunset or night.
- **Difficulty curve:** start easy and get harder. The first few jumps should be simple so new players don't give up straight away.

## Publishing your game

When you're happy with it:

1. **File → Publish to Roblox.** Give it a name and description.
2. By default, new games are private while you work on them. You can choose who can play in **Game Settings**.

Before making a game public, talk it through with a parent. Think about the name and description, and never include personal information in your game.

## Debugging tips

- **Read the Output window.** Errors appear in red and tell you the script and line number.
- **Capital letters matter.** Lua is case-sensitive: `Humanoid` works, `humanoid` (when looking for the object name) doesn't.
- **Check Anchored.** If parts fall or drift when you press Play, they aren't anchored.
- **Use print.** Add `print("touched!")` inside a function to check it's running.

## Is Roblox a good way to learn coding?

Yes, with a caveat. Lua is a real programming language with variables, loops, functions and events, and building something you can play with friends is hugely motivating. The skills transfer well: the ideas in this guide appear in Python, JavaScript and every other language.

The caveat is that Roblox scripting teaches Roblox's way of doing things, and many concepts are specific to the platform. That's why many young coders do Roblox alongside a general language like Python. If you're weighing up options, our guide to the [best programming languages for kids](/best-programming-languages-for-kids/) compares them.

## Frequently asked questions

**Is Roblox Studio free?** Yes. Roblox Studio is free to download and use on Windows and Mac.

**What programming language does Roblox use?** Roblox uses **Luau**, a version of the Lua language developed by Roblox. Beginners usually just call it Lua.

**What age can kids start making Roblox games?** Many children start around 10, once they're comfortable using a mouse and keyboard and reading instructions. Younger children can build without scripts and add code with help.

**Can you make money from Roblox games?** Some developers earn money through Roblox's systems, but most games don't, and there are age requirements and rules for earning. Focus on learning and making something fun first.
