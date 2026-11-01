"""Milestone 1: bigram language model.

The simplest possible language model: predict the next character using ONLY
the current character. No context, no attention. This sets up the data
pipeline, training loop, and evaluation that every later milestone reuses.
"""
import torch
import torch.nn as nn
from torch.nn import functional as F

# ---- hyperparameters ----
batch_size = 32       # how many independent sequences we train on in parallel
block_size = 8        # max context length (bigram only uses 1, but later models use all)
max_iters = 3000
eval_interval = 300
eval_iters = 200      # batches averaged when estimating loss (reduces noise)
learning_rate = 1e-2  # high is fine for such a tiny model
device = "cuda" if torch.cuda.is_available() else "cpu"
torch.manual_seed(1337)

# ---- data ----
with open("data/input.txt", encoding="utf-8") as f:
    text = f.read()

# Character-level "tokenizer": every unique character is one token.
chars = sorted(set(text))
vocab_size = len(chars)
stoi = {ch: i for i, ch in enumerate(chars)}   # string -> int
itos = {i: ch for i, ch in enumerate(chars)}   # int -> string
encode = lambda s: [stoi[c] for c in s]
decode = lambda ids: "".join(itos[i] for i in ids)

data = torch.tensor(encode(text), dtype=torch.long)
n = int(0.9 * len(data))            # 90% train, 10% validation
train_data, val_data = data[:n], data[n:]


def get_batch(split):
    """Sample batch_size random chunks; y is x shifted one position left."""
    d = train_data if split == "train" else val_data
    ix = torch.randint(len(d) - block_size, (batch_size,))   # random start offsets
    x = torch.stack([d[i : i + block_size] for i in ix])
    y = torch.stack([d[i + 1 : i + block_size + 1] for i in ix])  # next-char targets
    return x.to(device), y.to(device)


@torch.no_grad()  # no gradients needed for evaluation -> faster, less memory
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


class BigramLanguageModel(nn.Module):
    def __init__(self, vocab_size):
        super().__init__()
        # Row i of this table = logits (unnormalised scores) for the char after char i.
        self.token_embedding_table = nn.Embedding(vocab_size, vocab_size)

    def forward(self, idx, targets=None):
        # idx: (B, T) integer tokens -> logits: (B, T, C) where C = vocab_size
        logits = self.token_embedding_table(idx)
        if targets is None:
            return logits, None
        B, T, C = logits.shape
        # cross_entropy expects (N, C) logits and (N,) targets, so flatten B and T.
        loss = F.cross_entropy(logits.view(B * T, C), targets.view(B * T))
        return logits, loss

    def generate(self, idx, max_new_tokens):
        # idx: (B, T) context; repeatedly append one sampled token.
        for _ in range(max_new_tokens):
            logits, _ = self(idx)
            logits = logits[:, -1, :]                  # only the last time step matters
            probs = F.softmax(logits, dim=-1)          # scores -> probabilities
            idx_next = torch.multinomial(probs, 1)     # sample (not argmax) for variety
            idx = torch.cat((idx, idx_next), dim=1)
        return idx


if __name__ == "__main__":
    model = BigramLanguageModel(vocab_size).to(device)
    optimizer = torch.optim.AdamW(model.parameters(), lr=learning_rate)

    print(f"device={device} vocab_size={vocab_size} train_tokens={len(train_data):,}")
    # Sanity check: an untrained model should have loss ~= -ln(1/vocab_size).
    print(f"expected initial loss ~ {torch.log(torch.tensor(vocab_size)).item():.3f}")

    for it in range(max_iters):
        if it % eval_interval == 0 or it == max_iters - 1:
            losses = estimate_loss(model)
            print(f"step {it:5d}: train {losses['train']:.4f}, val {losses['val']:.4f}")

        xb, yb = get_batch("train")
        _, loss = model(xb, yb)
        optimizer.zero_grad(set_to_none=True)  # clear old gradients
        loss.backward()                        # compute new gradients
        optimizer.step()                       # update weights

    context = torch.zeros((1, 1), dtype=torch.long, device=device)  # token 0 = '\n'
    print("\n--- sample ---")
    print(decode(model.generate(context, max_new_tokens=300)[0].tolist()))
