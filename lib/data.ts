import type { GifAttachment } from './gifs';
export type Section = 'Home'|'Explore'|'Intentions'|'Communities'|'Market'|'Messages'|'Notifications'|'Profile'|'Saved'|'Your activity'|'Settings'|'Instant ADS'|'Advanced Settings';
export type Poll={options:{text:string;votes:number}[];endsAt:number;myVote?:number};
export type Post={id:number;author:string;handle:string;avatar:string;time:string;text:string;images:string[];likes:number;comments:number;reposts:number;kind?:'post'|'intention';category?:string;createdAt?:number;poll?:Poll;quoteOf?:number;audience?:'everyone'|'followers';views?:number;edited?:boolean;gif?:GifAttachment};
export const photo=(id:string,w=1000)=>`https://images.unsplash.com/${id}?auto=format&fit=crop&w=${w}&q=82`;
export const avatars={you:photo('photo-1500648767791-00dcc994a43e',120),sofia:photo('photo-1534528741775-53994a69daeb',120),alex:photo('photo-1506794778202-cad84cf45f1d',120),daniel:photo('photo-1560250097-0b93528c311a',120),emma:photo('photo-1544005313-94ddf0286df2',120),luca:photo('photo-1507003211169-0a1dd7228f2d',120)};
export const initialPosts:Post[]=[{id:1,author:'Sofia',handle:'sofia',avatar:avatars.sofia,time:'2h',text:'Found this perfect spot in Warsaw today. Sometimes the best ideas come when you just stop and look around.',images:[photo('photo-1519197924294-4ba991a11128'),photo('photo-1442512595331-e89e73853f31',450),photo('photo-1519608487953-e999c86e7455',450)],likes:428,comments:24,reposts:12},{id:2,author:'Alex',handle:'alex',avatar:avatars.alex,time:'5h',text:'Working on something exciting. More details soon.',images:[photo('photo-1498050108023-c5249f4df085')],likes:312,comments:18,reposts:6},{id:3,author:'Luca',handle:'luca',avatar:avatars.luca,time:'8h',text:'New opportunity at Nova Agency! We’re looking for a Social Media Manager to join the team.',images:[photo('photo-1497366811353-6870744d04b2')],likes:176,comments:32,reposts:8,kind:'intention',category:'Job opportunity'}];
export const initialIntentions:Post[]=[{id:101,author:'Nova Agency',handle:'novaagency',avatar:avatars.daniel,time:'1h',text:'We are hiring a Social Media Manager in Warsaw. Hybrid work, creative team, and room to grow. Send us your portfolio!',images:[],likes:35,comments:12,reposts:4,kind:'intention',category:'Hiring · Warsaw'},{id:102,author:'Emma',handle:'emma',avatar:avatars.emma,time:'3h',text:'Looking for people to practice English and explore Warsaw on weekends. Coffee and good conversations?',images:[],likes:52,comments:17,reposts:2,kind:'intention',category:'Meet people · Warsaw'},{id:103,author:'Alex',handle:'alex',avatar:avatars.alex,time:'1d',text:'Building a new product and looking for a UI/UX designer to collaborate with. Remote is fine!',images:[],likes:89,comments:21,reposts:7,kind:'intention',category:'Collaboration · Remote'}];
export const products=[{id:1,name:'MacBook Air M2',price:3200,city:'Warsaw',image:photo('photo-1517336714731-489689fd1ca8')},{id:2,name:'New Balance sneakers',price:450,city:'Warsaw',image:photo('photo-1542291026-7eec264c27ff')},{id:3,name:'Sony mirrorless camera',price:4500,city:'Kraków',image:photo('photo-1516035069371-29a1b244cc32')},{id:4,name:'Studio headphones',price:800,city:'Warsaw',image:photo('photo-1505740420928-5e560c06d30e')},{id:5,name:'Vintage chair',price:750,city:'Gdańsk',image:photo('photo-1503602642458-232111445657')},{id:6,name:'Electric guitar',price:2400,city:'Warsaw',image:photo('photo-1510915361894-db8b60106cb1')}];

/** Sample stories (illustrative demo content). */
export const sampleStories:{handle:string;name:string;avatar:string;items:{image:string;caption:string;ago:string}[]}[]=[
 {handle:'daniel',name:'Daniel',avatar:avatars.daniel,items:[{image:photo('photo-1497366811353-6870744d04b2',900),caption:'New office, new energy.',ago:'2h'},{image:photo('photo-1498050108023-c5249f4df085',900),caption:'Shipping tonight 🚀',ago:'1h'}]},
 {handle:'sofia',name:'Sofia',avatar:avatars.sofia,items:[{image:photo('photo-1519197924294-4ba991a11128',900),caption:'Warsaw sunsets never get old',ago:'3h'},{image:photo('photo-1442512595331-e89e73853f31',900),caption:'Coffee first ☕',ago:'2h'}]},
 {handle:'luca',name:'Luca',avatar:avatars.luca,items:[{image:photo('photo-1519608487953-e999c86e7455',900),caption:'Old town walk',ago:'5h'}]},
 {handle:'emma',name:'Emma',avatar:avatars.emma,items:[{image:photo('photo-1505740420928-5e560c06d30e',900),caption:'Studio day 🎧',ago:'6h'}]},
 {handle:'alex',name:'Alex',avatar:avatars.alex,items:[{image:photo('photo-1517336714731-489689fd1ca8',900),caption:'Working on something exciting',ago:'8h'}]}
];
export type ChatFile={name:string;size:number;type:string;data:string};
export type ChatMsg={id:number;from:string;text:string;at:number;image?:string;file?:ChatFile;voice?:{data:string;duration:number};starred?:boolean;poll?:{question:string;options:{text:string;votes:string[]}[]};contact?:{name:string;handle:string;avatar:string};location?:{lat:number;lon:number};replyTo?:number;edited?:boolean;deleted?:boolean;reactions?:Record<string,string[]>;read?:boolean;forwardedFrom?:string;gif?:GifAttachment;topicId?:string};
export type Chat={id:string;name:string;handle:string;avatar:string;online?:boolean;pinned?:boolean;muted?:boolean;kind:'personal'|'work'|'saved'|'group';messages:ChatMsg[];members?:{name:string;handle:string;avatar:string}[];archived?:boolean;draft?:string;pinnedMsg?:number;pinnedMessages?:{messageId:number;scope:"self"|"everyone"}[];unread?:number;category?:ChatCategory;description?:string;color?:number;topicsEnabled?:boolean;topics?:GroupTopic[];roles?:Record<string,GroupRole>};
/** Telegram-style group roles and topics (subgroups). Local groups keep these on this device only. */
export type GroupRole='owner'|'admin'|'member';
export type GroupTopic={id:string;title:string;icon:string;color:number;general?:boolean;closed?:boolean;pinned?:boolean;unread?:number;createdAt?:number};
export type ChatCategory='job'|'collab'|'other';
/** Illustrative profile details for the sample contacts (demo data). */
export const chatProfiles:Record<string,{title?:string;location?:string;verified?:boolean;cover?:string;category?:ChatCategory}>={
 daniel:{title:'Marketing Manager at Nova Agency',location:'Warsaw, Poland',verified:true,cover:photo('photo-1514565131-fce0801e5785',700),category:'job'},
 sofia:{title:'Photographer',location:'Warsaw, Poland',verified:true,cover:photo('photo-1519197924294-4ba991a11128',700)},
 alex:{title:'Product designer',location:'Remote',verified:true,cover:photo('photo-1498050108023-c5249f4df085',700),category:'collab'},
 emma:{title:'English tutor',location:'Warsaw, Poland',cover:photo('photo-1505740420928-5e560c06d30e',700)},
 luca:{title:'Social media at Nova Agency',location:'Warsaw, Poland',cover:photo('photo-1519608487953-e999c86e7455',700)},
 luna:{title:'Restaurant',location:'Warsaw, Poland',cover:photo('photo-1517248135467-4c7edcad34c4',700),category:'job'},
 creativehub:{title:'Creative community',location:'Warsaw, Poland',cover:photo('photo-1497366811353-6870744d04b2',700),category:'collab'},
 techvision:{title:'Software company',location:'Kraków, Poland',cover:photo('photo-1497366216548-37526070297c',700),category:'job'}};
const H=3600000;
/** Sample direct conversations (illustrative; messages are stored only on this device). */
export const sampleChats=():Chat[]=>{const n=Date.now();return [
 {id:'saved',name:'Saved Messages',handle:'you',avatar:avatars.you,kind:'saved',pinned:true,messages:[{id:1,from:'me',text:'Notes to self: links, drafts, ideas. Only you can see this chat.',at:n-30*H,read:true}]},
 {id:'daniel',name:'Daniel',handle:'daniel',avatar:avatars.daniel,online:true,kind:'work',unread:2,messages:[{id:11,from:'daniel',text:'Hey! Are you still looking for a marketing manager for your project?',at:n-2*H},{id:12,from:'me',text:'Yes, I am. Can you tell me more about the role?',at:n-1.9*H,read:true},{id:13,from:'daniel',text:'Sure! We’re a growing e-commerce brand looking for someone to handle SMM, ads and content strategy. Mostly remote, occasional meetings in Warsaw.',at:n-1.8*H},{id:14,from:'daniel',text:'Let me know if you’re interested!',at:n-1.7*H}]},
 {id:'sofia',name:'Sofia',handle:'sofia',avatar:avatars.sofia,online:true,kind:'personal',messages:[{id:21,from:'sofia',text:'Perfect, let’s do it! I’ll send the files tonight.',at:n-5*H},{id:22,from:'me',text:'Great, thanks 🙌',at:n-4.8*H,read:true}]},
 {id:'alex',name:'Alex',handle:'alex',avatar:avatars.alex,kind:'work',messages:[{id:31,from:'alex',text:'The files are attached. Let me know what you think.',at:n-9*H}]},
 {id:'emma',name:'Emma',handle:'emma',avatar:avatars.emma,kind:'personal',messages:[{id:41,from:'emma',text:'Would you be available next week for a coffee?',at:n-50*H}]},
 {id:'luna',name:'Luna Restaurant',handle:'luna',avatar:'',kind:'work',unread:1,messages:[{id:61,from:'luna',text:'We’d love to invite you for an interview this week. Does Thursday work?',at:n-4*H}]},
 {id:'creativehub',name:'Creative Hub',handle:'creativehub',avatar:'',kind:'work',messages:[{id:71,from:'creativehub',text:'We’re interested in your music for our next event.',at:n-28*H}]},
 {id:'luca',name:'Luca',handle:'luca',avatar:avatars.luca,kind:'personal',messages:[{id:51,from:'me',text:'No problem, see you there!',at:n-75*H,read:true}]},
 {id:'techvision',name:'TechVision',handle:'techvision',avatar:'',kind:'work',messages:[{id:81,from:'techvision',text:'Thanks for applying. We’ll get back to you soon.',at:n-76*H}]}
]};
