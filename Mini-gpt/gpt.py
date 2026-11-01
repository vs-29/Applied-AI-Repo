"""Milestone 3: a full (small) GPT.

Builds on milestone 2 (attention). New pieces, each marked "NEW" below:
  1. FeedForward  - after attention gathers info, each token "thinks" about it alone
  2. Residual     - x = x + layer(x): each layer adds a correction instead of replacing x
  3. LayerNorm    - keeps numbers in a stable range as they pass through many layers
  4. Block        - attention + feed-forward, wrapped in residual + LayerNorm
  5. Dropout      - randomly zeroes some values during training to reduce memorising
  6. Stack n_layer Blocks, and scale up the context and width

Run:  python gpt.py               (full run, a few minutes on an RTX 3050)
      python gpt.py --iters 500   (quick smoke test)
"""
import argparse
import json
import os
import time

import torch
import torch.nn as nn
from torch.nn import functional as F

parser = argparse.ArgumentParser()
parser.add_argument("--iters", type=int, default=5000)
args = parser.parse_args()

# ---- hyperparameters (sized for a 4 GB laptop GPU) ----
batch_size = 32
block_size = 128        # context: was 8, now the model can look 128 characters back
max_iters = args.iters
eval_interval = 250
eval_iters = 100
learning_rate = 1e-3
n_embd = 192            # width of each token's vector (was 32)
n_head = 6              # 6 heads x 32 dims = 192
n_layer = 4             # NEW: how many Blocks are stacked
dropout = 0.1           # NEW
device = "cuda" if torch.cuda.is_available() else "cpu"
torch.manual_seed(1337)
torch.set_float32_matmul_precision("high")  # allow faster TF32 maths on RTX GPUs

# ---- data (identical to bigram.py) ----
with open("data/input.txt", encoding="utf-8") as f:
    text = f.read()
chars = sorted(set(text))
vocab_size = len(chars)
stoi = {ch: i for i, ch in enumerate(chars)}
itos = {i: ch for i, ch in enumerate(chars)}
encode = lambda s: [stoi[c] for c in s]
decode = lambda ids: "".join(itos[i] for i in ids)
data = torch.tensor(encode(text), dtype=torch.long)
n = int(0.9 * len(data))
train_data, val_data = data[:n], data[n:]


def get_batch(split):
    d = train_data if split == "train" else val_data
    ix = torch.randint(len(d) - block_size, (batch_size,))
    x = torch.stack([d[i : i + block_size] for i in ix])
    y = torch.stack([d[i + 1 : i + block_size + 1] for i in ix])
    return x.to(device), y.to(device)


@torch.no_grad()
def estimate_loss(model):
    out = {}
    model.eval()   # turns dropout OFF so evaluation is deterministic
    for split in ("train", "val"):
        losses = torch.zeros(eval_iters)
        for k in range(eval_iters):
            X, Y = get_batch(split)
            _, loss = model(X, Y)
            losses[k] = loss.item()
        out[split] = losses.mean().item()
    model.train()  # dropout back ON for training
    return out


# ---- model ----
class Head(nn.Module):
    """One head of causal self-attention (unchanged from milestone 2, plus dropout)."""

    tril: torch.Tensor  # type hint for the buffer below (helps the type checker)

    def __init__(self, head_size):
        super().__init__()
        self.key = nn.Linear(n_embd, head_size, bias=False)
        self.query = nn.Linear(n_embd, head_size, bias=False)
        self.value = nn.Linear(n_embd, head_size, bias=False)
        self.register_buffer("tril", torch.tril(torch.ones(block_size, block_size)))
        self.dropout = nn.Dropout(dropout)

    def forward(self, x):
        T = x.shape[1]
        k = self.key(x)                                           # (B, T, hs)
        q = self.query(x)                                         # (B, T, hs)
        wei = q @ k.transpose(-2, -1) * k.shape[-1] ** -0.5       # (B, T, T)
        wei = wei.masked_fill(self.tril[:T, :T] == 0, float("-inf"))
        wei = F.softmax(wei, dim=-1)
        wei = self.dropout(wei)    # NEW: randomly ignore some attention links while training
        v = self.value(x)
        return wei @ v                                            # (B, T, hs)


class MultiHeadAttention(nn.Module):
    def __init__(self, num_heads, head_size):
        super().__init__()
        self.heads = nn.ModuleList([Head(head_size) for _ in range(num_heads)])
        # NEW: projection back into the residual stream, so the heads' outputs
        # (which were just glued side by side) get mixed together.
        self.proj = nn.Linear(num_heads * head_size, n_embd)
        self.dropout = nn.Dropout(dropout)

    def forward(self, x):
        out = torch.cat([h(x) for h in self.heads], dim=-1)
        return self.dropout(self.proj(out))


class FeedForward(nn.Module):
    """NEW. A small 2-layer network applied to each token separately.

    Attention = tokens talk to each other. Feed-forward = each token then
    thinks about what it heard. The 4x wider middle layer follows the
    original Transformer paper.
    """

    def __init__(self, n_embd):
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(n_embd, 4 * n_embd),
            nn.ReLU(),                     # non-linearity: lets it learn more than straight lines
            nn.Linear(4 * n_embd, n_embd),
            nn.Dropout(dropout),
        )

    def forward(self, x):
        return self.net(x)


class Block(nn.Module):
    """NEW. One transformer block: communicate (attention), then compute (feed-forward)."""

    def __init__(self, n_embd, n_head):
        super().__init__()
        self.sa = MultiHeadAttention(n_head, n_embd // n_head)
        self.ffwd = FeedForward(n_embd)
        self.ln1 = nn.LayerNorm(n_embd)
        self.ln2 = nn.LayerNorm(n_embd)

    def forward(self, x):
        # Residual connections: "x +" means each sub-layer only ADDS a correction.
        # Gradients flow straight back through the "+", so deep stacks still train.
        # LayerNorm is applied BEFORE each sub-layer ("pre-norm", as in GPT-2).
        x = x + self.sa(self.ln1(x))
        x = x + self.ffwd(self.ln2(x))
        return x


class GPT(nn.Module):
    def __init__(self):
        super().__init__()
        self.token_embedding_table = nn.Embedding(vocab_size, n_embd)
        self.position_embedding_table = nn.Embedding(block_size, n_embd)
        self.blocks = nn.Sequential(*[Block(n_embd, n_head) for _ in range(n_layer)])  # NEW: stack
        self.ln_f = nn.LayerNorm(n_embd)   # NEW: final LayerNorm before the output layer
        self.lm_head = nn.Linear(n_embd, vocab_size)

    def forward(self, idx, targets=None):
        T = idx.shape[1]
        tok_emb = self.token_embedding_table(idx)                                # (B, T, C)
        pos_emb = self.position_embedding_table(torch.arange(T, device=idx.device))  # (T, C)
        x = tok_emb + pos_emb
        x = self.blocks(x)
        x = self.ln_f(x)
        logits = self.lm_head(x)                                                 # (B, T, vocab)
        if targets is None:
            return logits, None
        B, T, C = logits.shape
        loss = F.cross_entropy(logits.view(B * T, C), targets.view(B * T))
        return logits, loss

    @torch.no_grad()
    def generate(self, idx, max_new_tokens):
        for _ in range(max_new_tokens):
            idx_cond = idx[:, -block_size:]
            logits, _ = self(idx_cond)
            probs = F.softmax(logits[:, -1, :], dim=-1)
            idx = torch.cat((idx, torch.multinomial(probs, 1)), dim=1)
        return idx


if __name__ == "__main__":
    model = GPT().to(device)
    optimizer = torch.optim.AdamW(model.parameters(), lr=learning_rate)
    n_params = sum(p.numel() for p in model.parameters())
    print(f"device={device} layers={n_layer} heads={n_head} n_embd={n_embd} "
          f"block={block_size} params={n_params:,}")

    history = []   # saved to disk so milestone 5 can plot the loss curve
    t0 = time.time()
    for it in range(max_iters):
        if it % eval_interval == 0 or it == max_iters - 1:
            losses = estimate_loss(model)
            history.append({"step": it, **losses})
            print(f"step {it:5d}: train {losses['train']:.4f}, val {losses['val']:.4f}"
                  f"  ({time.time() - t0:.0f}s)", flush=True)
        xb, yb = get_batch("train")
        _, loss = model(xb, yb)
        optimizer.zero_grad(set_to_none=True)
        loss.backward()
        optimizer.step()

    os.makedirs("runs", exist_ok=True)
    with open("runs/m3_losses.json", "w") as f:
        json.dump(history, f, indent=1)
    torch.save(model.state_dict(), "runs/gpt.pt")   # the trained weights (gitignored)

    model.eval()
    context = torch.zeros((1, 1), dtype=torch.long, device=device)
    sample = decode(model.generate(context, max_new_tokens=500)[0].tolist())
    with open("runs/m3_sample.txt", "w", encoding="utf-8") as f:
        f.write(sample)
    print("\n--- sample ---")
    print(sample)
