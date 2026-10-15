# Gagana

Gagana is a web app for practising Gagana Sāmoa, the Samoan language. It is a
plain static site: one HTML page, one script, one stylesheet and some JSON
files. There is no build step, no server code and no account. Your progress is
saved in your own browser.

Live version: https://ethandavidmagalei.com/gagana/

## Features

- **Malaga, the journey.** A story told in 14 stops, from the San Francisco Bay
  Area to a village on Savaiʻi, to greet a made-up family's grandmother on her
  80th birthday. At each stop you see a drawn scene, learn a few words, and
  talk with an elder by picking what to say. A respectful answer on the first
  try earns a flower (🌺). Each stop ends with a short check and a keepsake.
- **The map of lesonas.** All the lessons on one path, in twelve worlds from
  level A1 to B1 (CEFR, with the ACTFL level beside it). Each lesson earns up
  to three stars. You can jump ahead if you already know a part.
- **Lessons.** Each lesson has its words and phrases, short explanations with
  examples, a dialogue (tap a line to see the English), a note on custom where
  it fits, and a practice session.
- **Practice.** New words are shown first, then asked. Questions are multiple
  choice, typing the Samoan, filling a gap, or building a sentence from word
  tiles. A missing macron or ʻokina counts as "almost" and shows the right
  spelling. Buttons for ā ē ī ō ū and ʻ sit under every answer box.
- **Flashcards with spaced repetition.** Every word you meet becomes a card.
  A right answer pushes the card further out (1 day, 3 days, then longer); a
  miss brings it back in ten minutes. Flip cards with Again, Hard, Good and
  Easy (keys 1 to 4), or review what is due as a quiz.
- **Quick game.** About a minute of tapping: match a word to its picture, a
  picture to its word, match four pairs, count the coconuts. Words you get
  right go into a sticker book. Combos, levels and a daily double-points game.
- **The elder's challenge.** Before the last talk in each world, the elder asks
  12 fast questions on that world's words: 8 seconds each, three hearts.
  Clearing it without losing a heart earns a flower.
- **Who's it for?** A drill on the respect words: which word for "welcome",
  "you" or "eat" you use with a high chief, an orator, a minister or your
  cousin.
- **Words and sentences.** Search every lesson word plus about 600 Wiktionary
  entries, and practise 76 everyday sentences from Tatoeba.
- **You.** Your name in the story, a lavalava colour for your character (more
  colours open with more flowers), a daily goal, your streak and points, and
  the journey on a real map of the Pacific.

There is no audio in this version: the app ships no recordings, so it shows
no play buttons and asks no listening questions.

## Run it locally

The page loads its lessons with `fetch`, so open it through a web server rather
than straight from the file system:

```sh
cd gagana-samoa
python3 -m http.server 8000
```

Then open http://localhost:8000/ in a browser.

Any static host works the same way. For GitHub Pages, push the repository and
turn on Pages for the `main` branch, root folder.

## Files

```
index.html          the page
css/gagana.css      the styles
js/gagana.js        the whole app
data/lessons.json   every lesson, in the order of the map
data/course.json    the levels and the twelve worlds, and which lessons are in each
data/journey.json   the Malaga stops: scenes, words, talks and keepsakes
data/dictionary.json  Wiktionary's Samoan entries
data/sentences.json   Tatoeba's Samoan-English sentences
data/pacific.json   coastlines for the journey map
```

In `course.json`, a world's `nodes` list names its lessons: `pc:12` is Peace
Corps lesson 12, `g:tenses` is the lesson with `"n": "g-tenses"`, and `j:apia`
is the journey stop with `"id": "apia"`. The last node in each world is the
elder's talk that the challenge leads to.

Progress is kept in `localStorage` under the key `gagana-samoa-v1`. Clearing the
site's data in your browser resets it.

## Where the content comes from

- **Peace Corps lessons** (`"n": "pc-01"` to `"pc-48"`): adapted from the Peace
  Corps handbook *Gagana Samoa mo Pisikoa* (1991). A few phrases come from
  J. F. Mayer's Peace Corps course *Samoan Language* (1975). Both are works of
  the United States government and in the public domain.
- **Everything else** (the `g-` lessons, their explanations and examples, the
  dialogues and practice, the journey and its characters, the map of worlds,
  the games) was written for this project. The `g-` lessons sit next to the
  Peace Corps lesson on the same topic, or on their own where the handbook has
  no lesson on it.
- **Dictionary:** Wiktionary's Samoan entries (CC BY-SA 4.0), through
  kaikki.org.
- **Sentences:** Tatoeba (CC BY 2.0 FR).
- **Map:** Natural Earth (public domain).

The people in the journey are made up; the places are real. Where a lesson
describes a custom, it says whose custom it is or where the description comes
from.

Corrections from speakers of Samoan are welcome. Open an issue with the lesson
id, the word or sentence, and what it should be.

## License

- Code (`index.html`, `css/`, `js/`): MIT. See `LICENSE`.
- Content written for this project: CC BY-SA 4.0. Third-party content keeps
  its own license. See `CONTENT-LICENSE.md` for the file-by-file list.
