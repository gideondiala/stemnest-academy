---
title: "Minecraft Commands for Beginners: 8 Commands Every Kid Should Try"
description: Learn Minecraft commands with eight easy examples: give items, teleport, change the weather and build in seconds. Works in Java and Bedrock editions.
date: 2026-11-09 09:00
category: Roblox and Minecraft
tags: [minecraft, games, beginner, kids coding, commands]
emoji: ⛏️
level: Beginner
age: 8+
---

What if you could make it stop raining, build a wall in one second or teleport to the top of a mountain? In Minecraft, you can. You just type an instruction called a **command**.

Commands are also a sneaky way to learn how coding works. You give the computer exact instructions, and if you get one small detail wrong, it tells you. That is exactly what programmers do all day.

> **Safety tip for your world:** commands can change a lot of blocks very quickly. Try everything in a brand new test world, so your favourite builds stay safe.

## Step 1: Make a world with cheats on

Commands only work when they are allowed in your world. Create a new **Creative** world and look for this setting:

- **Java Edition:** turn on **Allow Commands** when you create the world. Some versions call it **Allow Cheats**.
- **Bedrock Edition** (Windows, consoles, tablets and phones): turn on **Activate Cheats**, which you will find in the world settings.

In Bedrock, turning cheats on stops you earning achievements in that world, even if you turn them off again later. That is another good reason to use a test world.

## Step 2: Open the chat

Press **T** or **/** on a computer. On a phone or tablet, tap the chat button. On a console, use the chat button on your controller or screen.

Every command starts with a forward slash. Type this and press Enter:

```text
/time set day
```

If the sky turns bright, you have just run your first command.

## How a command is built

Most commands follow the same pattern: an action, then who or what it affects, then the details.

![The command /give @s diamond 5 split into four parts: the action give, the target @s meaning me, the item diamond, and the amount 5](/diagram-minecraft-command.svg)

The `@s` part is called a **target selector**. It tells Minecraft who you mean, so you do not need to type a name:

| Selector | Who it means |
|---|---|
| `@s` | Yourself |
| `@p` | The nearest player |
| `@a` | All players |
| `@r` | A random player |
| `@e` | Everything, including animals and monsters |

Be careful with `@e`. If you use it with a command that removes things, it really does mean everything, and that includes you.

## 8 commands to try

### 1. Change the time

```text
/time set night
```

Swap `night` for `day`. Now you can see your builds at sunset, or skip the dark altogether.

### 2. Change the weather

```text
/weather clear
```

Try `rain` and `thunder` too.

### 3. Give yourself items

```text
/give @s diamond 5
```

This puts five diamonds in your inventory. Change `diamond` to `apple` or `oak_planks`. Item names use underscores where you would expect a space, so `golden_apple` works and `golden apple` does not.

### 4. Teleport

```text
/tp @s ~ ~20 ~
```

This lifts you 20 blocks straight up. If you are in Survival, you will fall, so try this one in Creative!

The three numbers are **coordinates**, which are positions in the world, written in the order x, y and z. The `~` symbol means "from where I am now". So `~ ~20 ~` means "same x, 20 higher, same z". Coordinates like this are also how maths and game design work, which makes them worth learning.

### 5. Summon an animal

```text
/summon sheep
```

A sheep appears next to you. Try `cow`, `chicken` or `parrot`. Stick to friendly mobs in a world you care about!

### 6. Place one block

```text
/setblock ~2 ~ ~ gold_block
```

A gold block appears two blocks away from you.

### 7. Build a wall in one second

```text
/fill ~2 ~ ~ ~2 ~4 ~10 stone
```

This is the moment most children gasp. `/fill` needs two corners. Minecraft then fills everything between them. The first corner is `~2 ~ ~`, and the second is `~2 ~4 ~10`, so you get a wall 5 blocks high and 11 blocks long.

Check the numbers before you press Enter. Large fills can replace your builds, and there is no undo button.

### 8. Make a hollow house

```text
/fill ~3 ~ ~3 ~9 ~5 ~9 oak_planks hollow
```

The word `hollow` fills only the outside and leaves the inside empty. You now have a wooden box to turn into a house. Use `/setblock` to knock a door in it.

## Common mistakes

| Problem | How to fix it |
|---|---|
| "Unknown command" or a red message | Check the spelling, and check for a missing `/` |
| It says you do not have permission | Cheats are off in this world, or you are on someone else's server |
| Nothing happens with an item | Use underscores, for example `oak_planks` |
| You got stuck in a wall | Use `/tp @s ~ ~5 ~` to move up and out |
| A big `/fill` was refused | The area is too large. Try fewer blocks at a time |

Do you notice what you are doing when you fix these? You are **debugging**, and it is one of the most useful skills in all of coding. You can learn more in [How to Debug Code](/how-to-debug-code-tips-for-beginners/).

## Bonus: command blocks

Typing is great, but what if a command could run by itself? That is what a **command block** does. It stores a command and runs it when it gets power.

In a Creative world with cheats on, type:

```text
/give @p command_block
```

Place the block, open it, type a command such as `time set day`, then put a button on it. Press the button, and the command runs.

This is one step away from real programming, because you are storing instructions to run later. Next, connect it with wires using our [Minecraft redstone guide](/minecraft-redstone-for-beginners/).

## Challenges to try next

1. Build a small house using only commands.
2. Make a button that turns night into day.
3. Use `/fill` to make a swimming pool, then fill it with `water`.
4. Write down your five favourite commands in a notebook. Real coders keep notes too.

## Frequently asked questions

**Do commands work in Survival?** Yes, if cheats are on for that world. Many players keep Survival cheat-free and use a separate Creative world for experiments.

**Do commands work on phones and consoles?** Yes. Bedrock Edition supports commands on phones, tablets and consoles, as long as cheats are on.

**Are Java and Bedrock commands the same?** The commands in this guide work in both, but some advanced commands differ. If one fails, the in-game hints show what your edition expects.

**Is using commands cheating?** In your own Creative world, no. It is a way to build and test ideas. Just keep to the rules on any server or shared world.

**Is this real coding?** It is a great first step. You are writing exact instructions, using coordinates and fixing errors. To go further, try [Roblox scripting](/roblox-scripting-for-beginners/) or [Python projects](/python-projects-for-beginners/).
