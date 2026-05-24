export const PEOPLE = [
  {
    id: 'rose',
    name: 'Rose Bellini',
    nick: 'Nonna Rose',
    born: 1939,
    place: 'Salerno → Hoboken',
    relation: 'Grandmother',
    accent: '#7A2E22',
    palette: ['#9A4234', '#C28A7C', '#E2C9A5'],
    lastSession: 'Apr 12',
    sessions: 7,
    memories: 23,
    hours: 4.2,
  },
  {
    id: 'walter',
    name: 'Walter Okafor',
    nick: 'Grandpa Walt',
    born: 1942,
    place: 'Lagos → Houston',
    relation: 'Grandfather',
    accent: '#5E6B3A',
    palette: ['#5E6B3A', '#8C9156', '#C7C9A0'],
    lastSession: 'Mar 30',
    sessions: 5,
    memories: 18,
    hours: 3.1,
  },
  {
    id: 'mae',
    name: 'Mae-ling Chen',
    nick: 'Auntie Mae',
    born: 1944,
    place: 'Taipei → San Francisco',
    relation: 'Great-aunt',
    accent: '#B07A2C',
    palette: ['#B07A2C', '#D4A35A', '#EBD8B5'],
    lastSession: 'Apr 02',
    sessions: 4,
    memories: 14,
    hours: 2.4,
  },
  {
    id: 'henry',
    name: 'Henry Whitfield',
    nick: 'Dad',
    born: 1947,
    place: 'Brighton, UK',
    relation: 'Father',
    accent: '#3F5A6B',
    palette: ['#3F5A6B', '#7E96A4', '#C9D4DA'],
    lastSession: 'Last week',
    sessions: 11,
    memories: 41,
    hours: 6.8,
  },
]

export const TIMELINE = [
  { year: 1939, decade: '1930s', title: 'Born in Salerno', body: 'Second of four. Family ran a small bakery near the harbour.', memories: ['m1', 'm2'] },
  { year: 1944, decade: '1940s', title: 'The war years', body: 'Hid in the cellar with her brothers when the planes came over the bay.', memories: ['m3'] },
  { year: 1952, decade: '1950s', title: 'Voyage to America', body: 'Sailed on the SS Vulcania. Thirteen days. Met her cousin Carmela on deck.', memories: ['m4', 'm5'] },
  { year: 1958, decade: '1950s', title: 'Met Salvatore', body: 'At a wedding in Jersey City. He asked her to dance three times.', memories: ['m6'] },
  { year: 1961, decade: '1960s', title: 'Married', body: "St. Ann's, Hoboken. Borrowed her aunt's lace veil.", memories: ['m7', 'm8'] },
  { year: 1965, decade: '1960s', title: 'First daughter, Lucia', body: 'Born in a snowstorm. Sal walked twelve blocks for the doctor.', memories: ['m9'] },
  { year: 1972, decade: '1970s', title: 'Bought the row house', body: 'On Garden Street. Painted the kitchen yellow that first weekend.', memories: ['m10'] },
  { year: 1989, decade: '1980s', title: 'Sal passed', body: 'A quiet morning. She still sets his cup on Sundays.', memories: ['m11'] },
]

// clips: array of { start, end } in seconds — AI-extracted moments in the source interview.
// Adjacent clips ≤3 s apart are pre-merged (see mergeClips in src/lib/utils.js).
export const MEMORIES = [
  {
    id: 'm1', title: 'The bakery on Via Mercanti', tags: ['childhood', 'family'],
    snippet: '"My mother could tell the bread was ready just by the smell coming up the stairs."',
    year: 1942, photos: 1,
    personId: 'rose', sourceInterviewId: 'i7',
    // Mentioned briefly in the opening, then revisited later — two distinct clips.
    clips: [{ start: 78, end: 112 }, { start: 1724, end: 1758 }],
  },
  {
    id: 'm2', title: 'Sunday with Zia Concetta', tags: ['childhood'],
    snippet: '"She pinched my cheeks so hard I thought she\'d take them home with her."',
    year: 1944, photos: 0,
    personId: 'rose', sourceInterviewId: 'i6',
    clips: [{ start: 328, end: 367 }],
  },
  {
    id: 'm4', title: 'Thirteen days at sea', tags: ['immigration', 'journey'],
    snippet: '"I was sick the first three. Then I just looked at the water and stopped being scared."',
    year: 1952, photos: 2,
    personId: 'rose', sourceInterviewId: 'i7',
    // Main subject of the session — comes up at length twice, far apart.
    clips: [{ start: 432, end: 524 }, { start: 1938, end: 2022 }],
  },
  {
    id: 'm6', title: 'The wedding in Jersey City', tags: ['love', 'family'],
    snippet: '"He wore a brown suit. Not a good colour for him, but he didn\'t know."',
    year: 1958, photos: 1,
    personId: 'rose', sourceInterviewId: 'i5',
    clips: [{ start: 892, end: 941 }],
  },
  {
    id: 'm7', title: "Aunt Rosa's lace veil", tags: ['wedding', 'tradition'],
    snippet: '"It had a tear she sewed shut the morning of. With red thread, because she ran out."',
    year: 1961, photos: 3,
    personId: 'rose', sourceInterviewId: 'i5',
    // Two mentions nearly back-to-back; after mergeClips they collapse into one.
    clips: [{ start: 1805, end: 1840 }],
  },
  {
    id: 'm10', title: 'The yellow kitchen', tags: ['home', 'garden street'],
    snippet: '"Sal said it was the wrong yellow. Forty years he said that."',
    year: 1972, photos: 1,
    personId: 'rose', sourceInterviewId: 'i4',
    clips: [{ start: 742, end: 791 }],
  },
]

export const INTERVIEWS = [
  { id: 'i7', n: 7, date: 'Apr 12, 2026', duration: '42:18', questions: 14, answered: 13, status: 'transcribed' },
  { id: 'i6', n: 6, date: 'Mar 28, 2026', duration: '38:05', questions: 12, answered: 12, status: 'transcribed' },
  { id: 'i5', n: 5, date: 'Mar 14, 2026', duration: '44:51', questions: 15, answered: 14, status: 'transcribed' },
  { id: 'i4', n: 4, date: 'Feb 24, 2026', duration: '29:33', questions: 10, answered: 9,  status: 'transcribed' },
  { id: 'i3', n: 3, date: 'Feb 09, 2026', duration: '51:02', questions: 18, answered: 17, status: 'transcribed' },
  { id: 'i2', n: 2, date: 'Jan 26, 2026', duration: '33:47', questions: 11, answered: 11, status: 'transcribed' },
  { id: 'i1', n: 1, date: 'Jan 11, 2026', duration: '24:10', questions: 8,  answered: 8,  status: 'transcribed' },
]

// Full transcript for interview i7 "Coming to America" (fake/seed data).
export const TRANSCRIPT = `It was so much bigger than I thought. From the dock it looked like a building tipped on its side. My father carried my little brother because he wouldn't stop crying. I had a paper suitcase — cardboard, really — and the handle was loose, so I held it from the bottom the whole way up the ramp.

A little scared, yes. But when you're a child you also think it's an adventure. The scared part came at night, when you couldn't see the water, only hear it.

We shared a cabin with my mother, my brothers, and a woman from Naples named Elena. She had a baby with a beautiful voice for crying — you could hear her three doors down. Elena gave me a sugar cube the first night and told me to put it under my tongue when I felt sick.

My cousin Carmela was on the same boat and I didn't even know until the third day! We saw each other in the line for breakfast and we screamed. Everyone thought something had happened. Carmela and I stayed together every day after that.

Grey. I'm sorry, but the first thing I saw was grey water and grey sky and grey buildings far away. My mother said, "Look, Rosa, look," and I looked and I cried because I had imagined it gold.`
