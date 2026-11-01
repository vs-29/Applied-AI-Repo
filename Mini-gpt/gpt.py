"""Milestone 2b: bigram model + self-attention.

Same data pipeline and training loop as bigram.py. What changes:
  1. tokens get an embedding of size n_embd (not straight to logits)
  2. we add a POSITION embedding, because attention by itself has no notion of order
  3. a self-attention layer lets each token gather info from earlier tokens
  4. lm_head maps the result back to vocab-sized logits

Run:  python gpt.py --heads 1    (one head of size 32)
      python gpt.py --heads 4    (four heads of size 8, concatenated -> 32)
"""
import argparse
import torch
import torch.nn as nn
from torch.nn import functional as F

parser = argparse.ArgumentParser()
parser.add_argument("--heads", type=int, default=4)
args = parser.parse_args()

# ---- hyperparameters ----
batch_size = 32
block_size = 8          # context length: attention can look back at most 8 chars
max_iters = 5000
eval_interval = 500
eval_iters = 200
learning_rate = 1e-3    # lower than bigram: attention is less stable with big steps
n_embd = 32             # size of each token's vector
n_head = args.heads
device = "cuda" if torch.cuda.is_available() else "cpu"
torch.manual_seed(1337)

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
    model.eval()
    for split in ("train", "val"):
        losses = torch.zeros(eval_iters)
        for k in range(eval_iters):
            X, Y = get_batch(split)
            _, loss = model(X, Y)
            losses[k] = loss.item()
        out[split] = losses.mean().item()
    model.train()
    return out


# ---- model ----
class Head(nn.Module):
    """One head of causal self-attention (see attention_demo.py, version 4)."""

    tril: torch.Tensor  # type hint for the buffer below (helps the type checker)

    def __init__(self, head_size):
        super().__init__()
        self.key = nn.Linear(n_embd, head_size, bias=False)
        self.query = nn.Linear(n_embd, head_size, bias=False)
        self.value = nn.Linear(n_embd, head_size, bias=False)
        # register_buffer: part of the module's state (moves with .to(device)) but
        # is NOT a learnable parameter, so the optimizer never touches it.
        self.register_buffer("tril", torch.tril(torch.ones(block_size, block_size)))

    def forward(self, x):
        T = x.shape[1]
        k = self.key(x)                                          # (B, T, hs)
        q = self.query(x)                                         # (B, T, hs)
        wei = q @ k.transpose(-2, -1) * k.shape[-1] ** -0.5       # (B, T, T)
        wei = wei.masked_fill(self.tril[:T, :T] == 0, float("-inf"))  # [:T] for short prompts
        wei = F.softmax(wei, dim=-1)
        v = self.value(x)                                         # (B, T, hs)
        return wei @ v                                            # (B, T, hs)


class MultiHeadAttention(nn.Module):
    """Several heads in parallel, outputs concatenated along the channel dim.

    Each head can learn a different kind of relationship (e.g. "the previous
    vowel", "the start of this word") instead of one head averaging them all.
    """

    def __init__(self, num_heads, head_size):
        super().__init__()
        self.heads = nn.ModuleList([Head(head_size) for _ in range(num_heads)])

    def forward(self, x):
        return torch.cat([h(x) for h in self.heads], dim=-1)     # (B, T, num_heads*hs)


class LanguageModel(nn.Module):
    def __init__(self):
        super().__init__()
        self.token_embedding_table = nn.Embedding(vocab_size, n_embd)
        self.position_embedding_table = nn.Embedding(block_size, n_embd)
        # Keep total width = n_embd however many heads: 1x32, 4x8, ...
        self.sa_heads = MultiHeadAttention(n_head, n_embd // n_head)
        self.lm_head = nn.Linear(n_embd, vocab_size)

    def forward(self, idx, targets=None):
        B, T = idx.shape
        tok_emb = self.token_embedding_table(idx)                               # (B, T, C)
        pos_emb = self.position_embedding_table(torch.arange(T, device=device)) # (T, C)
        x = tok_emb + pos_emb        # broadcast: same position vectors for every batch row
        x = self.sa_heads(x)         # each token now mixes in info from its past
        logits = self.lm_head(x)     # (B, T, vocab_size)
        if targets is None:
            return logits, None
        B, T, C = logits.shape
        loss = F.cross_entropy(logits.view(B * T, C), targets.view(B * T))
        return logits, loss

    def generate(self, idx, max_new_tokens):
        for _ in range(max_new_tokens):
            # Position table only has block_size rows, so crop context to the last block_size tokens.
            idx_cond = idx[:, -block_size:]
            logits, _ = self(idx_cond)
            probs = F.softmax(logits[:, -1, :], dim=-1)
            idx = torch.cat((idx, torch.multinomial(probs, 1)), dim=1)
        return idx


if __name__ == "__main__":
    model = LanguageModel().to(device)
    optimizer = torch.optim.AdamW(model.parameters(), lr=learning_rate)
    n_params = sum(p.numel() for p in model.parameters())
    print(f"device={device} heads={n_head}x{n_embd // n_head} params={n_params:,}")

    for it in range(max_iters):
        if it % eval_interval == 0 or it == max_iters - 1:
            losses = estimate_loss(model)
            print(f"step {it:5d}: train {losses['train']:.4f}, val {losses['val']:.4f}")
        xb, yb = get_batch("train")
        _, loss = model(xb, yb)
        optimizer.zero_grad(set_to_none=True)
        loss.backward()
        optimizer.step()

    context = torch.zeros((1, 1), dtype=torch.long, device=device)
    print("\n--- sample ---")
    print(decode(model.generate(context, max_new_tokens=300)[0].tolist()))
