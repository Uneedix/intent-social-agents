/**
 * ILLUSTRATIVE DEMO DATA ONLY. These example communities, member counts, people,
 * posts and channel messages are invented so the Communities page is not empty when
 * the database is empty or not configured. They are always labelled "Example" in the
 * UI, never stored, and never mixed into real counts. Real communities are listed first.
 */
import { avatars, photo } from '../data';

export type DemoPerson = { name: string; avatar: string; interests: string[]; role?: 'owner' | 'admin' | 'moderator' };
export type DemoCommunity = {
  id: string; name: string; description: string; category: string; tags: string[]; members: number;
  activeNow: number; cover: string; icon: string; channels: string[];
  posts: { author: number; text: string; hoursAgo: number }[];
  chat: { author: number; text: string; minutesAgo: number }[];
};

export const demoPeople: DemoPerson[] = [
  { name: 'Sofia', avatar: avatars.sofia, interests: ['photography', 'warsaw', 'design'], role: 'owner' },
  { name: 'Daniel', avatar: avatars.daniel, interests: ['business', 'marketing', 'startups'], role: 'admin' },
  { name: 'Emma', avatar: avatars.emma, interests: ['languages', 'travel', 'food'], role: 'moderator' },
  { name: 'Luca', avatar: avatars.luca, interests: ['cars', 'photography', 'tech'] },
  { name: 'Alex', avatar: avatars.alex, interests: ['tech', 'design', 'music'] },
];
const img = (id: string, w: number) => photo(id, w);
const cover = (id: string) => img(id, 900), icon = (id: string) => img(id, 160);
const P = (author: number, text: string, hoursAgo: number) => ({ author, text, hoursAgo });
const C = (author: number, text: string, minutesAgo: number) => ({ author, text, minutesAgo });

export const demoCommunities: DemoCommunity[] = [
  { id: 'demo-warsaw', name: 'Warsaw Life', category: 'city', tags: ['City', 'Lifestyle', 'Events'], members: 12400, activeNow: 86,
    description: 'People living in or around Warsaw. Tips, events, places, jobs and everything in between.',
    cover: cover('photo-1519197924294-4ba991a11128'), icon: icon('photo-1514565131-fce0801e5785'), channels: ['general', 'introductions', 'events', 'housing'],
    posts: [P(0, 'Sunset walk along the Vistula this Friday, 19:00 at Bulwary. Anyone in?', 2), P(2, 'New here! Moved from Lisbon last week. Best place for a quiet coffee and laptop work?', 5)],
    chat: [C(1, 'Anyone tried the new market hall in Wola?', 4), C(3, 'Yes! Great ramen on the first floor.', 2)] },
  { id: 'demo-investing', name: 'Investing', category: 'finance', tags: ['Finance', 'Investing', 'Education'], members: 28700, activeNow: 214,
    description: 'Stocks, ETFs, personal finance and long-term thinking.',
    cover: cover('photo-1611974789855-9c2a0a7236a3'), icon: icon('photo-1611974789855-9c2a0a7236a3'), channels: ['general', 'introductions', 'etfs', 'book-club'],
    posts: [P(1, 'Monthly reminder: an emergency fund comes before any ETF. What % of income do you save?', 3), P(4, 'Sharing my notes from "The Psychology of Money". Chapter 5 changed how I think about risk.', 9)],
    chat: [C(1, 'Accumulating vs distributing ETFs — what do you prefer and why?', 6), C(4, 'Accumulating, fewer taxable events for me.', 3)] },
  { id: 'demo-fitness', name: 'Fitness', category: 'health', tags: ['Health', 'Gym', 'Lifestyle'], members: 19100, activeNow: 132,
    description: 'Training, nutrition, progress and discipline. For a stronger you.',
    cover: cover('photo-1534438327276-14e5300c3a48'), icon: icon('photo-1534438327276-14e5300c3a48'), channels: ['general', 'introductions', 'training-logs'],
    posts: [P(3, 'Week 6 of my 5x5 program. Squat up 20 kg since I started. Consistency wins.', 4), P(2, 'Looking for a morning running buddy in Mokotów, 6:30 pace ~5:30/km.', 11)],
    chat: [C(3, 'Leg day done. Who else trains in the morning?', 12)] },
  { id: 'demo-tech', name: 'Technology', category: 'technology', tags: ['Tech', 'AI', 'Gadgets'], members: 15600, activeNow: 97,
    description: 'Discuss the latest tech, tools, AI and innovation.',
    cover: cover('photo-1517336714731-489689fd1ca8'), icon: icon('photo-1498050108023-c5249f4df085'), channels: ['general', 'introductions', 'ai', 'show-and-tell'],
    posts: [P(4, 'Built a tiny Telegram bot that summarises my daily notes. Happy to share the code.', 1), P(3, 'Which laptop for development under 5000 zł? Linux friendly preferred.', 7)],
    chat: [C(4, 'Local LLMs on a laptop are finally usable.', 9), C(1, 'Which model are you running?', 7)] },
  { id: 'demo-creative', name: 'Creative Hub', category: 'creative', tags: ['Music', 'Design', 'Content'], members: 11300, activeNow: 64,
    description: 'Music, design, content creation and everything creative.',
    cover: cover('photo-1505740420928-5e560c06d30e'), icon: icon('photo-1513364776144-60967b0f800f'), channels: ['general', 'introductions', 'feedback', 'collabs'],
    posts: [P(4, 'Finished a lo-fi track tonight. Looking for honest feedback on the mix.', 2), P(0, 'Portfolio review thread: drop a link, review two others.', 8)],
    chat: [C(0, 'Anyone up for a collab poster this weekend?', 15)] },
  { id: 'demo-travel', name: 'Travel', category: 'travel', tags: ['Travel', 'Photography', 'Adventure'], members: 18900, activeNow: 120,
    description: 'Share destinations, travel tips and beautiful places from around the world.',
    cover: cover('photo-1464822759023-fed622ff2c3b'), icon: icon('photo-1464822759023-fed622ff2c3b'), channels: ['general', 'introductions', 'trip-planning'],
    posts: [P(2, 'Tatra mountains in October: which trail for a first-timer?', 6), P(0, 'Three days in Budapest on a budget — my full itinerary.', 20)],
    chat: [C(2, 'Cheap flights to Lisbon in November, anyone?', 20)] },
  { id: 'demo-self', name: 'Self Improvement', category: 'self-improvement', tags: ['Mindset', 'Productivity', 'Discipline'], members: 32100, activeNow: 241,
    description: 'Better habits, mindset, productivity and personal growth.',
    cover: cover('photo-1499750310107-5fef28a66643'), icon: icon('photo-1499750310107-5fef28a66643'), channels: ['general', 'introductions', 'accountability'],
    posts: [P(1, 'Accountability thread: one goal for this week, reply with yours.', 1), P(3, 'Deleted social apps from my phone for 30 days. Here is what changed.', 14)],
    chat: [C(1, 'Daily check-in: what is your one priority today?', 3)] },
  { id: 'demo-business', name: 'Business & Startups', category: 'business', tags: ['Business', 'Startups', 'Entrepreneurship'], members: 22800, activeNow: 158,
    description: 'Ideas, startups, entrepreneurship and building in public.',
    cover: cover('photo-1497366811353-6870744d04b2'), icon: icon('photo-1522071820081-009f0129c71c'), channels: ['general', 'introductions', 'build-in-public', 'hiring'],
    posts: [P(1, 'We just got our first 10 paying customers. Lessons from the first month inside.', 3), P(4, 'Looking for a technical co-founder for a B2B tool. Warsaw or remote.', 10)],
    chat: [C(1, 'How do you price a first freelance gig?', 8)] },
  { id: 'demo-photo', name: 'Photography', category: 'photography', tags: ['Photo', 'Editing', 'Gear'], members: 9700, activeNow: 45,
    description: 'Share your photos, get feedback and learn.',
    cover: cover('photo-1516035069371-29a1b244cc32'), icon: icon('photo-1516035069371-29a1b244cc32'), channels: ['general', 'introductions', 'critique'],
    posts: [P(0, 'Golden hour in Old Town. Shot on a 35mm prime, edited in Lightroom.', 5)],
    chat: [C(3, 'Photo walk Sunday morning?', 30)] },
  { id: 'demo-minimal', name: 'Minimalism', category: 'lifestyle', tags: ['Lifestyle', 'Home', 'Mindful'], members: 8100, activeNow: 31,
    description: 'Owning less, living more. Calm homes, simple routines and intentional choices.',
    cover: cover('photo-1505693416388-ac5ce068fe85'), icon: icon('photo-1505693416388-ac5ce068fe85'), channels: ['general', 'introductions'],
    posts: [P(2, 'Capsule wardrobe update: 30 items, 3 months in. Ask me anything.', 12)],
    chat: [C(2, 'What did you declutter this week?', 45)] },
  { id: 'demo-languages', name: 'Language Exchange', category: 'lifestyle', tags: ['Languages', 'Culture', 'Meetups'], members: 3800, activeNow: 22,
    description: 'Practise languages with native speakers. Weekly meetups and online calls.',
    cover: cover('photo-1519608487953-e999c86e7455'), icon: icon('photo-1519608487953-e999c86e7455'), channels: ['general', 'introductions', 'english', 'deutsch'],
    posts: [P(2, 'Thursday tandem night: English ↔ Polish, 18:30. Beginners welcome.', 4)],
    chat: [C(2, 'Who wants to practise German this week?', 25)] },
  { id: 'demo-music', name: 'Home Studio Producers', category: 'music', tags: ['Music', 'Production', 'Mixing'], members: 2600, activeNow: 18,
    description: 'Bedroom producers sharing tracks, plugins, mixing tips and feedback.',
    cover: cover('photo-1510915361894-db8b60106cb1'), icon: icon('photo-1505740420928-5e560c06d30e'), channels: ['general', 'introductions', 'feedback'],
    posts: [P(4, 'Free reverb plugins that actually sound good — my top 5.', 6)],
    chat: [C(4, 'Sidechain or volume automation for the kick?', 11)] },
];

/** Illustrative voice channels for every example community. `inCall` is invented and
 *  shown with an "Example" badge; no call is running and nobody is actually connected. */
export const demoVoiceChannels: { name: string; access: 'open' | 'closed'; max: number; inCall: number }[] = [
  { name: 'Lounge', access: 'open', max: 10, inCall: 3 },
  { name: 'Staff room', access: 'closed', max: 5, inCall: 1 },
];
