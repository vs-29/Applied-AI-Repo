"""Milestone 4: a toy byte-pair-encoding (BPE) tokenizer, compared with real ones.

The idea in one line: repeatedly find the most common adjacent pair of tokens
and merge it into a brand-new token.

  start   : t h e ␣ c a t ␣ s a t ␣ o n ␣ t h e ␣ m a t     (bytes)
  merge 1 : "t"+"h" -> 256       th e ␣ c a t ...
  merge 2 : 256+"e" -> 257       the ␣ c a t ...
  ...after hundreds of merges, common words are single tokens.

We work on UTF-8 BYTES (0-255), not characters, like GPT-2/GPT-4 do. That way
ANY text can be encoded (emoji, Hindi, ...) because every string is bytes.
The character tokenizer in bigram.py cannot encode anything outside its 65 chars.

Run:  python bpe.py
"""
import json
import os
import time
from collections import Counter

VOCAB_SIZE = 512          # 256 raw bytes + 256 learned merges


def get_stats(ids):
    """Count how often each adjacent pair occurs, e.g. {(116, 104): 9213, ...}."""
    return Counter(zip(ids, ids[1:]))


def merge(ids, pair, new_id):
    """Replace every occurrence of `pair` in ids with new_id."""
    out, i = [], 0
    while i < len(ids):
        if i < len(ids) - 1 and ids[i] == pair[0] and ids[i + 1] == pair[1]:
            out.append(new_id)
            i += 2                      # skip both halves of the pair
        else:
            out.append(ids[i])
            i += 1
    return out


class BPETokenizer:
    def __init__(self):
        self.merges = {}                                   # (a, b) -> new id, in learned order
        self.vocab = {i: bytes([i]) for i in range(256)}   # id -> the bytes it stands for

    def train(self, text, vocab_size, verbose=False):
        ids = list(text.encode("utf-8"))
        for new_id in range(256, vocab_size):
            stats = get_stats(ids)
            pair = max(stats, key=stats.get)               # most frequent pair wins
            ids = merge(ids, pair, new_id)
            self.merges[pair] = new_id
            self.vocab[new_id] = self.vocab[pair[0]] + self.vocab[pair[1]]
            if verbose and (new_id - 256) % 32 == 0:
                print(f"  merge {new_id - 256:3d}: {show(self.vocab[pair[0]])} + "
                      f"{show(self.vocab[pair[1]])} -> {show(self.vocab[new_id])}"
                      f"  (seen {stats[pair]:,} times)")

    def encode(self, text):
        ids = list(text.encode("utf-8"))
        while len(ids) >= 2:
            # Apply merges in the SAME order they were learned: pick the pair
            # present in ids that was learned earliest (lowest new id).
            stats = get_stats(ids)
            pair = min(stats, key=lambda p: self.merges.get(p, float("inf")))
            if pair not in self.merges:
                break                                      # nothing left to merge
            ids = merge(ids, pair, self.merges[pair])
        return ids

    def decode(self, ids):
        return b"".join(self.vocab[i] for i in ids).decode("utf-8", errors="replace")

    def save(self, path):
        with open(path, "w") as f:
            json.dump([[a, b, i] for (a, b), i in self.merges.items()], f)


def show(b):
    """Readable form of a token's bytes: spaces as ␣, newlines as ↵."""
    return repr(b.decode("utf-8", errors="replace").replace(" ", "␣").replace("\n", "↵"))[1:-1]


def pieces(tokens_as_bytes):
    return "|".join(show(b) for b in tokens_as_bytes)


if __name__ == "__main__":
    with open("data/input.txt", encoding="utf-8") as f:
        text = f.read()
    n = int(0.9 * len(text))
    train_text, val_text = text[:n], text[n:]   # same split as the GPT, so we test on unseen text

    # ---- 1. train our BPE ----
    print(f"Training BPE on {len(train_text):,} characters, {VOCAB_SIZE - 256} merges...")
    t0 = time.time()
    tok = BPETokenizer()
    tok.train(train_text, VOCAB_SIZE, verbose=True)
    print(f"done in {time.time() - t0:.0f}s")
    os.makedirs("runs", exist_ok=True)
    tok.save("runs/bpe_merges.json")

    longest = sorted(tok.vocab.values(), key=len, reverse=True)[:15]
    print("\nLongest learned tokens:", ", ".join(show(b) for b in longest))

    # ---- 2. correctness: decode(encode(x)) must give back x exactly ----
    for s in [val_text[:2000], "Hello, world! 👋 नमस्ते"]:
        assert tok.decode(tok.encode(s)) == s
    print("Round-trip check passed (including emoji and Hindi, which the char tokenizer can't encode).")

    # ---- 3. compare tokenizers on the unseen validation text ----
    import tiktoken
    real = {}
    for name in ("gpt2", "cl100k_base"):          # GPT-2 (2019) and GPT-4 (2023)
        try:
            real[name] = tiktoken.get_encoding(name)
        except Exception as e:                    # needs a one-time download
            print(f"(skipping {name}: {e})")

    chars = sorted(set(text))
    rows = [("char-level (ours, M1-M3)", len(chars), len(val_text)),
            ("toy BPE (ours, M4)", VOCAB_SIZE, len(tok.encode(val_text)))]
    labels = {"gpt2": "GPT-2 BPE (tiktoken)", "cl100k_base": "GPT-4 BPE (tiktoken)"}
    for name, enc in real.items():
        rows.append((labels[name], enc.n_vocab, len(enc.encode(val_text))))

    print(f"\nTokens needed for the validation text ({len(val_text):,} characters):")
    print(f"  {'tokenizer':26s} {'vocab size':>10s} {'tokens':>8s} {'chars/token':>12s}")
    for label, v, t in rows:
        print(f"  {label:26s} {v:>10,} {t:>8,} {len(val_text) / t:>12.2f}")

    # ---- 4. see HOW each one splits the same sentence ----
    sentence = "To be, or not to be, that is the question:"
    print(f"\nHow each tokenizer splits: {sentence!r}")
    print(f"  {'char-level':12s} ({len(sentence):2d}) {'|'.join(sentence).replace(' ', '␣')}")
    ours = tok.encode(sentence)
    print(f"  {'toy BPE':12s} ({len(ours):2d}) {pieces(tok.vocab[i] for i in ours)}")
    for name, enc in real.items():
        ids = enc.encode(sentence)
        print(f"  {name:12s} ({len(ids):2d}) {pieces(enc.decode_single_token_bytes(i) for i in ids)}")

    with open("runs/m4_comparison.json", "w") as f:
        json.dump([{"tokenizer": l, "vocab": v, "tokens": t} for l, v, t in rows], f, indent=1)
