"""
CLIP Tokenizer for Drafted's 77-token limit.

Uses the same BPE tokenizer as CLIP/OpenAI for accurate token counting.
Falls back to estimation if transformers library is not available.
"""

import re
from typing import List, Tuple, Optional

# Try to import transformers for accurate tokenization
_TOKENIZER = None
_TOKENIZER_AVAILABLE = False

try:
    from transformers import CLIPTokenizer
    _TOKENIZER = CLIPTokenizer.from_pretrained("openai/clip-vit-base-patch32")
    _TOKENIZER_AVAILABLE = True
except ImportError:
    pass
except Exception as e:
    print(f"[WARN] Could not load CLIP tokenizer: {e}")


# CLIP constants
MAX_TOKENS = 77
START_TOKEN = "<|startoftext|>"
END_TOKEN = "<|endoftext|>"


def tokenize(text: str) -> List[int]:
    """
    Tokenize text using CLIP's BPE tokenizer.
    
    Returns list of token IDs.
    """
    if _TOKENIZER_AVAILABLE and _TOKENIZER:
        return _TOKENIZER.encode(text, add_special_tokens=True)
    else:
        # Fallback to estimation
        return _estimate_tokens(text)


def count_tokens(text: str) -> int:
    """
    Count the number of CLIP tokens in text.
    
    Returns:
        Token count including start/end tokens
    """
    if _TOKENIZER_AVAILABLE and _TOKENIZER:
        tokens = _TOKENIZER.encode(text, add_special_tokens=True)
        return len(tokens)
    else:
        return len(_estimate_tokens(text))


def _estimate_tokens(text: str) -> List[int]:
    """
    Estimate tokens when CLIP tokenizer is not available.
    
    CLIP BPE typically tokenizes:
    - Common words: 1 token
    - Numbers: 1 token per digit
    - Special chars: often 1 token each
    - Long/rare words: split into multiple tokens
    
    This is a rough estimation for prompt length validation.
    """
    # Simple word-based estimation
    # Split on whitespace, =, newlines
    text = text.replace("=", " = ")
    text = text.replace("\n", " ")
    
    words = text.split()
    
    # Filter empty strings
    words = [w for w in words if w]
    
    # Estimate: 1 token per word, +2 for start/end
    # Numbers might be multiple tokens
    token_count = 2  # start + end tokens
    
    for word in words:
        if word.isdigit():
            # Numbers: roughly 1 token per 2-3 digits
            token_count += max(1, len(word) // 2)
        elif word == "=":
            token_count += 1
        elif len(word) > 10:
            # Long words might be split
            token_count += max(1, len(word) // 4)
        else:
            token_count += 1
    
    # Return dummy token list of estimated length
    return list(range(token_count))


def validate_prompt(text: str) -> Tuple[bool, int, str]:
    """
    Validate a prompt against CLIP's token limit.
    
    Returns:
        (is_valid, token_count, message)
    """
    token_count = count_tokens(text)
    
    if token_count <= MAX_TOKENS:
        return (True, token_count, f"Prompt has {token_count} tokens (limit: {MAX_TOKENS})")
    else:
        over = token_count - MAX_TOKENS
        return (False, token_count, f"Prompt has {token_count} tokens, {over} over limit of {MAX_TOKENS}")


def truncate_prompt(text: str, max_tokens: int = MAX_TOKENS) -> str:
    """
    Truncate a prompt to fit within the token limit.
    
    Tries to truncate at room boundaries to maintain valid format.
    
    Returns:
        Truncated prompt
    """
    if count_tokens(text) <= max_tokens:
        return text
    
    lines = text.strip().split("\n")
    
    # Always keep the first line (area)
    result_lines = [lines[0]] if lines else []
    
    # Add blank line after area
    if len(lines) > 1 and lines[1].strip() == "":
        result_lines.append("")
    
    # Add rooms until we hit the limit
    room_lines = [l for l in lines[2:] if l.strip()]
    
    for line in room_lines:
        test_prompt = "\n".join(result_lines + [line])
        if count_tokens(test_prompt) <= max_tokens - 2:  # Leave room for safety
            result_lines.append(line)
        else:
            break
    
    return "\n".join(result_lines)


def get_tokenizer_info() -> dict:
    """Get information about the tokenizer being used."""
    return {
        "type": "clip" if _TOKENIZER_AVAILABLE else "estimation",
        "max_tokens": MAX_TOKENS,
        "available": _TOKENIZER_AVAILABLE,
        "model": "openai/clip-vit-base-patch32" if _TOKENIZER_AVAILABLE else None
    }


# Demonstration / testing
if __name__ == "__main__":
    print("CLIP Tokenizer Info:", get_tokenizer_info())
    print()
    
    test_prompts = [
        "area = 2500 sqft",
        """area = 4487 sqft

primary bed = suite
primary bath = spa
primary closet = showroom
bed + closet = standard
bed + closet = standard
bath = powder
dining = everyday
garage = tandem
kitchen = galley
laundry = hatch
living = lounge
office = workroom
outdoor living = terrace
pantry = shelf
pool = lap""",
    ]
    
    for i, prompt in enumerate(test_prompts):
        print(f"Test {i + 1}:")
        valid, count, msg = validate_prompt(prompt)
        print(f"  {msg}")
        print(f"  Valid: {valid}")
        print()






