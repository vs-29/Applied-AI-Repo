"""Milestone 5: draw the charts used in README.md.

Reads the loss histories in runs/ and writes three PNGs into docs/:
  loss_curves.png      validation loss of every model we built, over training
  m3_overfitting.png   train vs validation loss for the final transformer
  tokenizers.png       characters per token for each tokenizer (from bpe.py)

Run:  python plot_losses.py
"""
import json
import math

import matplotlib
matplotlib.use("Agg")              # draw to files, no window needed
import matplotlib.pyplot as plt

# Colours: a colour-blind-safe categorical palette; same model = same colour everywhere.
BLUE, ORANGE, AQUA = "#2a78d6", "#eb6834", "#1baf7a"
INK, MUTED, GRID = "#141a26", "#6b7280", "#e5e7eb"
RANDOM_GUESS = math.log(65)        # loss of uniform guessing over 65 characters = 4.17

plt.rcParams.update({
    "figure.dpi": 150, "font.size": 10, "axes.edgecolor": GRID, "axes.labelcolor": INK,
    "xtick.color": MUTED, "ytick.color": MUTED, "axes.spines.top": False,
    "axes.spines.right": False, "axes.grid": True, "grid.color": GRID, "grid.linewidth": 0.8,
    "axes.axisbelow": True, "lines.linewidth": 2, "legend.frameon": False,
})

with open("runs/m1_m2_losses.json") as f:
    early = json.load(f)
with open("runs/m3_losses.json") as f:
    m3 = json.load(f)
m3_steps = [r["step"] for r in m3]


def end_label(ax, x, y, text, color, dy=0):
    ax.plot(x, y, "o", color=color, markersize=6, markeredgecolor="white", markeredgewidth=1.5)
    ax.annotate(text, (x, y), xytext=(8, dy), textcoords="offset points",
                va="center", fontsize=9, color=INK)


# ---- Chart 1: every model's validation loss ----
fig, ax = plt.subplots(figsize=(8, 4.5))
series = [
    ("M1 bigram", early["bigram"]["step"], early["bigram"]["val"], BLUE, 6),
    ("M2 attention, 4 heads", early["attention_4_heads"]["step"], early["attention_4_heads"]["val"], ORANGE, 0),
    ("M3 transformer", m3_steps, [r["val"] for r in m3], AQUA, 0),
]
for name, x, y, c, dy in series:
    ax.plot(x, y, color=c, label=name)
    end_label(ax, x[-1], y[-1], f"{y[-1]:.2f}", c, dy)
ax.axhline(RANDOM_GUESS, color=MUTED, linestyle="--", linewidth=1)
ax.text(5000, RANDOM_GUESS + 0.06, "random guessing (4.17)", ha="right", va="bottom", fontsize=8, color=MUTED)
ax.set(xlabel="training step", ylabel="validation loss (lower is better)", xlim=(0, 5400), ylim=(1.2, 4.9))
ax.set_title("Each milestone learned better than the last", loc="left", fontsize=12, color=INK)
ax.legend(loc="upper right", bbox_to_anchor=(1, 0.8))
fig.tight_layout()
fig.savefig("docs/loss_curves.png")
plt.close(fig)

# ---- Chart 2: train vs val for M3, showing the start of overfitting ----
fig, ax = plt.subplots(figsize=(8, 4))
# Skip step 0 (loss 4.3): it would squash the interesting part of the chart.
m3_steps = m3_steps[1:]
tr, va = [r["train"] for r in m3[1:]], [r["val"] for r in m3[1:]]
ax.plot(m3_steps, tr, color=BLUE, label="train (text it learns from)")
ax.plot(m3_steps, va, color=ORANGE, label="validation (text it never sees)")
ax.fill_between(m3_steps, tr, va, color=ORANGE, alpha=0.12, linewidth=0)
end_label(ax, m3_steps[-1], tr[-1], f"{tr[-1]:.2f}", BLUE)
end_label(ax, m3_steps[-1], va[-1], f"{va[-1]:.2f}", ORANGE)
ax.annotate("gap = memorising, not learning", xy=(4250, (tr[-4] + va[-4]) / 2), xytext=(2600, 2.2),
            fontsize=9, color=INK, arrowprops=dict(arrowstyle="->", color=MUTED))
ax.set(xlabel="training step", ylabel="loss", xlim=(0, 5500), ylim=(1.1, 2.5))
ax.set_title("M3 transformer: train vs validation loss (from step 250)", loc="left", fontsize=12, color=INK)
ax.legend(loc="upper right")
fig.tight_layout()
fig.savefig("docs/m3_overfitting.png")
plt.close(fig)

# ---- Chart 3: tokenizer compression ----
with open("runs/m4_comparison.json") as f:
    toks = json.load(f)
val_chars = toks[0]["tokens"]                     # char-level: one token per character
names = [t["tokenizer"] for t in toks]
cpt = [val_chars / t["tokens"] for t in toks]
fig, ax = plt.subplots(figsize=(8, 3.2))
bars = ax.barh(names[::-1], cpt[::-1], color=BLUE, height=0.6)
for b, v, t in zip(bars, cpt[::-1], toks[::-1]):
    ax.text(v + 0.05, b.get_y() + b.get_height() / 2, f"{v:.2f}  (vocab {t['vocab']:,})",
            va="center", fontsize=9, color=INK)
ax.set(xlabel="characters per token (higher = text packs into fewer tokens)", xlim=(0, 4.6))
ax.grid(axis="y", visible=False)
ax.set_title("How much text fits in one token", loc="left", fontsize=12, color=INK)
fig.tight_layout()
fig.savefig("docs/tokenizers.png")
plt.close(fig)

print("wrote docs/loss_curves.png, docs/m3_overfitting.png, docs/tokenizers.png")
