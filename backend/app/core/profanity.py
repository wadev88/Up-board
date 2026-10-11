"""Thai + English profanity filter (ADR-002 decision 6).

Thai has no spaces between words, so naive substring matching produces false positives
(e.g. "หี" inside "หีบ" = box). We tokenize Thai with PyThaiNLP (newmm) using a dictionary
that includes the blocked terms, and only flag:
  * TOKEN_TERMS  – when a whole token equals the term (short / ambiguous words)
  * PHRASE_TERMS – when the term appears anywhere (long, unambiguous insults)
English words are matched per word after leetspeak normalisation.
Evasion handled: zero-width characters, repeated characters, separators between single
letters (f.u.c.k / ค-ว-ย), and leetspeak digits/symbols.
"""

import re
import unicodedata
from dataclasses import dataclass
from functools import lru_cache

from pythainlp.corpus import thai_words
from pythainlp.tokenize import word_tokenize
from pythainlp.util import Trie

THAI_TOKEN_TERMS = frozenset(
    {"ควย", "หี", "สัส", "เย็ด", "แตด", "เหี้ย", "เหี่ย", "ระยำ", "ชาติชั่ว", "ไอ้สัตว์"}
)
THAI_PHRASE_TERMS = frozenset(
    {
        "ไอ้ควาย",
        "อีควาย",
        "อีดอก",
        "ดอกทอง",
        "ตอแหล",
        "กะหรี่",
        "ส้นตีน",
        "จัญไร",
        "ชาติหมา",
        "พ่อมึงตาย",
        "แม่มึงตาย",
        "เย็ดแม่",
        "ไอ้เหี้ย",
        "อีเหี้ย",
        "ไอ้สัส",
        "อีสัส",
    }
)
ENGLISH_PREFIX_TERMS = (
    "fuck",
    "motherfuck",
    "shit",
    "bitch",
    "cunt",
    "asshole",
    "bastard",
    "dickhead",
    "whore",
    "slut",
)
ENGLISH_EXACT_TERMS = frozenset({"fck", "fuk", "wtf", "stfu"})

_ZERO_WIDTH = re.compile("[​‌‍⁠﻿]")
_REPEATS = re.compile(r"(.)\1{2,}")
_LEET = str.maketrans(
    {
        "0": "o",
        "1": "i",
        "3": "e",
        "4": "a",
        "5": "s",
        "7": "t",
        "@": "a",
        "$": "s",
        "!": "i",
    }
)
# single characters separated by punctuation/spaces: "f.u.c.k", "ค ว ย"
_SPACED_LETTERS = re.compile(r"(?:(?<=^)|(?<=\s))((?:\w[\W_]){2,}\w)(?=\s|$)")
_THAI_CHARS = re.compile(r"[฀-๿]+")
_ENGLISH_WORDS = re.compile(r"[a-z]+")


@dataclass(frozen=True)
class ProfanityResult:
    terms: tuple[str, ...]

    @property
    def is_clean(self) -> bool:
        return not self.terms


@lru_cache
def _thai_trie() -> Trie:
    return Trie(set(thai_words()) | THAI_TOKEN_TERMS | THAI_PHRASE_TERMS)


def normalize(text: str) -> str:
    text = unicodedata.normalize("NFC", text)
    text = _ZERO_WIDTH.sub("", text).lower()
    text = _REPEATS.sub(r"\1", text)
    return _SPACED_LETTERS.sub(lambda m: re.sub(r"[\W_]", "", m.group(1)), text)


def _thai_hits(text: str) -> set[str]:
    hits: set[str] = set()
    for chunk in _THAI_CHARS.findall(text):
        hits.update(term for term in THAI_PHRASE_TERMS if term in chunk)
        tokens = word_tokenize(
            chunk, custom_dict=_thai_trie(), engine="newmm", keep_whitespace=False
        )
        hits.update(token for token in tokens if token in THAI_TOKEN_TERMS)
    return hits


def _english_hits(text: str) -> set[str]:
    hits: set[str] = set()
    for word in _ENGLISH_WORDS.findall(text.translate(_LEET)):
        if word in ENGLISH_EXACT_TERMS:
            hits.add(word)
            continue
        for term in ENGLISH_PREFIX_TERMS:
            if word.startswith(term):
                hits.add(term)
                break
    return hits


def warm_up() -> None:
    """Build the Thai dictionary trie ahead of time. Lazily it cost ~4 s (≥14 s under memory
    pressure) on the first post after every API start — found by the real-stack E2E suite."""
    check("อุ่นเครื่องตัวกรองคำ warm up")


def check(text: str) -> ProfanityResult:
    normalized = normalize(text)
    return ProfanityResult(terms=tuple(sorted(_thai_hits(normalized) | _english_hits(normalized))))


def check_fields(**fields: str | None) -> list[dict[str, object]]:
    """Return contract-shaped details: [{"field": name, "terms": count}] for dirty fields."""
    details: list[dict[str, object]] = []
    for name, value in fields.items():
        if value:
            result = check(value)
            if not result.is_clean:
                details.append({"field": name, "terms": len(result.terms)})
    return details
