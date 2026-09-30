// Lessons configuration (frontend copy).
//
// MIRRORED by supabase/functions/_shared/lessons.ts — keep the two in sync.
// The server copy is the source of truth used to PRICE purchases and to decide
// how many lesson credits a purchase grants; this copy drives the Lessons UI.
//
// A customer buys one of the SKUs below. Each grants `credits` lessons. At
// checkout they schedule the FIRST lesson into an open slot; any remaining
// lessons go into their location-scoped "bank" to schedule later.

export const LESSON_PACKAGES = [
  {
    id: "single",
    packageType: "single",
    credits: 1,
    price: 150,
    label: "Single Lesson",
    tagline: "One-on-one instruction",
    save: 0,
  },
  {
    id: "three",
    packageType: "three",
    credits: 3,
    price: 350,
    label: "3-Lesson Package",
    tagline: "Save $100",
    save: 100,
  },
  {
    id: "seven",
    packageType: "seven",
    credits: 7,
    price: 800,
    label: "7-Lesson Package",
    tagline: "Save $250",
    save: 250,
  },
];

export function getLessonPackage(id) {
  return LESSON_PACKAGES.find((p) => p.id === id) || null;
}

// Default length of a lesson (minutes). Admins can override per slot.
export const DEFAULT_LESSON_MINUTES = 60;

// ---------------------------------------------------------------------------
// Teaching pro details for the customer-facing Lessons page.
//
// EDITABLE: refine this copy freely. Source: the owner's request and
// https://www.sigettegolf.com/about-sgs (Sigette Golf School).
//
// HEADSHOT: to show Brandon's photo, either
//   (a) drop the image at  public/brandon-sigette.jpg  (Vite serves /public at
//       the site root), then set headshotUrl: "/brandon-sigette.jpg", OR
//   (b) upload it to Supabase storage and paste the public URL here.
// If left null, the page shows a clean initials placeholder instead.
// ---------------------------------------------------------------------------
export const LESSON_PRO = {
  name: "Brandon Sigette",
  title: "Teaching Professional",
  headshotUrl: null,
  website: "https://www.sigettegolf.com/about-sgs",
  intro:
    "Personalized one-on-one instruction at Element Indoor Golf. Winter lessons for all skill levels — from first-timers to seasoned players looking to sharpen their game.",
  bio: [
    "Brandon Sigette leads instruction at Element Indoor Golf, bringing a personalized, one-on-one approach tailored to every student.",
    "Lessons are built around your goals and skill level, using our indoor simulators for year-round, data-driven feedback on your swing.",
    "Youth and junior golfers are welcome — Brandon loves helping the next generation build a solid foundation and a love for the game.",
  ],
  highlights: [
    "Instruction for all skill levels",
    "One-on-one, personalized coaching",
    "Youth and junior golfers welcome",
    "Year-round indoor simulator instruction",
  ],
};
