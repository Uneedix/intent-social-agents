/**
 * Explore demo data.
 * ILLUSTRATIVE DEMO CONTENT ONLY — the sample creators, tiles, topics, communities and
 * their counts (likes, comments, "12.4K posts", members) are invented for the prototype,
 * as the owner requested. Nothing here was created by the real user, and real posts
 * always show their real counts.
 */
import { photo, avatars } from './data';

export type DemoTopic = { tag: string; posts: number; image: string };
/** Explore rail "Trending now" (demo counts). */
export const exploreTrends: DemoTopic[] = [
  { tag: 'Warsaw', posts: 12400, image: photo('photo-1519197924294-4ba991a11128', 200) },
  { tag: 'Travel', posts: 8700, image: photo('photo-1464822759023-fed622ff2c3b', 200) },
  { tag: 'Minimalism', posts: 6100, image: photo('photo-1505693416388-ac5ce068fe85', 200) },
  { tag: 'Tech', posts: 5800, image: photo('photo-1498050108023-c5249f4df085', 200) },
  { tag: 'Fitness', posts: 4300, image: photo('photo-1534438327276-14e5300c3a48', 200) },
];
/** Topics for the Explore "Topics" tab (demo counts). */
export const allTopics: DemoTopic[] = [
  ...exploreTrends,
  { tag: 'Art', posts: 6100, image: photo('photo-1513364776144-60967b0f800f', 300) },
  { tag: 'Startups', posts: 4300, image: photo('photo-1522071820081-009f0129c71c', 300) },
  { tag: 'Music', posts: 3900, image: photo('photo-1505740420928-5e560c06d30e', 300) },
  { tag: 'Food', posts: 3600, image: photo('photo-1473093295043-cdd812d0e601', 300) },
  { tag: 'Photography', posts: 3100, image: photo('photo-1516035069371-29a1b244cc32', 300) },
  { tag: 'Design', posts: 2800, image: photo('photo-1561070791-2526d30994b5', 300) },
  { tag: 'Cars', posts: 2200, image: photo('photo-1503376780353-7e6692767b70', 300) },
];
/** Topic words the recommender may recognise in real post text. */
export const topicVocabulary = [...new Set([...allTopics.map(t => t.tag.toLowerCase()), 'technology', 'business', 'networking', 'english', 'coffee', 'product'])];

/** Which sample people show the verified badge / online dot (demo). */
export const verifiedHandles = ['daniel', 'maria', 'sofia', 'alex', 'luca', 'luca.visuals', 'maria.explore', 'alex.r'];
export const onlineHandles = ['daniel', 'maria', 'luca', 'emma'];

/** Sample people for "Suggested for you" and the People tab, with the topics they post about (demo). */
export const demoPeople: { name: string; handle: string; avatar: string; title: string; topics: string[] }[] = [
  { name: 'Daniel', handle: 'daniel', avatar: avatars.daniel, title: 'Marketing Manager · Warsaw', topics: ['tech', 'fitness', 'business'] },
  { name: 'Maria', handle: 'maria', avatar: avatars.sofia, title: 'Travel photographer', topics: ['travel', 'photography'] },
  { name: 'Luca', handle: 'luca', avatar: avatars.luca, title: 'Social media · Nova Agency', topics: ['cars', 'photography'] },
  { name: 'Emma', handle: 'emma', avatar: avatars.emma, title: 'English tutor · Warsaw', topics: ['food', 'photography'] },
  { name: 'Alex', handle: 'alex', avatar: avatars.alex, title: 'Product designer · Remote', topics: ['tech', 'design', 'warsaw'] },
  { name: 'Sofia', handle: 'sofia', avatar: avatars.sofia, title: 'Photographer · Warsaw', topics: ['warsaw', 'minimalism'] },
];
export const peopleTopics: Record<string, string[]> = Object.fromEntries(demoPeople.map(p => [p.handle, p.topics]));

/** Communities preview for the Explore "Communities" tab (demo member counts). */
export const demoCommunities: { name: string; members: number; image: string; topic: string }[] = [
  { name: 'Warsaw Creatives', members: 12400, image: photo('photo-1497366811353-6870744d04b2', 500), topic: 'Art' },
  { name: 'Startup Founders PL', members: 8300, image: photo('photo-1522071820081-009f0129c71c', 500), topic: 'Startups' },
  { name: 'Remote Designers', members: 6700, image: photo('photo-1561070791-2526d30994b5', 500), topic: 'Design' },
  { name: 'Weekend Hikers', members: 4100, image: photo('photo-1464822759023-fed622ff2c3b', 500), topic: 'Travel' },
  { name: 'Language Exchange', members: 3800, image: photo('photo-1519608487953-e999c86e7455', 500), topic: 'Languages' },
  { name: 'Home Studio Producers', members: 2600, image: photo('photo-1505740420928-5e560c06d30e', 500), topic: 'Music' },
];

/**
 * Explore masonry tiles (demo). ratio = height / width.
 * `handle` is the display handle; `owner` is the sample person it belongs to (used for
 * follow/mute affinity). `ago` is converted to a timestamp relative to "now" at render.
 */
export type DemoTile = { id: string; handle: string; owner: string; name: string; avatar: string; ago: string; caption: string; image: string; ratio: number; likes: number; comments: number; video?: boolean; tags: string[] };
export const demoTiles: DemoTile[] = [
  { id: 'd1', handle: 'alex.r', owner: 'alex', name: 'Alex', avatar: avatars.alex, ago: '2h', caption: 'Sunset in Warsaw 🌇', image: photo('photo-1519197924294-4ba991a11128', 700), ratio: 1.45, likes: 12400, comments: 320, tags: ['warsaw', 'travel'] },
  { id: 'd2', handle: 'luca.visuals', owner: 'luca', name: 'Luca', avatar: avatars.luca, ago: '5h', caption: 'Clean.', image: photo('photo-1503376780353-7e6692767b70', 700), ratio: 1.07, likes: 8100, comments: 142, tags: ['cars', 'minimalism'] },
  { id: 'd3', handle: 'maria.explore', owner: 'maria', name: 'Maria', avatar: avatars.sofia, ago: '8h', caption: 'Tyrol, Austria ⛰️', image: photo('photo-1464822759023-fed622ff2c3b', 700), ratio: 1.07, likes: 6800, comments: 94, tags: ['travel'] },
  { id: 'd4', handle: 'daniel.work', owner: 'daniel', name: 'Daniel', avatar: avatars.daniel, ago: '1d', caption: 'Morning routine ☕', image: photo('photo-1442512595331-e89e73853f31', 700), ratio: 0.6, likes: 4200, comments: 58, tags: ['minimalism', 'tech'] },
  { id: 'd5', handle: 'sofia.city', owner: 'sofia', name: 'Sofia', avatar: avatars.sofia, ago: '12h', caption: 'Evening walks 🖤', image: photo('photo-1519608487953-e999c86e7455', 700), ratio: 0.95, likes: 10100, comments: 210, tags: ['warsaw', 'travel'] },
  { id: 'd6', handle: 'emma.life', owner: 'emma', name: 'Emma', avatar: avatars.emma, ago: '1d', caption: 'Details 🤍', image: photo('photo-1544005313-94ddf0286df2', 700), ratio: 0.95, likes: 7600, comments: 89, tags: ['photography'] },
  { id: 'd7', handle: 'luca.visuals', owner: 'luca', name: 'Luca', avatar: avatars.luca, ago: '2d', caption: 'Sunday mood', image: photo('photo-1514888286974-6c03e2ca1dba', 700), ratio: 1.07, likes: 5300, comments: 77, video: true, tags: ['photography'] },
  { id: 'd8', handle: 'daniel.work', owner: 'daniel', name: 'Daniel', avatar: avatars.daniel, ago: '3d', caption: 'Leg day.', image: photo('photo-1534438327276-14e5300c3a48', 700), ratio: 0.95, likes: 3900, comments: 41, video: true, tags: ['fitness'] },
  { id: 'd9', handle: 'emma.life', owner: 'emma', name: 'Emma', avatar: avatars.emma, ago: '3d', caption: 'Homemade pasta 🍝', image: photo('photo-1473093295043-cdd812d0e601', 700), ratio: 1.07, likes: 6200, comments: 133, tags: ['food'] },
  { id: 'd10', handle: 'maria.explore', owner: 'maria', name: 'Maria', avatar: avatars.sofia, ago: '4d', caption: 'Amalfi coast 🌊', image: photo('photo-1533105079780-92b9be482077', 700), ratio: 1.45, likes: 15200, comments: 402, video: true, tags: ['travel'] },
  { id: 'd11', handle: 'alex.r', owner: 'alex', name: 'Alex', avatar: avatars.alex, ago: '5d', caption: 'Desk setup v3', image: photo('photo-1498050108023-c5249f4df085', 700), ratio: 0.95, likes: 9400, comments: 188, tags: ['tech', 'minimalism'] },
  { id: 'd12', handle: 'sofia.city', owner: 'sofia', name: 'Sofia', avatar: avatars.sofia, ago: '6d', caption: 'Cozy corner', image: photo('photo-1505693416388-ac5ce068fe85', 700), ratio: 0.6, likes: 2900, comments: 36, tags: ['minimalism', 'design'] },
];
