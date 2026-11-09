# usage-pace

A Claude Code mod that keeps a quiet two-line band above the prompt showing your weekly usage, and whether you are ahead of or behind a steady pace for the week.

```
SEMAINE  ━━━━━━━━──────────────┃──────  22 % utilisé
▼ 49 % de marge · tu peux en utiliser plus    reset dans 2 j 3 h
```

- The thick part of the bar is what you have used of the seven-day window; the `┃` mark is where a steady pace would put you right now.
- The second line says whether you can use more (blue), are on pace (green), or should slow down (orange, then red), and when the window resets.
- The figures come from the rate-limit windows Claude reports to the session, so they need a Claude subscription. The last reading is kept, so a new conversation shows it at once.

The band is in French. It draws in the terminal and in the Claude desktop app.

## Install

At the prompt of a terminal session:

```
/plugin install usage-pace --marketplace enes_knkn/usage-pace
```

Answer `y` to add the marketplace, then pick a scope (user is the first one).

From a shell:

```
claude plugin install usage-pace --marketplace enes_knkn/usage-pace
```

In the desktop app, where `/plugin` does not run: click + next to the prompt box, then Plugins, Add marketplace with `enes_knkn/usage-pace`, then Add plugin.
