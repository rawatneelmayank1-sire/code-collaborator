// Rules shared by the browser and the server, so both reject the same input with the same words.

export const ROOM_ID_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,46}[a-z0-9])$/;
export const ROOM_ID_MIN = 3;
export const ROOM_ID_MAX = 48;
export const NAME_MAX = 32;

/** Languages the editor offers. `runner` is the Piston language name; `monaco` is the editor mode. */
export const LANGUAGES = [
  { id: 'javascript', label: 'JavaScript', monaco: 'javascript', runner: 'javascript', file: 'main.js' },
  { id: 'python', label: 'Python', monaco: 'python', runner: 'python', file: 'main.py' },
  { id: 'java', label: 'Java', monaco: 'java', runner: 'java', file: 'Main.java' },
  { id: 'cpp', label: 'C++', monaco: 'cpp', runner: 'c++', file: 'main.cpp' },
];

export const DEFAULT_LANGUAGE = 'javascript';

export const STARTER_CODE = {
  javascript: "// Everyone in this room edits the same file.\nfunction greet(name) {\n  return `Hello, ${name}`;\n}\n\nconsole.log(greet('team'));\n",
  python: "# Everyone in this room edits the same file.\ndef greet(name):\n    return f\"Hello, {name}\"\n\nprint(greet(\"team\"))\n",
  java: "public class Main {\n    public static void main(String[] args) {\n        System.out.println(\"Hello, team\");\n    }\n}\n",
  cpp: "#include <iostream>\n\nint main() {\n    std::cout << \"Hello, team\" << std::endl;\n    return 0;\n}\n",
};

export function getLanguage(id) {
  return LANGUAGES.find((l) => l.id === id) ?? null;
}

/** Lower-cases, trims and turns spaces into dashes, so "Team Alpha " becomes "team-alpha". */
export function normalizeRoomId(raw) {
  return String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/-{2,}/g, '-');
}

/** Returns null when valid, otherwise a sentence that says what to change. */
export function validateRoomId(raw) {
  const id = normalizeRoomId(raw);
  if (!id) return 'Enter a room name, or create a new room.';
  if (id.length < ROOM_ID_MIN) return `Room names need at least ${ROOM_ID_MIN} characters.`;
  if (id.length > ROOM_ID_MAX) return `Room names can be at most ${ROOM_ID_MAX} characters.`;
  if (!ROOM_ID_PATTERN.test(id)) {
    return 'Use letters, numbers and dashes only, starting and ending with a letter or number.';
  }
  return null;
}

/** Collapses inner whitespace and strips control characters. */
export function normalizeName(raw) {
  return String(raw ?? '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function validateName(raw) {
  const name = normalizeName(raw);
  if (!name) return 'Enter the name other people will see next to your cursor.';
  if (name.length > NAME_MAX) return `Names can be at most ${NAME_MAX} characters.`;
  return null;
}

const ADJECTIVES = ['amber', 'brisk', 'calm', 'deft', 'eager', 'fleet', 'keen', 'lucid', 'nimble', 'quiet', 'rapid', 'steady', 'swift', 'tidy', 'vivid'];
const NOUNS = ['otter', 'falcon', 'maple', 'comet', 'harbor', 'lynx', 'cedar', 'heron', 'orbit', 'pixel', 'quartz', 'river', 'signal', 'tundra', 'willow'];

/** Readable room names such as "keen-heron-417". `random` is injectable for tests. */
export function createRoomId(random = Math.random) {
  const pick = (list) => list[Math.floor(random() * list.length)];
  const num = String(Math.floor(random() * 900) + 100);
  return `${pick(ADJECTIVES)}-${pick(NOUNS)}-${num}`;
}
