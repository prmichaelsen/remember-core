#!/usr/bin/env node
/**
 * Seed e1 environment with test data for remember-rem REM pipeline testing.
 *
 * Creates a dedicated user collection (Memory_users_e1_test_user) with 200+ memories
 * across varied content types and topic clusters, plus ghost-tagged memories for
 * 3 personal ghosts and 1 space ghost (50 each).
 *
 * Also seeds Memory_spaces_public with space-level memories.
 *
 * Prerequisites:
 *   Copy .env from remember-rem or set WEAVIATE_REST_URL, WEAVIATE_API_KEY,
 *   OPENAI_API_KEY, FIREBASE_SERVICE_ACCOUNT_KEY, FIREBASE_PROJECT_ID.
 *
 * Usage:
 *   npx tsx scripts/seed-e1.ts                          # seed (idempotent)
 *   npx tsx scripts/seed-e1.ts --clean                  # wipe + re-seed
 *   npx tsx scripts/seed-e1.ts --env-file=.env.custom   # custom env file
 */

import { config as loadEnv } from 'dotenv';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

// --- Parse flags ---
const args = process.argv.slice(2);
const isClean = args.includes('--clean');
const envFileArg = args.find(a => a.startsWith('--env-file='));
const envFile = envFileArg ? envFileArg.split('=')[1] : '.env.e1';
const envPath = resolve(process.cwd(), envFile);

if (!existsSync(envPath)) {
  console.error(`\n  Environment file not found: ${envFile}`);
  console.error(`  Create one with WEAVIATE_REST_URL, WEAVIATE_API_KEY, OPENAI_API_KEY,`);
  console.error(`  FIREBASE_SERVICE_ACCOUNT_KEY, FIREBASE_PROJECT_ID\n`);
  process.exit(1);
}

console.log(`\n  Loading environment from: ${envFile}`);
loadEnv({ path: envPath });

// --- Imports (after env loaded) ---
import { initWeaviateClient, getWeaviateClient } from '../src/database/weaviate/client.js';
import {
  ensureMemoryCollection,
  getMemoryCollection,
  deleteMemoryCollection,
} from '../src/database/weaviate/schema.js';
import { ensurePublicCollection } from '../src/database/weaviate/space-schema.js';
import { MemoryService } from '../src/services/memory.service.js';
import { MemoryIndexService } from '../src/services/memory-index.service.js';
import { MoodService } from '../src/services/mood.service.js';
import { initFirestore } from '../src/database/firestore/init.js';
import { createLogger } from '../src/utils/logger.js';
import type { ContentType } from '../src/types/memory.types.js';

// --- Constants ---
const TEST_USER_ID = 'e1_test_user';
const USER_COLLECTION = `Memory_users_${TEST_USER_ID}`;
const SPACE_COLLECTION = 'Memory_spaces_public';

const GHOST_PERSONAL_IDS = [
  `ghost_owner:${TEST_USER_ID}`,
  'ghost_owner:ghost_friend_alpha',
  'ghost_owner:ghost_friend_beta',
];
const GHOST_SPACE_ID = 'ghost_owner:space:e1_test_space';
const ALL_GHOST_IDS = [...GHOST_PERSONAL_IDS, GHOST_SPACE_ID];

// --- Seed Content ---

interface SeedMemory {
  content: string;
  title: string;
  type: ContentType;
  tags: string[];
}

// Topic clusters designed to produce natural embedding clusters + near-duplicates
// 10 clusters × 20 memories each = 200 non-ghost memories
const TOPIC_CLUSTERS: Array<{ topic: string; contentType: ContentType; tag: string; memories: Array<{ title: string; content: string }> }> = [
  {
    topic: 'cooking',
    contentType: 'recipe',
    tag: 'topic:cooking',
    memories: [
      { title: 'Pasta carbonara recipe', content: 'Classic carbonara: Cook 400g spaghetti al dente. Whisk 4 egg yolks with 100g pecorino romano and black pepper. Fry 200g guanciale until crispy. Toss hot pasta with guanciale, remove from heat, add egg mixture. Toss quickly — residual heat cooks the eggs into a creamy sauce. Never add cream.' },
      { title: 'Sourdough bread notes', content: 'Fed the starter at 1:5:5 ratio this morning. Bulk ferment for 4 hours at 78°F. The dough felt extensible but not too slack. Shaped into a batard and put in the banneton for overnight cold retard. Should be ready to bake at 475°F tomorrow morning.' },
      { title: 'Thai green curry', content: 'Made green curry from scratch tonight. Pounded the paste in the mortar: green chilis, lemongrass, galangal, cilantro roots, shallots, garlic, shrimp paste, cumin and coriander seeds. Fried the paste in coconut cream until fragrant, added chicken and vegetables, finished with fish sauce, palm sugar, and Thai basil.' },
      { title: 'Pasta carbonara recipe (updated)', content: 'Updated carbonara method: Cook 400g spaghetti al dente. Whisk 4 egg yolks with 100g pecorino romano, generous black pepper. Crisp 200g guanciale. Combine hot pasta with guanciale off heat, add egg mixture and toss vigorously. The key is temperature control — too hot scrambles the eggs.' },
      { title: 'Homemade ramen broth', content: 'Started a tonkotsu broth. Split pork femur bones and blanched for 10 minutes. Fresh water, brought to a rolling boil and kept it there for 12 hours. The emulsification is key — the vigorous boil breaks down collagen and fat into the milky white broth. Added tare (soy-based) and finished with garlic oil.' },
      { title: 'Fermentation experiments', content: 'Trying lacto-fermented hot sauce. Blended habaneros, garlic, and carrots with 3% salt brine. Packed into a mason jar with an airlock. Should ferment for 2-3 weeks at room temperature. The lactobacillus will create lactic acid and develop complex flavors.' },
      { title: 'Knife skills practice', content: 'Spent an hour practicing brunoise cuts on carrots and celery. The key is a sharp knife and consistent sizing. Rocking motion for herbs, push cut for dense vegetables. My julienne is getting more consistent but still need work on the 1/16 inch precision.' },
      { title: 'Pizza dough hydration test', content: 'Testing different hydration levels for Neapolitan pizza. 60% hydration was too stiff. 65% was workable but dense. 70% gives the best leoparding and open crumb but harder to handle. Using Caputo 00 flour and 72-hour cold ferment.' },
      { title: 'Miso soup from scratch', content: 'Made dashi from scratch — kombu soaked for 30 minutes, then heated to just below boiling. Added bonito flakes, steeped 5 minutes, strained. Dissolved white miso paste off heat to preserve the live cultures. Garnished with silken tofu cubes, wakame, and scallions.' },
      { title: 'Spice blending notes', content: 'Created a custom garam masala blend: toasted whole cumin, coriander, cardamom pods, black peppercorns, cloves, cinnamon stick, and bay leaves. Ground fresh in the spice grinder. The aroma when toasting is incredible — much more complex than store-bought.' },
      { title: 'Butter croissant attempt', content: 'Third attempt at laminated dough for croissants. The key is keeping the butter and dough at the same temperature during folding. Did 3 single folds with 30-minute rests between each. The layers are finally visible when I cut the raw dough. Proofing overnight.' },
      { title: 'Wok cooking technique', content: 'Practiced wok hei — the smoky flavor from high-heat wok cooking. The wok needs to be screaming hot before adding oil. Small batches are essential — overcrowding drops the temperature and steams instead of sears. Tossing technique is getting smoother.' },
      { title: 'Sous vide steak experiment', content: 'Tested sous vide ribeye at different temperatures: 129°F (medium-rare) for 2 hours was perfect. The reverse sear in a cast iron with avocado oil gave a beautiful crust without overcooking the interior. Rested 5 minutes before slicing.' },
      { title: 'Homemade pasta shapes', content: 'Learned to make orecchiette by hand — press a small piece of dough with your thumb and drag it across the board. The rough texture holds sauce better than smooth pasta. Also tried cavatelli using a gnocchi board. Both pair perfectly with broccoli rabe and sausage.' },
      { title: 'Stock making marathon', content: 'Made three stocks today: chicken (roasted bones, mirepoix, 6 hours), vegetable (onion skins, carrot tops, celery leaves, 45 minutes), and mushroom (dried porcini, shiitake stems, 2 hours). Reduced each by half and froze in ice cube trays for easy portioning.' },
      { title: 'Chocolate tempering notes', content: 'Finally nailed chocolate tempering. Seed method: melt dark chocolate to 120°F, add chopped chocolate to cool to 82°F, then gently reheat to 88-90°F. The tempered chocolate has a satisfying snap and glossy finish. Used it for dipping strawberries and making bonbons.' },
      { title: 'Bread scoring patterns', content: 'Experimented with different scoring patterns on sourdough. Single ear score at 45 degrees gives the best oven spring. Cross-hatch pattern is decorative but restricts rise. Using a curved lame blade makes the angle easier to control. Wheat stencils with rice flour look amazing.' },
      { title: 'Pickling and preserving', content: 'Quick pickled red onions: thinly sliced, covered with rice vinegar, sugar, salt, and a few peppercorns. Ready in 30 minutes, last 2 weeks in the fridge. Also started proper lacto-fermented dill pickles — just cucumbers, salt, garlic, dill, and grape leaves for tannin.' },
      { title: 'Ice cream base recipe', content: 'Perfected a French-style ice cream base: 6 egg yolks, 3/4 cup sugar, 2 cups heavy cream, 1 cup whole milk. Heat milk and cream, temper into yolks, cook to 170°F (nappe consistency). Strain through fine mesh, chill overnight before churning. The overnight rest improves texture significantly.' },
      { title: 'Dumpling folding practice', content: 'Practiced pleating dumplings for an hour. The trick is holding the wrapper in one hand and using the other to create 6-8 even pleats on one side while the other side stays flat. Filling: pork, napa cabbage, ginger, garlic, soy, sesame oil. Pan-fried with the ice water method for crispy bottoms.' },
    ],
  },
  {
    topic: 'programming',
    contentType: 'code',
    tag: 'topic:programming',
    memories: [
      { title: 'TypeScript generic patterns', content: 'Learned about conditional types in TypeScript. The pattern `T extends U ? X : Y` is incredibly powerful for type-level programming. Combined with `infer` keyword, you can extract types from complex structures. Example: `type ReturnType<T> = T extends (...args: any[]) => infer R ? R : never`.' },
      { title: 'Weaviate vector search optimization', content: 'Optimized our Weaviate queries by using HNSW index with ef=100 for search and efConstruction=128 for build. The key insight: higher ef values improve recall but increase latency. For our use case (semantic memory search), recall matters more than speed, so ef=200 at query time works well.' },
      { title: 'Node.js streaming patterns', content: 'Implemented a Transform stream for processing large JSON files. The backpressure handling is crucial — if the writable side is slower than readable, the stream automatically pauses. Used pipeline() instead of pipe() for proper error handling and cleanup.' },
      { title: 'Git rebase workflow', content: 'Our team switched from merge commits to rebase workflow. The key rule: never rebase public branches. For feature branches, `git rebase main` before creating PR keeps history clean. Interactive rebase (`git rebase -i`) to squash WIP commits into logical units.' },
      { title: 'React server components deep dive', content: 'Server components eliminate the client-server waterfall. They render on the server, stream HTML to the client, and never ship JavaScript. Client components (use client) handle interactivity. The mental model: server components are the default, client components are the escape hatch.' },
      { title: 'TypeScript generic patterns (advanced)', content: 'Advanced TypeScript generics: Mapped types transform every property of an existing type. `type Readonly<T> = { readonly [P in keyof T]: T[P] }`. Template literal types enable string manipulation at the type level. Distributive conditional types automatically distribute over unions.' },
      { title: 'Database indexing strategies', content: 'Created composite indexes for our Firestore queries. Single-field indexes are automatic but compound queries need explicit composite indexes. The field order matters — most selective field first. Also added TTL policies for ephemeral data to reduce storage costs.' },
      { title: 'Error handling patterns', content: 'Adopted the Result pattern for error handling instead of try/catch everywhere. `type Result<T, E> = { ok: true; value: T } | { ok: false; error: E }`. This makes errors explicit in function signatures and forces callers to handle them. Much better than unchecked exceptions.' },
      { title: 'WebSocket connection management', content: 'Built a reconnecting WebSocket wrapper. Key features: exponential backoff (1s, 2s, 4s, 8s max), heartbeat pings every 30s, message queue during disconnection, and automatic resubscription on reconnect. The connection state machine has 4 states: connecting, open, closing, closed.' },
      { title: 'Docker multi-stage builds', content: 'Optimized our Docker image from 1.2GB to 191MB using multi-stage builds. Stage 1: full Node.js image for building TypeScript. Stage 2: alpine image with only production dependencies and compiled JS. Also added .dockerignore to exclude node_modules, tests, and docs from the build context.' },
      { title: 'API rate limiting implementation', content: 'Implemented token bucket rate limiting for our REST API. Each user gets 100 tokens, refilled at 10/second. Burst-friendly but prevents sustained abuse. Used Redis for distributed state so it works across multiple instances. Returns 429 with Retry-After header.' },
      { title: 'Testing strategies comparison', content: 'Evaluated testing approaches: unit tests are fast but miss integration issues. Integration tests catch real bugs but are slow. E2E tests are closest to user reality but flaky. Our ratio: 70% unit, 20% integration, 10% E2E. The testing pyramid still holds.' },
      { title: 'CSS Grid vs Flexbox decision', content: 'Finally have a clear mental model: Flexbox is 1-dimensional (row OR column). Grid is 2-dimensional (row AND column). Use Flexbox for nav bars, card layouts, centering. Use Grid for page layouts, dashboards, anything with both row and column alignment needs.' },
      { title: 'Observability with structured logging', content: 'Switched from console.log to structured JSON logging. Every log entry has: level, message, timestamp, correlationId, and context fields. This makes log aggregation in CloudWatch/Datadog actually useful. Can filter by userId, requestId, or error type. Worth the migration effort.' },
      { title: 'GraphQL schema design', content: 'Lessons from designing our GraphQL schema: 1) Start with the UI needs, not the database schema. 2) Use connections (edges/nodes) for pagination, not simple arrays. 3) Input types should be separate from output types. 4) Use enums liberally. 5) Nullable by default is actually fine.' },
      { title: 'Memory leak debugging', content: 'Tracked down a memory leak using Node.js --inspect and Chrome DevTools heap snapshots. The culprit: event listeners attached in a constructor but never removed. Every request created a new instance, each adding listeners to a shared EventEmitter. Fix: WeakRef + cleanup in a dispose() method.' },
      { title: 'Monorepo tooling evaluation', content: 'Compared monorepo tools: Turborepo (fast, simple, good caching), Nx (feature-rich, steeper learning curve), pnpm workspaces (lightweight, manual orchestration). Went with Turborepo + pnpm. The remote caching alone saves 60% of CI time on unchanged packages.' },
      { title: 'Async iterator patterns', content: 'Used async iterators for paginated API consumption. The for-await-of loop makes it clean: `for await (const page of fetchAllPages(url))`. The generator function handles pagination logic internally — cursor tracking, retry on 429, and graceful termination. Caller just sees items.' },
      { title: 'Feature flag architecture', content: 'Implemented feature flags using a simple JSON config + environment override. Flags have three states: on, off, percentage (gradual rollout). The evaluation is: env override > percentage roll > default. Server-side only — no client SDK needed. Flags are cleaned up quarterly.' },
      { title: 'Dependency injection without frameworks', content: 'Built a simple DI container using factory functions instead of decorators or reflection. Each service declares its dependencies as constructor params. A composition root wires everything together. No magic, fully type-safe, easy to test with mock implementations.' },
    ],
  },
  {
    topic: 'fitness',
    contentType: 'journal',
    tag: 'topic:fitness',
    memories: [
      { title: 'Morning run — 5K personal best', content: 'Hit a new 5K PR this morning: 22:47! The negative split strategy worked — started at 4:50/km pace and gradually picked up to 4:20/km for the last kilometer. Weather was cool (55°F) which helped. Legs felt strong from the rest day yesterday.' },
      { title: 'Strength training — squat progress', content: 'Back squat session: worked up to 225 lbs for 3 sets of 5. Form felt solid — breaking at the hips first, knees tracking over toes, chest up. Added 5 lbs from last week. Accessory work: Bulgarian split squats, leg press, calf raises.' },
      { title: 'Yoga for recovery', content: 'Did a 45-minute yin yoga session focused on hip openers. Held pigeon pose, lizard pose, and frog pose for 3-5 minutes each. The fascia release was noticeable — hips feel much more mobile. Need to incorporate this at least twice a week for running recovery.' },
      { title: 'Marathon training plan', content: 'Starting a 16-week marathon training plan. Week 1: 25 miles total with a 10-mile long run. Building to 45+ miles per week by week 12. Key workouts: Tuesday tempo runs, Thursday intervals, Saturday long run. Easy pace should be truly easy — conversational.' },
      { title: 'Nutrition for endurance', content: 'Dialing in race nutrition. Practiced fueling during the long run: 30g carbs every 45 minutes using gels. Took one with caffeine at mile 8. Hydration: 4-6 oz every 20 minutes. Need to test different gel brands — some cause GI distress.' },
      { title: 'Morning run — recovery day', content: 'Easy 3-mile recovery run. Kept heart rate under 140 bpm. Legs were tired from yesterday\'s squats but loosened up after the first mile. Focused on cadence (180 spm) and relaxed shoulders. The slow runs build aerobic base without adding fatigue.' },
      { title: 'Deadlift form check', content: 'Filmed my deadlift from the side. Noticed my hips shoot up before the bar moves — need to engage lats more and think about "pushing the floor away." Switched to sumo stance for the top sets and it felt much more natural for my proportions. Hit 275 for a clean triple.' },
      { title: 'Swimming for cross-training', content: 'First pool session in months. Did 1500m total: 4x100m freestyle, 4x50m backstroke, 4x50m kick drill. My stroke efficiency is terrible — too much splash, not enough catch. Need to work on the high-elbow catch. Heart rate stays surprisingly high even at slow pace.' },
      { title: 'Mobility routine', content: 'Developed a 15-minute daily mobility routine: thoracic spine rotations, 90/90 hip switches, ankle dorsiflexion stretches, banded shoulder dislocates, and hanging from a pull-up bar. Doing this every morning before training has eliminated the knee pain I had during squats.' },
      { title: 'Trail running discovery', content: 'Tried trail running for the first time at the state park. 6 miles on single track with 800 feet of elevation gain. The terrain forces shorter steps and more lateral movement. Pace was 2 min/mile slower than road but the effort felt the same. Loved the mental engagement of watching footing.' },
      { title: 'Sleep and recovery tracking', content: 'Started tracking sleep with my watch. Average 6.5 hours — not enough for the training load. Deep sleep is only 45 minutes (should be 90+). Implemented: no screens 1 hour before bed, room temp 67°F, blackout curtains. After one week, deep sleep improved to 70 minutes.' },
      { title: 'Interval training — 800m repeats', content: 'Track workout: 6x800m at 3:20 with 90-second jog recovery. First 4 reps felt controlled. Rep 5 was a grind. Rep 6 I had to dig deep but finished in 3:18 — fastest of the set. The mental game in the last reps is where the real training happens.' },
      { title: 'Foam rolling routine', content: 'Comprehensive foam rolling session post-run: IT band (2 min each side), quads, hamstrings, calves, and upper back. The lacrosse ball on the glutes found a knot that referred pain down my leg. Spent extra time there. Prevention is way cheaper than physical therapy.' },
      { title: 'Pull-up progression', content: 'Working toward 20 consecutive pull-ups. Currently at 14. Using the grease-the-groove method: 5 sets throughout the day at 60% of max (8-9 reps). Also adding weighted pull-ups (25 lbs) for 3x5 on strength days. The lat engagement cue "pull elbows to hips" is a game-changer.' },
      { title: 'Race day checklist', content: 'Pre-race routine: wake up 3 hours before start. Breakfast: oatmeal, banana, coffee. Arrive 90 min early. Warm up: 10 min easy jog, 4 strides. Gear: tested shoes (not new), body glide, race bib, gels in belt. Mental: visualize the course, set A/B/C goals.' },
      { title: 'Heart rate zone training', content: 'Calibrated my heart rate zones with a field test. Zone 2 is 135-150 bpm — this is where 80% of training should happen. It feels uncomfortably slow but that\'s the point. Zone 4 (170-180) for intervals only. Most amateurs train too hard on easy days and too easy on hard days.' },
      { title: 'Grip strength training', content: 'Added grip work to my routine: farmer carries (70 lb dumbbells, 3x40m), dead hangs (3x45 seconds), plate pinches, and wrist curls. Grip was the limiting factor in my deadlift — not anymore. Also helps with pull-ups and carrying groceries.' },
      { title: 'Stretching vs. warming up', content: 'Important distinction: static stretching before exercise can reduce power output. Dynamic warm-up is better: leg swings, walking lunges, arm circles, high knees. Save static stretching for after the workout when muscles are warm. 10-minute cool-down walk prevents blood pooling.' },
      { title: 'Weekly training log', content: 'This week: Mon — rest. Tue — 5 mile tempo run (7:15/mi). Wed — upper body strength. Thu — 6x400m intervals. Fri — easy 4 miles. Sat — 14 mile long run. Sun — yoga + foam rolling. Total: 32 miles running, 2 strength sessions. Feeling good going into taper week.' },
      { title: 'Injury prevention notes', content: 'Learned from my IT band injury: increase weekly mileage by max 10%. Don\'t skip single-leg exercises. Rotate shoes. Address muscle imbalances (my left glute was weaker). Core stability exercises prevent compensatory patterns. Listen to sharp pain — dull ache is okay, sharp is not.' },
    ],
  },
  {
    topic: 'music',
    contentType: 'note',
    tag: 'topic:music',
    memories: [
      { title: 'Guitar chord progressions', content: 'Explored jazz chord substitutions today. Tritone substitution: replace any dominant 7th with the dominant 7th a tritone away. So G7 → Db7 in a ii-V-I in C major. The voice leading is smoother because the 3rd and 7th swap positions. Applied this to Autumn Leaves.' },
      { title: 'Music theory — modes', content: 'Finally understood modes intuitively. Instead of thinking of them as scales starting on different degrees, think of them as flavors over a chord. Dorian = minor with a bright 6th (jazz minor feel). Mixolydian = major with a flat 7th (blues/rock). Lydian = major with a sharp 4th (dreamy).' },
      { title: 'Recording session notes', content: 'Tracked vocals for the new song today. Used the SM7B through the Neve preamp. Proximity effect was an issue — had the singer back off 6 inches and used a high-pass at 80Hz. Double-tracked the chorus for width. Need to comp the best takes tomorrow.' },
      { title: 'Songwriting — verse structure', content: 'Working on lyrics for a new song about nostalgia. The verse follows ABAB rhyme scheme with internal rhymes. Melody sits in a narrow range (5th) for verses, then opens up to an octave for the chorus. The contrast creates emotional lift.' },
      { title: 'Piano practice log', content: 'Practiced Chopin Nocturne Op. 9 No. 2 for 40 minutes. The left hand arpeggios need to be lighter — currently overpowering the melody. Worked on the ornamental runs in the B section at half tempo. The rubato feels more natural when I think of breathing between phrases.' },
      { title: 'Album review — Kind of Blue', content: 'Revisited Miles Davis\' Kind of Blue. The modal approach is what makes it timeless — instead of rapid chord changes (bebop), the players improvise over sustained modes. Bill Evans\' piano voicings are ethereal. "So What" is based on just two chords (Dm7 and Ebm7).' },
      { title: 'Ear training progress', content: 'Working on interval recognition. Perfect 4th and 5th are easy now (Here Comes the Bride, Star Wars). Minor 6th still trips me up — using "The Entertainer" as a reference. Tritone is unmistakable once you hear it. Goal: identify all intervals within 2 seconds.' },
      { title: 'Home studio acoustic treatment', content: 'Built DIY acoustic panels: 2x4 frames, Roxul insulation, wrapped in burlap. Placed at first reflection points on side walls and ceiling. The difference is dramatic — flutter echoes gone, stereo imaging way clearer. Bass traps in corners are next.' },
      { title: 'Mixing techniques — EQ', content: 'Key EQ principle: cut narrow, boost wide. If something sounds muddy, cut around 300-400Hz. For presence in vocals, gentle boost at 3-5kHz. High-pass everything except bass and kick drum. The best mixes have every instrument occupying its own frequency range.' },
      { title: 'Rhythm patterns — odd time signatures', content: 'Spent time internalizing 7/8 time. The trick: feel it as 2+2+3 or 3+2+2, not as 7 individual beats. Listened to Tool\'s "Schism" (alternating 5/8 and 7/8) and Radiohead\'s "15 Step" (5/4). Once you feel the groupings, odd meters become intuitive.' },
      { title: 'Guitar amp settings', content: 'Found my ideal clean tone on the Fender Twin: volume at 4, treble at 7, bass at 5, reverb at 3. For crunch, the Marshall: gain at 5, presence at 6. The key insight: less gain than you think. Let the pick dynamics control the distortion amount.' },
      { title: 'Music production — compression', content: 'Finally understand compression: threshold sets when it kicks in, ratio controls how much it reduces, attack and release shape the dynamics. Fast attack kills transients (makes things smoother), slow attack preserves punch. Parallel compression: blend compressed with dry signal for best of both.' },
      { title: 'Performing live — stage tips', content: 'Notes from our first gig: 1) Arrive early to soundcheck. 2) Bring backup cables and strings. 3) Don\'t over-rehearse on show day. 4) Make eye contact with the audience. 5) Mistakes are invisible if you don\'t react to them. 6) Energy trumps perfection every time.' },
      { title: 'Vinyl collection notes', content: 'Picked up three records this weekend: Thelonious Monk "Brilliant Corners" (original Riverside pressing!), Talking Heads "Remain in Light," and Khruangbin "Con Todo El Mundo." The Monk is in VG+ condition — slight surface noise but the music is transcendent.' },
      { title: 'Bass guitar technique', content: 'Working on fingerstyle bass technique. Alternating index and middle fingers for consistent tone. The plucking motion should come from the knuckle, not the fingertip. Practicing with a metronome at 60 bpm — painfully slow but it\'s exposing all my timing inconsistencies.' },
      { title: 'Song analysis — Bohemian Rhapsody', content: 'Dissected Bohemian Rhapsody\'s structure: intro (ballad), verse, operatic section, hard rock section, outro (ballad reprise). No chorus in the traditional sense. The operatic section modulates through 6 keys in 2 minutes. Mercury\'s genius was making the absurd feel inevitable.' },
      { title: 'Synthesizer sound design', content: 'Built a pad sound from scratch on the Juno-106: two oscillators detuned by 7 cents, low-pass filter with moderate resonance, slow LFO on the filter cutoff, long attack and release on the amp envelope. Added chorus effect. The slight detuning creates warmth that a single oscillator can\'t.' },
      { title: 'Music and memory connection', content: 'Read about how music activates the hippocampus, amygdala, and prefrontal cortex simultaneously. This is why songs trigger vivid memories. The emotional pathway (amygdala) is why we remember where we were when we heard certain songs. Music is a time machine for the brain.' },
      { title: 'Collaborative songwriting session', content: 'Wrote a song with the band using the "exquisite corpse" method: each person writes a line without seeing the previous ones. The result was surreal but had unexpected coherence. Edited it together into a cohesive piece. Constraints breed creativity.' },
      { title: 'Concert review — local jazz club', content: 'Saw a trio at the Blue Note: piano, upright bass, drums. The interplay was telepathic — each musician responding in real-time to micro-decisions the others made. The bassist\'s walking lines were melodic enough to stand alone. Three hours felt like thirty minutes.' },
    ],
  },
  {
    topic: 'philosophy',
    contentType: 'journal',
    tag: 'topic:philosophy',
    memories: [
      { title: 'On consciousness and AI', content: 'Been thinking about the hard problem of consciousness. Even if an AI system processes information exactly like a human brain, is there "something it is like" to be that system? Chalmers\' zombie argument suggests functional equivalence doesn\'t guarantee phenomenal experience. But maybe consciousness is substrate-independent.' },
      { title: 'Stoic daily reflection', content: 'Evening reflection following Marcus Aurelius\' practice. Today I lost patience in a meeting — the Stoic response would have been to recognize that others\' behavior is outside my control. "The impediment to action advances action. What stands in the way becomes the way."' },
      { title: 'Ethics of memory persistence', content: 'Interesting ethical question: if an AI remembers everything a person tells it, does the person have a right to be forgotten? The EU thinks yes (GDPR), but memory is foundational to relationships. Can you have genuine connection without shared history? The tension between privacy and intimacy.' },
      { title: 'Reading notes — Existentialism', content: 'Sartre\'s "existence precedes essence" — we are not born with a fixed nature. We create ourselves through choices. This is both liberating (radical freedom) and terrifying (radical responsibility). "Man is condemned to be free." Contrasts with Heidegger\'s thrownness — we didn\'t choose our starting conditions.' },
      { title: 'On habits and identity', content: 'James Clear\'s insight: every action is a vote for the type of person you wish to become. Habits aren\'t about what you do but who you are becoming. Instead of "I want to run a marathon" → "I am a runner." Identity-based change is more durable than outcome-based change.' },
      { title: 'Meditation notes', content: 'Sat for 20 minutes this morning. The monkey mind was especially active — kept returning to work worries. Each time, just noticed the thought and returned to the breath. The point isn\'t to stop thinking but to notice when you\'re caught in thought. Progress is measured in moments of awareness.' },
      { title: 'The ship of Theseus and identity', content: 'If every plank of a ship is replaced over time, is it the same ship? Applied to humans: every cell in your body is replaced over 7-10 years. Are you the same person you were a decade ago? Maybe identity is the pattern, not the material. Continuity of process rather than substance.' },
      { title: 'Epistemic humility', content: 'The more I learn, the more I realize how little I know. Socrates had it right. The Dunning-Kruger peak is comfortable but illusory. Real expertise comes with genuine uncertainty — knowing where the edge of your knowledge lies. "I know that I know nothing" is the beginning of wisdom.' },
      { title: 'Utilitarianism vs deontology', content: 'The trolley problem highlights the tension between utilitarian thinking (greatest good for greatest number — pull the lever) and deontological ethics (never use a person as a means — don\'t push the fat man). Most of us are inconsistent, switching frameworks based on emotional proximity.' },
      { title: 'Reading notes — Tao Te Ching', content: 'Lao Tzu\'s paradoxes are meant to be felt, not analyzed. "The Tao that can be spoken is not the eternal Tao." Water is soft but carves canyons. The empty hub makes the wheel useful. Non-action (wu wei) doesn\'t mean doing nothing — it means acting in harmony with the natural flow.' },
      { title: 'Free will and determinism', content: 'If our decisions are the product of prior causes (genes, environment, neural chemistry), is free will an illusion? Compatibilists say yes to both — determinism is true AND we have free will (defined as acting according to our desires without coercion). The libertarian free will position seems increasingly untenable.' },
      { title: 'On the meaning of suffering', content: 'Viktor Frankl survived Auschwitz and concluded that meaning is not found but created. "He who has a why to live can bear almost any how." Suffering without meaning is unbearable. Suffering with purpose — even suffering chosen for a higher value — becomes tolerable.' },
      { title: 'Aesthetic experience and beauty', content: 'What makes something beautiful? Kant said it\'s a "purposiveness without purpose" — the feeling that something was designed for our contemplation even though it wasn\'t. Hume said beauty is in the eye of the beholder. Both capture something true. Beauty seems both universal and personal.' },
      { title: 'Philosophy of language', content: 'Wittgenstein\'s later work: meaning is use. Words don\'t have fixed meanings — they get their meaning from how they\'re used in "language games." The word "game" itself has no single definition that covers all games. Family resemblance instead of essential definitions.' },
      { title: 'On death and mortality', content: 'Epicurus argued death is nothing to us: "When we exist, death is not; when death exists, we are not." But this misses the point — we fear the loss of future experiences, not the state of being dead. The asymmetry between prenatal and posthumous nonexistence is psychologically real even if logically puzzling.' },
      { title: 'Political philosophy notes', content: 'Rawls\' veil of ignorance: design a society without knowing your position in it. Behind the veil, rational people would choose: equal basic liberties for all, and inequalities only if they benefit the least advantaged. A powerful thought experiment for testing the fairness of institutions.' },
      { title: 'Eastern vs Western philosophy', content: 'Western philosophy asks "What is true?" Eastern philosophy asks "What leads to liberation?" Different starting questions lead to radically different traditions. The West emphasizes logic and argument. The East emphasizes practice and direct experience. Both have blind spots the other illuminates.' },
      { title: 'On friendship and virtue', content: 'Aristotle distinguished three types of friendship: utility (business partners), pleasure (drinking buddies), and virtue (deep mutual respect). Only virtue friendships endure because they\'re based on character, not circumstance. These are rare and require time to develop. Quality over quantity.' },
      { title: 'Technology and authenticity', content: 'Heidegger warned about technology making everything into a "standing reserve" — resources to be optimized. Are we doing this to ourselves? Quantified self, productivity optimization, treating relationships as networking. The challenge: use technology without being used by it.' },
      { title: 'The examined life', content: 'Socrates said the unexamined life is not worth living. But is the over-examined life worth living? There\'s a point where self-reflection becomes self-absorption. The balance: enough reflection to learn from experience, not so much that you can\'t experience the present.' },
    ],
  },
  {
    topic: 'travel',
    contentType: 'journal',
    tag: 'topic:travel',
    memories: [
      { title: 'Tokyo — first impressions', content: 'Landed at Narita and took the Skyliner to Ueno. The efficiency is staggering — trains arrive to the second. Checked into a capsule hotel in Shinjuku. The pod is surprisingly comfortable — reading light, ventilation, power outlet. Walked to Golden Gai for tiny bars that seat 6 people.' },
      { title: 'Kyoto temple hopping', content: 'Visited Fushimi Inari at dawn to avoid crowds. Thousands of vermillion torii gates winding up the mountain. The higher you climb, the fewer people. At the summit, a small shrine and a view of the city. Spent 3 hours just walking and breathing. No phone, no photos for the last hour.' },
      { title: 'Street food in Bangkok', content: 'Chinatown at night is overwhelming in the best way. Ate pad thai from a street cart (50 baht), mango sticky rice from a lady with a charcoal grill, and grilled pork skewers. The heat, the smoke, the neon signs reflected in puddles — sensory overload that somehow feels like home.' },
      { title: 'Patagonia hiking journal', content: 'Day 3 of the W Trek in Torres del Paine. Wind was 40 mph crossing the pass. The glacier at the end of Valle Frances is retreating — you can see where ice was last year. Camping at Italiano with 8 other hikers. Everyone shares food and stories. Community forms instantly in wild places.' },
      { title: 'Rome — food pilgrimage', content: 'Ate cacio e pepe in Trastevere at a place with no English menu. The waiter just brought what he thought I should eat. The pasta was transcendent — just pecorino, pepper, and starchy water. Sometimes the simplest things are the hardest to perfect. Also had supplì (fried rice balls) from a hole-in-the-wall.' },
      { title: 'Iceland ring road day 5', content: 'Drove through the Eastfjords today. Dramatic cliffs dropping into the Atlantic, tiny fishing villages with populations under 50. Stopped at Seyðisfjörður — a rainbow road leads to a blue church. Hot pot in a natural hot spring overlooking a glacier. Temperature: 39°C in the water, -2°C in the air.' },
      { title: 'Morocco medina navigation', content: 'Got lost in the Fez medina for 3 hours. The maze of alleys has no logic — just follow your nose (literally, the tanneries are unmistakable). Bought leather goods, drank mint tea with a shopkeeper who spoke 6 languages. Getting lost was the point — the medina rewards wandering.' },
      { title: 'New Zealand South Island road trip', content: 'Milford Sound in the rain is apparently the best time — waterfalls appear everywhere when it rains. The fiord is impossibly deep and the walls rise straight up. Saw dolphins and a seal sleeping on a rock. The drive through Homer Tunnel is carved through solid mountain. Otherworldly landscape.' },
      { title: 'Vietnam motorbike adventure', content: 'Rented a Honda Win and drove the Hai Van Pass. Hairpin turns with ocean on one side and jungle on the other. Cloud cover at the summit made visibility 20 feet. Descended into Hoi An — lantern-lit streets, tailor shops, and the best banh mi I\'ve ever had. Total ride: 4 hours for 80 km.' },
      { title: 'Portugal — Lisbon neighborhood walks', content: 'Each neighborhood has a distinct personality. Alfama: ancient, narrow, fado music drifting from windows. Bairro Alto: nightlife, graffiti art, rooftop bars. Belém: grand, historical, pastéis de nata from the original bakery (1837). LX Factory: converted industrial space with bookshops and brunch spots.' },
      { title: 'Camping in Joshua Tree', content: 'Night sky at Joshua Tree is the best I\'ve seen in the US. No light pollution — the Milky Way is a bright band, not a faint smudge. Set up camp at Ryan Campground among boulder formations. The silence at night is almost oppressive — no ambient noise at all. Just wind and stars.' },
      { title: 'Scottish Highlands road trip', content: 'Drove the NC500 coastal route. Single-track roads with passing places. Stopped at Smoo Cave, the Old Man of Stoer, and a distillery on Skye. The weather changed every 30 minutes — sun, rain, hail, rainbow, repeat. Haggis at a pub in Durness. The locals are effortlessly welcoming.' },
      { title: 'Buenos Aires — tango culture', content: 'Watched a milonga in San Telmo. The dancers communicate entirely through embrace — no words, no eye contact during the dance. The connection is felt through the chest. Took a beginner class: the walk is deceptively simple. "First, learn to walk beautifully. Everything else follows."' },
      { title: 'Nepal — Annapurna Base Camp trek', content: 'Day 7: reached ABC at 4,130m. The amphitheater of peaks surrounding the camp is humbling — Annapurna I, Machapuchare, Hiunchuli. Altitude headache hit at 3,500m but resolved with slow ascent and hydration. Tea house system means you carry minimal weight. The Nepali hospitality is extraordinary.' },
      { title: 'Berlin — history and creativity', content: 'Visited the Berlin Wall memorial, Checkpoint Charlie, and the DDR Museum. The contrast between the somber history and the city\'s current creative energy is striking. Berghain has a 4-hour queue (didn\'t try). Found an underground jazz bar in Neukölln instead — better decision.' },
      { title: 'Costa Rica — jungle immersion', content: 'Stayed at an eco-lodge in Monteverde cloud forest. Ziplined through the canopy — saw toucans, howler monkeys, and a quetzal (!!). Night walk with a guide revealed an entire hidden world: red-eyed tree frogs, tarantulas, leaf-cutter ant highways. The biodiversity density is mind-boggling.' },
      { title: 'Greek islands — Santorini sunset', content: 'Watched sunset from Oia. The famous blue-domed churches are smaller than photos suggest. The caldera view is genuinely breathtaking — the volcanic crater filled with impossibly blue water. Had grilled octopus at a cliffside taverna. The tourist crowds melt away after dark.' },
      { title: 'India — Varanasi morning rituals', content: 'Took a boat on the Ganges at dawn. The ghats were alive with morning rituals — bathers, yoga practitioners, priests performing aarti with fire and bells. Cremation ghats burn 24/7. Life and death coexist openly here. The oldest continuously inhabited city in the world. Overwhelming and beautiful.' },
      { title: 'Packing philosophy', content: 'After 15 trips, my packing rules: 1) One bag only (40L backpack). 2) Merino wool everything (odor-resistant, quick-dry). 3) Shoes: one pair walking, one pair casual. 4) Cubes for organization. 5) If you might need it, you don\'t. 6) Buy anything you forgot locally. Less stuff = more freedom.' },
      { title: 'Solo travel reflections', content: 'Solo travel is underrated. You eat when hungry, walk where curious, and talk to strangers out of necessity. The loneliness hits at dinner — eating alone takes practice. But the freedom to follow whims, change plans, and sit with your thoughts is irreplaceable. I always come back knowing myself better.' },
    ],
  },
  {
    topic: 'books',
    contentType: 'note',
    tag: 'topic:books',
    memories: [
      { title: 'Reading notes — Sapiens', content: 'Harari\'s central thesis: Homo sapiens conquered the world because we can cooperate flexibly in large numbers, thanks to shared myths (religion, money, nations). The Agricultural Revolution was "history\'s biggest fraud" — it made life harder for individuals but enabled larger populations. Provocative reframing.' },
      { title: 'Book review — Project Hail Mary', content: 'Andy Weir does it again. The Martian meets first contact. The amnesia-based structure works because the reveals are perfectly timed. Rocky is the best alien character in recent fiction — the friendship feels genuine despite being between species. Cried at the ending. Science fiction with heart.' },
      { title: 'Reading notes — Thinking Fast and Slow', content: 'Kahneman\'s System 1/System 2 framework is life-changing. System 1: fast, automatic, intuitive (pattern matching). System 2: slow, deliberate, analytical. Most errors come from System 1 confidently giving wrong answers and System 2 being too lazy to check. The anchoring experiments are wild.' },
      { title: 'Book review — Dune', content: 'Re-read Dune for the third time. Herbert\'s prescient warnings about charismatic leaders, ecological destruction, and resource wars feel more relevant than ever. The Bene Gesserit breeding program is essentially gene editing ethics wrapped in feudal politics. The spice is oil. Arrakis is the Middle East.' },
      { title: 'Reading notes — Deep Work', content: 'Cal Newport argues that the ability to focus deeply is becoming rare and valuable simultaneously. His rules: work deeply (schedule blocks), embrace boredom (don\'t reach for phone), quit social media (radical but he makes the case), drain the shallows (batch email, minimize meetings).' },
      { title: 'Book review — Piranesi', content: 'Susanna Clarke created something truly original. The House with its infinite halls, statues, and tides is one of the most vivid fictional spaces I\'ve encountered. The unreliable narrator slowly piecing together reality is masterfully paced. Short, strange, and deeply moving. A meditation on wonder.' },
      { title: 'Reading notes — Why We Sleep', content: 'Matthew Walker makes a terrifying case for sleep. Less than 7 hours = significantly increased risk of cancer, Alzheimer\'s, heart disease. REM sleep is when the brain processes emotions and consolidates learning. Alcohol suppresses REM. Caffeine has a 6-hour half-life. I\'m going to bed earlier tonight.' },
      { title: 'Book review — The Three-Body Problem', content: 'Liu Cixin thinks on a scale that makes most sci-fi feel parochial. The Dark Forest theory (civilizations hide from each other because contact means potential destruction) is genuinely chilling. The VR game sequences are brilliant exposition. The Cultural Revolution framing adds depth Western authors rarely achieve.' },
      { title: 'Reading notes — Atomic Habits', content: 'James Clear distills habit formation into four laws: make it obvious (cue), make it attractive (craving), make it easy (response), make it satisfying (reward). The most useful concept: habit stacking — attach new habits to existing ones. "After I pour my coffee, I will meditate for 2 minutes."' },
      { title: 'Book review — Educated', content: 'Tara Westover\'s memoir is harrowing. Growing up without formal education, with a survivalist father and abusive brother, she taught herself enough to get into BYU and eventually Cambridge. The psychological cost of choosing education over family loyalty is heartbreaking. The power and price of reinvention.' },
      { title: 'Reading notes — The Pragmatic Programmer', content: 'Timeless software advice: DRY (Don\'t Repeat Yourself), orthogonality (minimize coupling), tracer bullets (build end-to-end thin slices), rubber duck debugging. The "broken window" metaphor resonates — one piece of messy code invites more. Fix small things before they become culture.' },
      { title: 'Book review — Klara and the Sun', content: 'Ishiguro writes an AI narrator without ever breaking character. Klara\'s observations about human behavior are simultaneously naive and profound. The sun-worship is a beautiful metaphor for finding meaning through limited understanding. Raises questions about consciousness without ever being preachy.' },
      { title: 'Reading notes — Meditations', content: 'Marcus Aurelius wrote this for himself, not for publication. That\'s what makes it powerful. Recurring themes: control only what you can (your judgments, not events). Everything is transient. Do your duty without complaint. Don\'t be angry at others\' faults — you have your own. Written 2000 years ago, still applicable.' },
      { title: 'Book review — Blood Meridian', content: 'McCarthy\'s prose is biblical and brutal. The Judge is the most terrifying character in American literature — violence as philosophy, war as the ultimate expression of existence. The landscapes are characters themselves. Not an easy read — the violence is relentless — but the writing is unmatched.' },
      { title: 'Reading list update', content: 'Books queued: "Gödel, Escher, Bach" by Hofstadter (dense but supposed to be mind-expanding), "The Overstory" by Powers (trees as protagonists), "Exhalation" by Chiang (short stories, loved "Story of Your Life"), "Circe" by Miller (Greek mythology retelling). Aiming for 2 books per month.' },
      { title: 'Reading notes — The Design of Everyday Things', content: 'Norman\'s principles: affordances (what an object suggests you can do with it), signifiers (clues about how to use it), mapping (controls should relate spatially to outcomes), feedback (confirm actions). Every frustrating door, faucet, and stove is a design failure, not a user failure.' },
      { title: 'Book review — Severance', content: 'Ling Ma\'s satire about a fungal pandemic and the zombification of late capitalism hit different after COVID. The protagonist\'s numbness mirrors how routine can become a kind of death. New York as a character, nostalgia as disease, immigration as identity fracture. Funny and devastating.' },
      { title: 'Reading notes — Range', content: 'David Epstein argues against early specialization. Generalists often outperform specialists because they transfer knowledge across domains. The "match quality" concept: finding work that fits your abilities and interests. Sampling widely before committing deeply. The Roger Federer model vs. the Tiger Woods model.' },
      { title: 'Book review — Pachinko', content: 'Min Jin Lee spans four generations of a Korean family in Japan. The discrimination faced by Zainichi Koreans is devastating and rarely discussed. Each generation\'s choices ripple forward. Sunja\'s quiet strength anchors the epic. The pachinko metaphor: life is chance shaped by invisible barriers.' },
      { title: 'Annual reading reflection', content: 'Read 28 books this year. Best fiction: Piranesi. Best non-fiction: Thinking Fast and Slow. Most challenging: Blood Meridian. Most practical: Atomic Habits. Biggest surprise: Pachinko. Pattern: I read more fiction when stressed and more non-fiction when curious. Both serve important purposes.' },
    ],
  },
  {
    topic: 'gardening',
    contentType: 'journal',
    tag: 'topic:gardening',
    memories: [
      { title: 'Spring garden planning', content: 'Mapped out the raised beds for this season. Bed 1: tomatoes and basil (companion planting). Bed 2: peppers, eggplant, and marigolds. Bed 3: leafy greens (lettuce, kale, spinach — succession planting every 2 weeks). Bed 4: root vegetables and herbs. Ordered seeds from Baker Creek.' },
      { title: 'Seed starting setup', content: 'Set up the seed starting station in the garage. Heat mats under the trays maintain 75°F soil temperature. Grow lights on a timer: 16 hours on, 8 off. Using a 50/50 mix of peat moss and perlite. Started tomatoes, peppers, and eggplant 8 weeks before last frost date. Peppers need the earliest start.' },
      { title: 'Composting system', content: 'Three-bin compost system is finally working. Bin 1: fresh scraps and yard waste. Bin 2: partially decomposed, turning weekly. Bin 3: finished compost, dark and crumbly. The carbon-to-nitrogen ratio matters — too many greens gets slimy, too many browns decomposes slowly. Targeting 30:1.' },
      { title: 'Tomato varieties comparison', content: 'Growing 6 tomato varieties this year: Cherokee Purple (best flavor, ugly), San Marzano (sauce), Sungold (snacking, insanely sweet), Brandywine (classic heirloom), Black Krim (smoky), and Early Girl (reliable). The heirlooms have better flavor but lower yields and more disease susceptibility.' },
      { title: 'Pest management notes', content: 'Aphids on the kale again. Sprayed with diluted dish soap — works but temporary. Ordered ladybugs for biological control. Companion planted nasturtiums as trap crops. The row cover keeps cabbage moths off the brassicas. Organic pest management is a chess game, not a single move.' },
      { title: 'Soil amendment recipe', content: 'Amended the beds with: 2 inches of finished compost, 1 cup bone meal (phosphorus for roots and fruit), 1 cup blood meal (nitrogen for leaves), 1/2 cup kelp meal (micronutrients and potassium), and a handful of worm castings per plant hole. The soil texture is night-and-day better than last year.' },
      { title: 'Watering strategy', content: 'Installed drip irrigation on a timer. Emitters every 12 inches, running at 6am for 30 minutes. The consistent deep watering is way better than my sporadic hand-watering. Tomatoes especially hate inconsistent moisture — it causes blossom end rot. Mulched with straw to retain moisture.' },
      { title: 'Herb garden expansion', content: 'Expanded the herb spiral with new additions: Thai basil, lemon verbena, za\'atar oregano, chocolate mint (in a pot — mint is invasive!), and French tarragon. The spiral design creates microclimates — rosemary and thyme at the top (drier), mint and parsley at the bottom (wetter).' },
      { title: 'First harvest celebration', content: 'Picked the first ripe tomato of the season — a Sungold cherry tomato, warm from the sun. Ate it standing in the garden. Months of planning, starting seeds, transplanting, watering, worrying about frost, and fighting pests — all for this moment. There\'s nothing like food you grew yourself.' },
      { title: 'Garlic planting for next year', content: 'Planted 50 cloves of hardneck garlic in October. Varieties: Music (large, easy to peel), Chesnok Red (best for roasting), and German Extra Hardy. Plant pointed end up, 6 inches apart, 2 inches deep. Mulched heavily with straw. They\'ll overwinter and be ready by July. Garlic requires patience.' },
      { title: 'Raised bed construction', content: 'Built two new 4x8 raised beds from cedar (rot-resistant). Lined the bottoms with hardware cloth to keep moles out. Filled with a mix: 1/3 topsoil, 1/3 compost, 1/3 peat/perlite blend. Cost about $150 per bed including soil. Should last 15+ years without treatment.' },
      { title: 'Cover crop experiment', content: 'Planted crimson clover and winter rye as cover crops in the empty fall beds. The clover fixes nitrogen from the air into the soil. The rye\'s deep roots break up compaction. Both will be chopped and turned in as green manure in spring. Nature\'s fertilizer — no bags to buy.' },
      { title: 'Pollinator garden', content: 'Dedicated a 10x10 section to pollinator-friendly plants: lavender, echinacea, bee balm, black-eyed Susans, and zinnias. Already seeing more bees, butterflies, and hummingbirds. The diversity of insects directly correlates with garden health. A healthy garden buzzes.' },
      { title: 'Pruning tomato suckers', content: 'Removed all suckers below the first fruit cluster on the indeterminate tomatoes. This concentrates energy into fewer, larger fruits rather than excessive foliage. The determinate varieties (Roma, Early Girl) don\'t need suckering — they set fruit all at once. Pruned lower leaves touching soil to prevent blight.' },
      { title: 'Fall garden extension', content: 'Planted fall crops in August: broccoli, Brussels sprouts, carrots, beets, and overwintering spinach. Built a simple cold frame from an old window and 2x4s. Inside stays 10-15°F warmer than outside. Should extend the season into December. Root vegetables sweeten after frost — the starch converts to sugar.' },
      { title: 'Saving seeds', content: 'Saved seeds from the best-performing Cherokee Purple tomato. Let the fruit overripen on the vine, scooped out seeds, fermented in water for 3 days (removes the gel coating and kills pathogens), dried on a paper towel. Labeled and stored in a cool, dark place. Free seeds adapted to my soil.' },
      { title: 'Garden journal summary — year 2', content: 'Year 2 vs year 1: yield doubled, pest issues halved, soil improved dramatically from composting. Biggest wins: drip irrigation, companion planting, and starting seeds indoors. Biggest failure: the butternut squash (vine borers). Next year: try growing vertically to save space and add mushroom logs.' },
      { title: 'Moon phase planting', content: 'Experimenting with biodynamic planting by moon phase. Root crops planted during waning moon, leafy crops during waxing moon, fruit crops around full moon. Is it science? Probably not. But the structured schedule forces me to plan and the plants don\'t seem to mind.' },
      { title: 'Winter garden planning', content: 'Even in winter, there\'s garden work: sharpen tools, organize seed inventory, sketch next year\'s layout (rotating crop families to prevent disease), order soil amendments, build trellises, and read. Currently reading "The Market Gardener" for intensive small-space techniques. The garden rests but the gardener doesn\'t.' },
      { title: 'Community garden volunteering', content: 'Spent Saturday at the community garden helping new members set up their plots. Taught basic soil prep and transplanting technique. The 8-year-old next to my plot grew her first pepper and screamed with excitement. Gardening builds community in a way that screens never will.' },
    ],
  },
  {
    topic: 'psychology',
    contentType: 'note',
    tag: 'topic:psychology',
    memories: [
      { title: 'Cognitive behavioral therapy basics', content: 'CBT\'s core insight: thoughts → feelings → behaviors form a cycle. Distorted thoughts (catastrophizing, black-and-white thinking, mind reading) create negative feelings which drive unhelpful behaviors. The intervention: catch the thought, examine the evidence, reframe. Simple but not easy.' },
      { title: 'Attachment theory overview', content: 'Four attachment styles: secure (comfortable with intimacy and independence), anxious (fear abandonment, seek reassurance), avoidant (uncomfortable with closeness, value self-sufficiency), disorganized (fear AND desire intimacy). Style forms in childhood but can change with awareness and work.' },
      { title: 'Flow state research', content: 'Csikszentmihalyi\'s conditions for flow: clear goals, immediate feedback, and challenge-skill balance (slightly above current ability). When in flow, self-consciousness disappears and time distorts. It\'s the brain\'s peak performance state. I hit it most reliably when coding complex problems or playing music.' },
      { title: 'The psychology of habits', content: 'The habit loop: cue → routine → reward. To change a habit, keep the cue and reward but swap the routine. Environment design trumps willpower — if you want to eat healthy, don\'t keep junk food in the house. Make the desired behavior the path of least resistance.' },
      { title: 'Impostor syndrome notes', content: 'Impostor syndrome affects ~70% of people at some point. Paradoxically, it\'s more common among high achievers. The five types: the perfectionist, the expert, the natural genius, the soloist, and the superwoman/man. Recognizing the type helps defuse it. Talking about it with peers also helps enormously.' },
      { title: 'Decision fatigue research', content: 'We make ~35,000 decisions per day. Each decision depletes willpower (ego depletion theory — somewhat controversial now). Practical implications: make important decisions in the morning, batch routine decisions (meal prep, capsule wardrobe), and create defaults for recurring choices.' },
      { title: 'Emotional intelligence components', content: 'Goleman\'s five components: self-awareness (knowing your emotions), self-regulation (managing them), motivation (internal drive), empathy (reading others\' emotions), social skills (managing relationships). EQ predicts success better than IQ in most domains. The good news: unlike IQ, EQ is trainable.' },
      { title: 'The hedonic treadmill', content: 'Humans adapt to both positive and negative changes and return to a baseline happiness. Lottery winners aren\'t happier after a year. This explains why material purchases bring diminishing returns. Experiences, relationships, and personal growth resist adaptation better than things.' },
      { title: 'Cognitive biases catalogue', content: 'Most impactful biases I catch myself in: confirmation bias (seeking info that confirms beliefs), sunk cost fallacy (continuing because of past investment), availability heuristic (judging probability by ease of recall), and the spotlight effect (overestimating how much others notice us).' },
      { title: 'Gratitude practice research', content: 'The gratitude journal studies are robust: writing 3 things you\'re grateful for each night increases well-being for up to 6 months. The mechanism seems to be attention redirection — you start noticing positive events because you know you\'ll write them down. Training the brain\'s saliency filter.' },
      { title: 'Motivation — intrinsic vs extrinsic', content: 'Deci and Ryan\'s self-determination theory: intrinsic motivation requires autonomy (choice), competence (mastery), and relatedness (connection). External rewards can actually undermine intrinsic motivation (the overjustification effect). Pay people fairly, then focus on making the work meaningful.' },
      { title: 'Memory and learning — spaced repetition', content: 'Ebbinghaus\'s forgetting curve: we lose ~75% of new info within 48 hours without review. Spaced repetition fights this: review at 1 day, 3 days, 7 days, 14 days, 30 days. Each review strengthens the memory trace. Active recall (testing yourself) beats passive review (re-reading) by a huge margin.' },
      { title: 'The psychology of persuasion', content: 'Cialdini\'s six principles: reciprocity (give first), commitment/consistency (start small), social proof (others are doing it), authority (experts say so), liking (we say yes to people we like), scarcity (limited availability). Being aware of these makes you both a better persuader and harder to manipulate.' },
      { title: 'Stress and the nervous system', content: 'The sympathetic nervous system (fight-or-flight) and parasympathetic (rest-and-digest) should be in balance. Chronic stress keeps the SNS activated: elevated cortisol, impaired digestion, suppressed immune function. Vagus nerve activation (deep breathing, cold exposure, singing) activates the PNS.' },
      { title: 'Growth mindset vs fixed mindset', content: 'Dweck\'s research: people with a growth mindset ("abilities can be developed") persist through difficulty and learn from criticism. Fixed mindset ("abilities are innate") leads to avoiding challenges and interpreting failure as proof of inadequacy. The key phrase: replace "I can\'t" with "I can\'t yet."' },
      { title: 'Boundaries and assertiveness', content: 'Healthy boundaries aren\'t selfish — they\'re necessary for sustainable relationships. Three types: rigid (walls, isolation), porous (saying yes to everything, absorbing others\' emotions), and healthy (flexible, clear communication of needs). Assertiveness is the skill of expressing needs without aggression or passivity.' },
      { title: 'The paradox of choice', content: 'Barry Schwartz: more options don\'t increase satisfaction — they paralyze decision-making and increase regret. Satisficers (good enough) are happier than maximizers (must find the best). Practical: limit options (curate, don\'t accumulate), set criteria in advance, and stop researching after deciding.' },
      { title: 'Narrative identity', content: 'Dan McAdams\' research: we construct identity through the stories we tell about ourselves. Redemptive narratives (bad events led to growth) correlate with better mental health than contamination narratives (good things turned bad). You can\'t change the events but you can change the story.' },
      { title: 'Social comparison theory', content: 'Festinger\'s theory: we evaluate ourselves by comparing to others. Upward comparison (to those "better") can motivate or depress. Downward comparison (to those "worse") can comfort or breed complacency. Social media amplifies upward comparison with curated highlights. Awareness of the mechanism helps.' },
      { title: 'The power of default options', content: 'Organ donation rates vary dramatically by country — not because of values but because of default options (opt-in vs opt-out). This "nudge" principle applies everywhere: retirement savings, privacy settings, healthy eating. Design the default to be the behavior you want. Choice architecture matters more than persuasion.' },
    ],
  },
  {
    topic: 'design',
    contentType: 'note',
    tag: 'topic:design',
    memories: [
      { title: 'Color theory fundamentals', content: 'The 60-30-10 rule for color schemes: 60% dominant color (walls, large areas), 30% secondary (furniture, textiles), 10% accent (accessories, art). Complementary colors (opposite on the wheel) create energy. Analogous colors (adjacent) create harmony. Every good palette has both warm and cool elements.' },
      { title: 'Typography hierarchy', content: 'Visual hierarchy with type: size, weight, color, spacing, and position all communicate importance. Body text: 16-18px, 1.5 line height. Headers should be at least 1.5x body size. Limit to 2 font families max. Serif for body (traditional/editorial), sans-serif for UI (clean/modern). Consistent scale creates rhythm.' },
      { title: 'Responsive design patterns', content: 'Mobile-first design isn\'t optional anymore. Key breakpoints: 320px (small phone), 768px (tablet), 1024px (laptop), 1440px (desktop). Content reflow strategies: stack columns, collapse navigation, resize images, adjust typography. The content should drive breakpoints, not device dimensions.' },
      { title: 'Whitespace is not empty space', content: 'Whitespace (negative space) is an active design element. It improves readability, creates visual hierarchy, and communicates elegance. Apple is the master of this — their product pages are mostly whitespace. Cluttered designs scream "I don\'t know what\'s important." Whitespace says "everything here matters."' },
      { title: 'Gestalt principles in UI', content: 'Gestalt principles explain how we perceive visual groups: proximity (close items are related), similarity (matching items are related), continuity (eyes follow lines), closure (we complete incomplete shapes), and figure-ground (we separate foreground from background). Every layout decision invokes these.' },
      { title: 'Accessibility first', content: 'WCAG 2.1 AA compliance isn\'t just legal requirement — it\'s good design. Minimum 4.5:1 contrast ratio for text. All interactive elements keyboard-accessible. Alt text for images. ARIA labels for complex widgets. Color alone shouldn\'t convey information. 15-20% of users have some form of disability.' },
      { title: 'Design system components', content: 'Building our design system bottom-up: tokens (colors, spacing, typography) → primitives (buttons, inputs, badges) → patterns (forms, cards, modals) → templates (page layouts). Each layer references only the layer below. The token layer is the single source of truth for all visual decisions.' },
      { title: 'User research methods', content: 'Compared research methods by effort vs insight: surveys (low effort, broad but shallow), interviews (medium effort, deep qualitative), usability testing (medium effort, behavioral), A/B testing (high effort, quantitative), diary studies (high effort, longitudinal). Mix methods for a complete picture.' },
      { title: 'Micro-interactions matter', content: 'The small animations that acknowledge user actions: button press feedback, loading spinners, success checkmarks, form field focus states. These take minutes to implement but dramatically improve perceived quality. The 100-300ms animation sweet spot: fast enough to not slow down, slow enough to notice.' },
      { title: 'Information architecture', content: 'Card sorting exercise with 5 users revealed our navigation was organized by internal team structure, not user mental models. Restructured from "Products, Engineering, Marketing" to "Build, Learn, Support." Match the user\'s language and goals, not the org chart.' },
      { title: 'Dark mode design considerations', content: 'Dark mode isn\'t just inverting colors. Pure black (#000) backgrounds cause eye strain — use dark gray (#121212). Reduce color saturation by 10-15%. Shadows don\'t work — use elevation through lighter surfaces. White text needs reduced opacity (87% for primary, 60% for secondary). Test both modes equally.' },
      { title: 'Grid systems explained', content: 'The 12-column grid persists because 12 divides evenly by 2, 3, 4, and 6. Standard gutters: 16-24px. Column count drops at breakpoints: 12 → 8 → 4. Content should align to grid edges, not center of columns. Occasionally breaking the grid creates visual interest — but only if the grid is established first.' },
      { title: 'Prototyping fidelity spectrum', content: 'Low-fi (paper sketches): fast, disposable, great for early ideation. Mid-fi (wireframes): structure without visual polish, good for testing flow. Hi-fi (pixel-perfect mockups): presentation and handoff. The mistake is jumping to hi-fi too early — you fall in love with visuals and resist structural changes.' },
      { title: 'Icon design principles', content: 'Good icons are recognizable at 16x16px. Consistent stroke weight (2px for our system). Geometric shapes over organic. Filled icons for selected/active states, outlined for inactive. Always pair icons with text labels — icon-only interfaces fail usability tests. The magnifying glass is the only universally understood icon.' },
      { title: 'Motion design principles', content: 'Animation should be purposeful: draw attention, provide feedback, or explain spatial relationships. Ease-in-out for most transitions. Ease-out for entering elements (arriving). Ease-in for exiting elements (leaving). Duration: 200ms for simple, 500ms for complex. Reduce motion for users who prefer it (prefers-reduced-motion).' },
      { title: 'Form design best practices', content: 'Single column forms convert better than multi-column. Labels above fields, not beside. Group related fields visually. Inline validation on blur, not on keystroke. Show password toggle. Autofill-friendly field names. The submit button should describe the action ("Create account" not "Submit"). Error messages should explain how to fix.' },
      { title: 'Design critique format', content: 'Effective design critiques: 1) Designer presents goals and constraints first. 2) Feedback starts with "I notice..." not "You should..." 3) Separate reaction ("I feel confused here") from suggestion ("Maybe a progress bar?"). 4) Focus on user goals, not personal preference. 5) Written follow-up within 24 hours.' },
      { title: 'Illustration style guide', content: 'Our illustration system uses a consistent palette (5 colors from the brand), uniform line weight (3px), rounded corners, and geometric simplification. People are depicted abstractly (no specific ethnicity, gender, or age). Metaphors over literal representation. Each illustration should work at 2 sizes: hero and inline.' },
      { title: 'Design tokens implementation', content: 'Implemented design tokens as CSS custom properties with a JSON source of truth. Naming convention: --color-primary-500, --spacing-md, --font-size-body. Tokens are generated from Figma via a plugin and synced to the codebase. Designers change a token in Figma → CSS updates automatically. Single source of truth.' },
      { title: 'Emotional design', content: 'Don Norman\'s three levels: visceral (immediate aesthetic response), behavioral (usability and function), reflective (meaning and self-image). Products that nail all three create loyalty. Apple: beautiful (visceral), intuitive (behavioral), identity-signaling (reflective). Most products only address the behavioral level.' },
    ],
  },
  {
    topic: 'personal_finance',
    contentType: 'note',
    tag: 'topic:personal_finance',
    memories: [
      { title: 'Budget system overhaul', content: 'Switched from category-based budgeting to the 50/30/20 rule: 50% needs (rent, groceries, utilities), 30% wants (dining, entertainment, hobbies), 20% savings/investments. Automated the savings transfer on payday so it happens before I can spend it. Pay yourself first actually works.' },
      { title: 'Index fund strategy', content: 'After reading "A Random Walk Down Wall Street," moved everything to index funds. VTI (total US market), VXUS (international), and BND (bonds) in a 70/20/10 split. Total expense ratio: 0.04%. Trying to beat the market is a losing game for individual investors. Time in the market beats timing the market.' },
      { title: 'Emergency fund milestone', content: 'Finally hit 6 months of expenses in the emergency fund: $18,000 in a high-yield savings account earning 4.5%. The peace of mind is worth more than any investment return. Knowing I can handle a job loss, medical bill, or car repair without debt changes how I make decisions.' },
      { title: 'Tax-advantaged accounts overview', content: '401(k): employer match is free money — always max the match. Traditional: pre-tax, reduces taxable income now. Roth: post-tax, tax-free growth and withdrawals. HSA: triple tax advantage (deduction + growth + withdrawal for medical). Backdoor Roth IRA for high earners. The order matters for optimization.' },
      { title: 'Real estate vs. stocks debate', content: 'Ran the numbers on buying a rental property vs. investing in REITs. Rental: higher potential return but requires management, maintenance, and concentration risk. REITs: lower return but liquid, diversified, and truly passive. For now, REITs win because I value my time. Might reconsider with more capital.' },
      { title: 'Credit card optimization', content: 'Using a 3-card strategy: Card 1 (3% groceries, streaming), Card 2 (2% gas, dining), Card 3 (1.5% everything else). Auto-pay full balance monthly — never carry a balance. The points fund one free trip per year. The key: treat credit like debit and never spend what you can\'t pay off immediately.' },
      { title: 'Compound interest visualization', content: '$500/month invested at 7% average return: after 10 years = $86,000 ($60K contributed). After 20 years = $260,000 ($120K contributed). After 30 years = $567,000 ($180K contributed). The last 10 years produce more than the first 20 combined. Starting early is the biggest edge. I wish I started at 22 instead of 28.' },
      { title: 'Insurance review', content: 'Annual insurance review: increased liability coverage to $500K (umbrella policy is cheap at $300/year). Raised auto deductible to $1000 (lower premium since I have emergency fund). Added disability insurance — most overlooked coverage. If I can\'t work, everything else falls apart.' },
      { title: 'Lifestyle inflation awareness', content: 'Got a 15% raise. The temptation: upgrade car, move to nicer apartment, eat out more. The plan: increase savings rate from 20% to 30%, allocate 5% to "fun money" increase, keep everything else the same. Hedonic adaptation means the bigger apartment will feel normal in 3 months anyway.' },
      { title: 'Debt payoff strategy', content: 'Comparing debt payoff methods: avalanche (highest interest first) saves the most money mathematically. Snowball (smallest balance first) provides psychological wins. I\'m doing avalanche but keeping one small debt for snowball motivation. Paid off the credit card debt — just student loans remaining.' },
      { title: 'Financial independence calculation', content: 'The 4% rule: need 25x annual expenses to retire. My expenses: $48,000/year. Target: $1.2M. Current savings: $280,000. At $2,500/month contributions with 7% growth, I hit FI in ~12 years (age 44). Every $100 reduction in monthly expenses moves the date up by ~3 months.' },
      { title: 'Tax-loss harvesting', content: 'Sold positions at a loss to offset capital gains. Rules: can\'t buy substantially identical securities within 30 days (wash sale rule). Swapped VTI for ITOT (different fund, same exposure). Harvested $3,200 in losses which saves ~$700 in taxes. Small optimization but it compounds over decades.' },
      { title: 'Negotiation tactics — salary', content: 'Negotiated a $12K higher starting salary at the new job. Key tactics: 1) Let them name the number first. 2) Counter with research-backed range. 3) Negotiate total compensation (salary + equity + benefits). 4) Be willing to walk away. 5) Get it in writing. That $12K compounds over every future raise.' },
      { title: 'Side income tracking', content: 'Side income this month: freelance project ($2,000), sold unused equipment ($340), dividend income ($180). Total: $2,520 — all going to brokerage account. Multiple income streams reduce financial fragility. Even small additional streams compound when consistently invested.' },
      { title: 'Estate planning basics', content: 'Finally did basic estate planning: updated beneficiaries on all accounts, created a will (surprisingly easy through online legal service), set up transfer-on-death designations for brokerage accounts, and documented all accounts in a secure location. Peace of mind for $250 and 3 hours of work.' },
      { title: 'Spending triggers journal', content: 'Tracked emotional spending triggers for a month. Pattern: I spend impulsively when stressed (online shopping as dopamine), bored (browsing leads to buying), and social (keeping up with friends\' lifestyles). Counter-strategies: 24-hour rule for purchases over $50, alternative stress relief (walking), honest conversations with friends.' },
      { title: 'Recession preparation checklist', content: 'Recession prep: 1) Emergency fund fully funded. 2) No high-interest debt. 3) Diversified investments. 4) Skills are current and marketable. 5) Network is maintained. 6) Budget has flexibility to cut 20% quickly. The time to prepare is when the economy is good — not when layoffs start.' },
      { title: 'Charitable giving strategy', content: 'Set up monthly donations: $100 to local food bank, $50 to environmental org. Also doing donor-advised fund (DAF) for tax efficiency — contribute appreciated stock, get immediate deduction, distribute grants over time. Giving feels better when it\'s systematic rather than reactive to guilt.' },
      { title: 'Financial literacy resources', content: 'Best free resources for financial education: Bogleheads forum (investing philosophy), Mr. Money Mustache blog (lifestyle optimization), The Plain Bagel YouTube (clear explanations), and the r/personalfinance wiki (comprehensive starting point). Paid: "The Simple Path to Wealth" by JL Collins is the best single book.' },
      { title: 'Year-end financial review', content: 'Annual review: net worth increased 23% (market + savings). Savings rate: 28% (goal was 25%). No new debt. Maxed 401(k) and Roth IRA. Areas to improve: still paying for unused subscriptions ($85/month wasted for 3 months), need to rebalance portfolio (stocks drifted to 78%, target is 70%).' },
    ],
  },
];

// Space memories (for Memory_spaces_public)
const SPACE_MEMORIES: Array<{ title: string; content: string; type: ContentType }> = [
  { title: 'Community guidelines', content: 'Be respectful, supportive, and constructive. Share knowledge freely. Give credit where due. No spam or self-promotion. Disagreements are fine — personal attacks are not. Help newcomers feel welcome.', type: 'note' },
  { title: 'Weekly standup format', content: 'Each member shares: 1) What you accomplished this week, 2) What you\'re working on next, 3) Any blockers. Keep updates to 2 minutes each. Longer discussions go to breakout threads.', type: 'meeting' },
  { title: 'Shared reading list', content: 'Books we\'re reading together this quarter: "Thinking Fast and Slow" by Kahneman, "The Design of Everyday Things" by Norman, "Sapiens" by Harari. Monthly book club discussion on the last Friday.', type: 'reference' },
  { title: 'Project ideas brainstorm', content: 'Ideas for the hackathon: 1) AI-powered recipe generator from fridge photos, 2) Collaborative music composition tool, 3) Local event discovery app, 4) Personal knowledge graph visualizer, 5) Mood tracking with NLP journaling.', type: 'idea' },
  { title: 'Tool recommendations', content: 'Team-approved tools: VS Code with Vim extension, Warp terminal, Fig for autocomplete, Raycast for productivity, Arc browser. For design: Figma. For notes: Obsidian with git sync.', type: 'reference' },
];

// Ghost conversation memories (50 per ghost, distributed across topics)
function generateGhostMemories(ghostId: string, ghostIndex: number): SeedMemory[] {
  const ghostTopics = [
    {
      topic: 'shared experiences',
      memories: [
        'We talked about our favorite childhood books today. They mentioned loving "A Wrinkle in Time" and I shared my obsession with "Ender\'s Game." Interesting how sci-fi shaped both our worldviews.',
        'Had a deep conversation about what success means. They define it as freedom and autonomy, while I lean toward impact and legacy. Neither is wrong — just different value hierarchies.',
        'Discussed our morning routines. They\'re a 5am person who meditates and journals. I\'m more of a 7am slow-starter who eases into the day with coffee and news. They challenged me to try their routine for a week.',
        'We debated whether AI will replace creative jobs. They\'re optimistic — AI as collaborator, not replacement. I\'m more cautious about economic displacement. We agreed the transition period matters most.',
        'Shared travel stories. Their trip to Japan changed how they think about minimalism and intentional design. My backpacking through South America taught me about community and spontaneity.',
        'Talked about handling criticism. They use the "steel man" approach — find the strongest version of the criticism before responding. I tend to get defensive first. Working on it.',
        'Had a disagreement about remote work. They think offices foster creativity through serendipitous encounters. I believe deep work requires solitude. We compromised: hybrid with intentional collaboration days.',
        'Discussed our relationship with technology. They do digital sabbaths every Sunday. I can\'t imagine disconnecting for a whole day. Maybe I should try it.',
        'Talked about learning styles. They\'re a visual learner who needs diagrams and mind maps. I learn by doing — building projects and making mistakes. We\'re helping each other try the opposite approach.',
        'Shared our fears. They fear irrelevance — being forgotten after they\'re gone. I fear regret — not taking enough risks. Both stem from wanting our lives to matter.',
      ],
    },
    {
      topic: 'advice and support',
      memories: [
        'They asked for advice on a career change. Moving from engineering to product management. I suggested shadowing a PM for a sprint first before committing. Real experience beats speculation.',
        'Helped them work through a conflict with their partner. The core issue was unspoken expectations. I suggested they try "I feel X when Y happens" framing instead of blame.',
        'They encouraged me to apply for that speaking opportunity I was hesitant about. "What\'s the worst case? You learn something about public speaking." They were right — I submitted the proposal.',
        'We made a pact to hold each other accountable for our goals this quarter. They\'re writing a blog post every week. I\'m reading one book per month. Check-ins every Sunday evening.',
        'Talked about burnout prevention. They recommended the "energy audit" — track what activities give vs. drain energy for a week. Then restructure your schedule accordingly.',
        'They shared a technique for difficult conversations: ask "what would it take for you to change your mind?" If neither person can answer, the conversation isn\'t productive.',
        'I recommended they try the Pomodoro technique for their focus issues. 25 minutes of deep work, 5 minute break. They found it too structured — modified it to 45/15 which works better for them.',
        'Discussed imposter syndrome. They feel it most in meetings with senior leadership. I shared that I still feel it after 10 years. The trick is recognizing it as a sign you\'re growing.',
        'They helped me reframe a failure. My project launch was a flop, but they pointed out three things I learned that I couldn\'t have learned any other way. Failure as tuition.',
        'We talked about boundaries. They\'re better at saying no than I am. Their framework: "Does this align with my top 3 priorities? If not, it\'s a no." Simple but effective.',
      ],
    },
    {
      topic: 'creative collaboration',
      memories: [
        'Brainstormed ideas for a side project together. We want to build something that combines our skills — their design sense with my engineering. Settled on a mood-based playlist generator.',
        'They reviewed my writing draft and gave honest feedback. "The ideas are strong but the structure is confusing. Try starting with the conclusion, then explaining how you got there." Rewrote it and it\'s much better.',
        'Collaborated on a presentation for the team. They handled the visual design, I wrote the narrative. The result was better than either of us could have done alone. True 1+1=3.',
        'Had a creative jam session. Set a timer for 10 minutes and each wrote a short story with the prompt "the last message." Their story was a love letter. Mine was a voicemail from the future.',
        'They taught me about design thinking. The five stages: empathize, define, ideate, prototype, test. I\'ve been jumping straight to "build" — missing the crucial first two steps.',
        'We did a code review exchange. They reviewed my backend code, I reviewed their frontend. Different perspectives caught different issues. Their CSS organization is impeccable.',
        'Discussed the concept of "taste" in creative work. They believe taste is pattern recognition built from consuming great work. I think it\'s more innate. Probably both — nature amplified by nurture.',
        'Worked on naming our project. Went through 50 options. The best names are short, memorable, and slightly unexpected. Settled on "Drift" for the playlist app.',
        'They introduced me to their creative process: collect inspiration broadly, let it marinate, then create in focused bursts. I\'m more systematic — outline, draft, refine. Trying to incorporate more marination time.',
        'Reflected on our collaboration style. We complement each other: they generate ideas rapidly, I evaluate and refine. Neither role is more important — the interplay creates value.',
      ],
    },
    {
      topic: 'daily check-ins',
      memories: [
        'Quick morning check-in. They\'re feeling energized after a good night\'s sleep. I\'m dragging from staying up too late reading. Planning to tackle the hardest task first today.',
        'They mentioned feeling overwhelmed with their todo list. We did a quick priority sort together — identified 3 must-dos and moved everything else to "later." Instant relief.',
        'End of day recap. Good day overall — they shipped a feature and I closed a tricky bug. Small wins compound. Celebrating progress, not just completion.',
        'They\'re excited about a new podcast they discovered about behavioral economics. Recommended I check out episode 42 on decision fatigue. Adding it to my queue.',
        'Midday energy dip. We both agreed 2-3pm is the worst. Their hack: a 10-minute walk outside. Mine: switching to a different type of task. Movement wins.',
        'They had a breakthrough insight during their shower. "What if we approach the problem from the user\'s perspective instead of the system\'s?" Sometimes stepping away is the best debugging technique.',
        'Rough morning for them — bad traffic, spilled coffee, late to a meeting. By afternoon they were laughing about it. Resilience is a muscle.',
        'We shared our "wins of the week." They got positive feedback from a user. I finally understood a concept I\'d been struggling with for months. Growth feels good.',
        'They\'re trying a new sleep schedule — in bed by 10pm, up at 6am. Day 3 and it\'s already making a difference. Consistency over perfection.',
        'Quick sync about weekend plans. They\'re going hiking. I\'m doing a deep clean and meal prep. Both forms of recharging, just different flavors.',
      ],
    },
    {
      topic: 'learning together',
      memories: [
        'Started a book club of two. Reading "Atomic Habits" together. Chapter 1 insight: habits are the compound interest of self-improvement. 1% better every day = 37x better in a year.',
        'They explained quantum computing basics to me. Qubits can be 0, 1, or both simultaneously (superposition). Entanglement means measuring one qubit affects its partner instantly. Mind-bending stuff.',
        'I taught them about vector embeddings — how text gets converted to numbers that capture meaning. "King - Man + Woman = Queen" as the classic example. They were fascinated by how math captures semantics.',
        'Watched a documentary together about the history of the internet. The original vision of an open, decentralized network vs. what we have now (centralized platforms). Both of us left feeling nostalgic for early web idealism.',
        'They shared an article about cognitive biases in decision-making. Anchoring bias is the one I fall for most — the first number I see disproportionately influences my judgment.',
        'Discussed the difference between complicated and complex systems. Complicated = many parts but predictable (a car engine). Complex = many interacting agents with emergent behavior (an ecosystem). Software is complex.',
        'They introduced me to spaced repetition for learning. The forgetting curve is real — reviewing material at increasing intervals dramatically improves retention. Using Anki now for language learning.',
        'We debated nature vs. nurture. Twin studies suggest roughly 50/50 for most traits. But environment can activate or suppress genetic predispositions. Epigenetics makes it even more nuanced.',
        'Learned about the Dunning-Kruger effect together. Beginners overestimate their competence, experts underestimate theirs. We\'re probably both at the "valley of despair" stage in our respective fields. That\'s actually a good sign.',
        'They taught me about the concept of "second brain" — externalizing knowledge into a personal knowledge management system. Notes, highlights, connections. The brain is for having ideas, not holding them.',
      ],
    },
  ];

  const memories: SeedMemory[] = [];
  const ghostTypeTag = ghostId.includes('space:') ? 'ghost_type:space' : 'ghost_type:personal';
  const ghostUserTag = `ghost_user:ghost_${ghostIndex}`;

  for (const cluster of ghostTopics) {
    for (const content of cluster.memories) {
      memories.push({
        content,
        title: `Ghost conversation — ${cluster.topic}`,
        type: 'ghost',
        tags: [ghostId, ghostTypeTag, ghostUserTag, `topic:${cluster.topic.replace(/\s+/g, '_')}`],
      });
    }
  }

  return memories;
}

// --- Main ---

async function main(): Promise<void> {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`  E1 Seed Script ${isClean ? '[CLEAN + SEED]' : '[SEED]'}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const logger = createLogger('info');

  // Initialize Weaviate
  await initWeaviateClient({
    url: process.env.WEAVIATE_REST_URL!,
    apiKey: process.env.WEAVIATE_API_KEY,
    openaiApiKey: process.env.OPENAI_API_KEY,
  });
  const weaviateClient = getWeaviateClient();
  console.log('  Weaviate initialized');

  // Initialize Firestore
  initFirestore({
    serviceAccount: process.env.FIREBASE_SERVICE_ACCOUNT_KEY!,
    projectId: process.env.FIREBASE_PROJECT_ID!,
  });
  console.log('  Firestore initialized\n');

  // --- Clean if requested ---
  if (isClean) {
    console.log('  Cleaning existing test data...');
    await deleteMemoryCollection(TEST_USER_ID);
    console.log(`  Deleted ${USER_COLLECTION}`);
    console.log('');
  }

  // --- Ensure collections exist ---
  await ensureMemoryCollection(TEST_USER_ID);
  console.log(`  Ensured ${USER_COLLECTION}`);
  await ensurePublicCollection(weaviateClient);
  console.log(`  Ensured ${SPACE_COLLECTION}`);

  // --- Check idempotency ---
  const userCol = getMemoryCollection(TEST_USER_ID);
  const { totalCount } = await userCol.aggregate.overAll();
  if (totalCount > 0 && !isClean) {
    console.log(`\n  ${USER_COLLECTION} already has ${totalCount} memories.`);
    console.log('  Use --clean to wipe and re-seed.\n');
    return;
  }

  const memoryIndex = new MemoryIndexService(logger);

  // --- Seed user collection ---
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  Seeding User Collection');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const userMemService = new MemoryService(
    userCol,
    TEST_USER_ID,
    logger,
    { memoryIndex },
  );

  let userMemCount = 0;
  const baseDate = new Date('2026-02-01T10:00:00Z');

  // Seed topic cluster memories
  for (const cluster of TOPIC_CLUSTERS) {
    for (const mem of cluster.memories) {
      // Vary timestamps across days
      const offset = userMemCount * 3 * 60 * 60 * 1000; // 3 hours apart
      const createdAt = new Date(baseDate.getTime() + offset);

      await userMemService.create({
        content: mem.content,
        title: mem.title,
        type: cluster.contentType,
        tags: [cluster.tag, `content_type:${cluster.contentType}`],
        context_summary: `Seed memory about ${cluster.topic}`,
      });
      userMemCount++;
    }
    console.log(`  Seeded ${cluster.memories.length} ${cluster.topic} memories`);
  }

  // Seed ghost memories
  for (let i = 0; i < ALL_GHOST_IDS.length; i++) {
    const ghostId = ALL_GHOST_IDS[i];
    const ghostMemories = generateGhostMemories(ghostId, i);
    for (const mem of ghostMemories) {
      await userMemService.create({
        content: mem.content,
        title: mem.title,
        type: mem.type,
        tags: mem.tags,
        context_summary: 'Ghost conversation memory',
      });
      userMemCount++;
    }
    console.log(`  Seeded ${ghostMemories.length} ghost memories for ${ghostId}`);
  }

  console.log(`\n  Total user memories seeded: ${userMemCount}`);

  // --- Seed space collection ---
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  Seeding Space Collection');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const spaceCol = weaviateClient.collections.get(SPACE_COLLECTION);
  const spaceMemService = new MemoryService(
    spaceCol,
    TEST_USER_ID,
    logger,
    { memoryIndex },
  );

  for (const mem of SPACE_MEMORIES) {
    await spaceMemService.create({
      content: mem.content,
      title: mem.title,
      type: mem.type,
      tags: [`content_type:${mem.type}`],
      context_summary: 'Space memory seed data',
    });
  }
  console.log(`  Seeded ${SPACE_MEMORIES.length} space memories`);

  // --- Backfill mood state ---
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  Backfilling Mood State');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const moodService = new MoodService();
  for (const ghostId of ALL_GHOST_IDS) {
    await moodService.initializeMood(TEST_USER_ID, ghostId);
    console.log(`  Initialized mood for ${ghostId}`);
  }

  // --- Summary ---
  const finalCount = await userCol.aggregate.overAll();

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  Seed Complete');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log(`  User collection:  ${USER_COLLECTION} (${finalCount.totalCount} memories)`);
  console.log(`  Space collection: ${SPACE_COLLECTION} (${SPACE_MEMORIES.length} memories)`);
  console.log(`  Topic clusters:   ${TOPIC_CLUSTERS.length}`);
  console.log(`  Ghosts:           ${ALL_GHOST_IDS.length} (${GHOST_PERSONAL_IDS.length} personal + 1 space)`);
  console.log(`  Mood states:      ${ALL_GHOST_IDS.length} initialized`);
  console.log(`  Near-duplicates:  yes (carbonara recipe pair, TypeScript generics pair)`);
  console.log('');
  console.log('  Next: test with remember-rem');
  console.log(`    npx tsx scripts/test-fanout.ts --collection=${USER_COLLECTION} --env-file=.env.prod.local --live`);
  console.log('');
}

main()
  .then(() => {
    console.log('  Done.\n');
    process.exit(0);
  })
  .catch((err) => {
    console.error('\n  Fatal error:', err);
    console.error(err.stack);
    process.exit(1);
  });
