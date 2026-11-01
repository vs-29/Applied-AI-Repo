"""Milestone 2a: the maths behind self-attention, on toy tensors.

Goal: each token should "look at" the tokens before it (never after; that
would be cheating, since we're predicting the future). The simplest version
is "average everything before me". Then we make the averaging weights learned
and data-dependent. That last step IS self-attention.
"""
import torch
from torch.nn import functional as F

torch.manual_seed(1337)
B, T, C = 4, 8, 2          # batch, time (sequence length), channels (features per token)
x = torch.randn(B, T, C)

# --- Version 1: explicit loop. xbow[b, t] = mean of x[b, 0..t] ("bag of words") ---
xbow = torch.zeros(B, T, C)
for b in range(B):
    for t in range(T):
        xbow[b, t] = x[b, : t + 1].mean(dim=0)

# --- Version 2: same thing as ONE matrix multiply ---
# A lower-triangular matrix with rows summing to 1 does "average of the past".
wei = torch.tril(torch.ones(T, T))
wei = wei / wei.sum(dim=1, keepdim=True)
print("averaging weights (row t = how much token t uses each earlier token):")
print(wei)
xbow2 = wei @ x            # (T, T) @ (B, T, C) -> (B, T, C), broadcast over batch
print("loop == matmul:", torch.allclose(xbow, xbow2, atol=1e-6))

# --- Version 3: same thing via softmax with -inf masking ---
# Start from scores of 0 (=> uniform), block the future with -inf, softmax.
# exp(-inf) = 0, so future tokens get exactly zero weight.
tril = torch.tril(torch.ones(T, T))
wei = torch.zeros(T, T)
wei = wei.masked_fill(tril == 0, float("-inf"))
wei = F.softmax(wei, dim=-1)
print("softmax version == matmul:", torch.allclose(wei @ x, xbow2, atol=1e-6))

# --- Version 4: self-attention. Scores come from the data, not zeros. ---
# Each token emits a query ("what am I looking for?") and a key ("what do I
# contain?"). score[t, s] = q_t . k_s  -> high when token s is relevant to t.
# The value is what a token actually hands over if it is attended to.
C = 32
x = torch.randn(B, T, C)
head_size = 16
key = torch.nn.Linear(C, head_size, bias=False)
query = torch.nn.Linear(C, head_size, bias=False)
value = torch.nn.Linear(C, head_size, bias=False)
k, q, v = key(x), query(x), value(x)                     # each (B, T, 16)

wei = q @ k.transpose(-2, -1) * head_size**-0.5          # (B, T, T) affinity scores
# Why scale by 1/sqrt(head_size)? A dot product sums head_size terms, so if q and k
# have unit variance the raw scores have variance ~head_size. The scale brings it
# back to ~1. Without it, large scores make softmax very peaky (nearly one-hot), so
# each token listens to just one other and gradients through softmax vanish.
wei = wei.masked_fill(tril == 0, float("-inf"))          # no peeking at the future
wei = F.softmax(wei, dim=-1)
out = wei @ v                                            # (B, T, 16)

print("\nlearned attention weights for batch element 0 (rows sum to 1, upper triangle 0):")
print(wei[0].round(decimals=2))
print("out shape:", tuple(out.shape))

# Check the scaling claim with unit-variance q and k:
q1, k1 = torch.randn(B, T, head_size), torch.randn(B, T, head_size)
print(f"\nscore variance, unscaled: {(q1 @ k1.transpose(-2, -1)).var():.2f}  (~head_size={head_size})")
print(f"score variance, scaled:   {(q1 @ k1.transpose(-2, -1) * head_size**-0.5).var():.2f}  (~1)")
