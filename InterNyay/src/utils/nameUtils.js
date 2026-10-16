// Titles that can stand in front of a name ("Adv.", "Dr.", "Mr." ...), with or without the full stop.
// Covers advocates, doctors, academics, common honorifics, the Indian and South-Asian ones
// ("Shri", "Smt", "Shree", "Sri", "Kumari") and the military and police ranks people write before a name.
const TITLE = /^(?:adv|advocate|dr|mr|mrs|ms|miss|mx|shri|shree|sri|smt|smti|kum|kumari|prof|professor|hon|hony|hon'?ble|honourable|honorable|justice|er|ca|cs|capt|captain|col|colonel|cmdr|commander|lt|lieutenant|maj|major|gen|general|brig|brigadier|sgt|sergeant|insp|inspector|asst|assistant|dep|deputy)\.?$/i

// An initial: "A", "A." or joined initials like "A.K." and "A.K" (a plain two-letter word such as "Om" is a name, not initials)
const INITIAL = /^(?:\p{L}\.)+\p{L}?\.?$|^\p{L}\.?$/u

// Relationship markers: "Rahul S/o Mohan" — everything from here on names a relative, not the account holder
const RELATION = /^(?:s|d|w|c)\/o\.?$/i

// Removes invisible characters (zero-width spaces, word joiners, byte-order marks)
function stripInvisible(text) {
  return text.replace(/[\u200B-\u200D\u2060\uFEFF]/g, '')
}

// Removes the punctuation, brackets and spacing people type around a name
function cleanPart(part) {
  return stripInvisible(part).replace(/^[^\p{L}\p{M}\p{N}]+|[^\p{L}\p{M}\p{N}]+$/gu, '')
}

// Name for the greeting: the first real name, with the title in front when there is one
// ("Adv. Rahul Kumar" -> "Adv. Rahul"). Initials are skipped, so "A. K. Shakya" -> "Shakya" and
// "Dr. A. K. Shakya" -> "Dr. Shakya". A relationship marker ends the name ("Rahul S/o Mohan" -> "Rahul").
// Returns an empty string when the name holds only titles, initials or a relative's name, so the caller
// can fall back to a plain greeting ("Counsel" on the dashboard, "Welcome to InterNyay" in the sign-up flow).
export function greetingName(full) {
  // Each word keeps its raw form (a title such as "Dr." must not lose its full stop) and a cleaned form for matching
  const parts = String(full ?? '')
    .normalize('NFC')
    .split(/\s+/)
    .map(raw => ({ raw: stripInvisible(raw), clean: cleanPart(raw) }))
    .filter(part => part.clean)

  // Leading titles ("Adv.", "Dr.", "Shri" ...) are kept in front of the greeting name
  const titles = []
  while (parts.length && TITLE.test(parts[0].clean)) titles.push(parts.shift().raw)

  let first = ''
  for (const part of parts) {
    if (RELATION.test(part.clean)) return ''            // the rest of the string is a relative's name
    if (INITIAL.test(part.clean) || TITLE.test(part.clean)) continue
    first = part.clean
    break
  }
  if (!first) return ''
  return [...titles, first].join(' ')
}
