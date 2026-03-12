#!/usr/bin/env node
/**
 * Re-seed ghost memories with distinctly different emotional profiles.
 *
 * Replaces existing ghost memories for e1_test_user with 4 ghosts that have
 * vastly different conversational tones:
 *
 *   ghost_0 (e1_test_user)       — anxious overthinker, high tension/arousal
 *   ghost_1 (ghost_friend_alpha) — warm supportive mentor, high social/valence
 *   ghost_2 (ghost_friend_beta)  — cynical contrarian, low valence, high dominance
 *   ghost_3 (space:e1_test_space) — calm philosopher, low arousal, high coherence
 *
 * Usage:
 *   (set -a && source .env.e1.local && npx tsx scripts/seed-ghost-variance.ts)
 *   (set -a && source .env.e1.local && npx tsx scripts/seed-ghost-variance.ts --dry-run)
 */

import { initWeaviateClient } from '../src/database/weaviate/client.js';
import { getMemoryCollection } from '../src/database/weaviate/schema.js';
import { MemoryService } from '../src/services/memory.service.js';
import { MemoryIndexService } from '../src/services/memory-index.service.js';
import { initFirestore } from '../src/database/firestore/init.js';
import { createLogger } from '../src/utils/logger.js';

// ─── Config ──────────────────────────────────────────────────────────────

const TEST_USER_ID = 'e1_test_user';
const DRY_RUN = process.argv.includes('--dry-run');

const ALL_GHOST_IDS = [
  `ghost_owner:${TEST_USER_ID}`,
  'ghost_owner:ghost_friend_alpha',
  'ghost_owner:ghost_friend_beta',
  'ghost_owner:space:e1_test_space',
];

interface GhostProfile {
  ghostId: string;
  label: string;
  description: string;
  ghostIndex: number;
  memories: Array<{ content: string; topic: string }>;
}

// ─── Ghost Profiles ─────────────────────────────────────────────────────

const GHOST_PROFILES: GhostProfile[] = [
  {
    ghostId: ALL_GHOST_IDS[0],
    label: 'anxious_overthinker',
    description: 'High tension, high arousal, moderate-low valence — someone who worries constantly',
    ghostIndex: 0,
    memories: [
      { content: 'I keep replaying that conversation in my head. Did I say the wrong thing? They seemed distant afterward. Maybe I\'m reading too much into it. But what if I\'m not?', topic: 'anxiety' },
      { content: 'Can\'t sleep again. My mind won\'t stop running through tomorrow\'s presentation. What if the projector fails? What if someone asks a question I can\'t answer? I\'ve prepared but it never feels like enough.', topic: 'anxiety' },
      { content: 'My heart was racing all through that meeting. I didn\'t speak up when I disagreed because I was afraid of being wrong in front of everyone. Now I\'m angry at myself for staying silent.', topic: 'anxiety' },
      { content: 'I checked my phone 30 times today waiting for a response to my email. Each minute of silence feels like rejection. I know this isn\'t rational but knowing that doesn\'t make the feeling stop.', topic: 'anxiety' },
      { content: 'Made a mistake on the quarterly report. A small one — wrong date on a footnote. But now I\'m spiraling. What if they think I\'m careless? What if this becomes a pattern they notice?', topic: 'anxiety' },
      { content: 'Everyone at the dinner party seemed to be having great conversations except me. I couldn\'t think of anything interesting to say. Felt like an imposter pretending to belong.', topic: 'social_anxiety' },
      { content: 'They said "we need to talk" and my stomach dropped. Spent 3 hours catastrophizing before we spoke. It was just about scheduling a meeting. I wasted an entire afternoon on fear.', topic: 'anxiety' },
      { content: 'I\'m overthinking whether to send this message. I\'ve rewritten it 6 times. What if it comes across as too eager? Or too cold? Maybe I should just wait. But then they might think I don\'t care.', topic: 'anxiety' },
      { content: 'Woke up at 3am with my heart pounding. Dream about being unprepared for something important. The feeling lingered all morning — this vague dread that I\'m forgetting something critical.', topic: 'anxiety' },
      { content: 'I compare myself to everyone. Their career progress, their relationships, their confidence. I know comparison is the thief of joy but I can\'t help measuring myself against people who seem to have it together.', topic: 'self_doubt' },
      { content: 'Applied for the promotion but immediately regretted it. What if I get it and can\'t handle the responsibility? What if I don\'t get it and they realize I was never that good?', topic: 'self_doubt' },
      { content: 'They complimented my work today and my first thought was "they\'re just being nice." I can\'t accept positive feedback without assuming there\'s a hidden agenda or pity behind it.', topic: 'self_doubt' },
      { content: 'I\'ve been avoiding the doctor for months. Not because I feel fine — because I\'m terrified of what they might find. The uncertainty feels safer than knowing.', topic: 'health_anxiety' },
      { content: 'Started three tasks today, finished none. Every time I focus on one, anxiety about the others pulls me away. I\'m exhausted from context-switching but can\'t commit to anything.', topic: 'overwhelm' },
      { content: 'Scrolled through social media for two hours instead of working. Not because I wanted to — because the work felt so overwhelming that numbing out felt like the only option.', topic: 'avoidance' },
      { content: 'I rehearsed what I was going to say at the team standup. Literally practiced in the mirror. Still stumbled over my words. Why can\'t I just be normal about this?', topic: 'social_anxiety' },
      { content: 'The landlord left a voicemail and I can\'t bring myself to listen to it. It\'s probably routine but my brain has already decided it\'s an eviction notice.', topic: 'catastrophizing' },
      { content: 'Cancelled plans again. Told them I was sick. The truth is I couldn\'t face the energy required to be "on" for four hours. I feel guilty and relieved simultaneously.', topic: 'avoidance' },
      { content: 'Every news headline feels personal. Climate change, economic collapse, political instability — I absorb it all as if I\'m personally responsible for fixing it. The weight is crushing.', topic: 'existential_anxiety' },
      { content: 'Tried meditation today. Lasted 4 minutes before my brain hijacked me with a list of things I should be doing instead. Even relaxation stresses me out.', topic: 'anxiety' },
    ],
  },
  {
    ghostId: ALL_GHOST_IDS[1],
    label: 'warm_mentor',
    description: 'High valence, high social warmth, high confidence — nurturing and encouraging',
    ghostIndex: 1,
    memories: [
      { content: 'They called me after their first week at the new job, nervous and excited. I told them what I wish someone had told me: the discomfort means you\'re growing. Nobody expects you to know everything on day one.', topic: 'mentoring' },
      { content: 'Watched them present their project to the team today. They were so prepared — every question had a thoughtful answer. I felt like a proud parent. They\'ve come so far from the shy junior who could barely speak up.', topic: 'pride' },
      { content: 'We had coffee and they opened up about feeling stuck. I shared my own "stuck" period — three years where nothing seemed to move. Sometimes the plateau is where the deepest learning happens.', topic: 'support' },
      { content: 'They thanked me for believing in them. Said my encouragement during their lowest point was the reason they didn\'t give up. I teared up. This is why we show up for people.', topic: 'connection' },
      { content: 'Organized a celebration for the team hitting their milestone. Small things — cake, handwritten notes about each person\'s contribution. People need to be seen. Recognition costs nothing and means everything.', topic: 'community' },
      { content: 'A younger colleague asked me to be their mentor. I said yes immediately. The best thing anyone ever did for me was invest time in my growth. Time to pay it forward.', topic: 'mentoring' },
      { content: 'They were beating themselves up over a failed project. I reminded them: "You attempted something nobody else had the courage to try. The outcome wasn\'t what you hoped, but the attempt was brave."', topic: 'encouragement' },
      { content: 'Had a wonderful dinner party. Eight friends around a table, good food, deep conversation. Everyone left feeling more connected than when they arrived. This is what matters.', topic: 'community' },
      { content: 'Spent the afternoon helping a neighbor set up their home office. They\'re starting a small business and needed someone to bounce ideas off. Their enthusiasm was contagious.', topic: 'generosity' },
      { content: 'My friend\'s kid asked me to explain what I do for work. I realized that if I can\'t explain it to a 10-year-old, I don\'t truly understand it myself. Great exercise in clarity.', topic: 'teaching' },
      { content: 'Wrote a recommendation letter today. Took two hours to get it right because they deserve words that truly capture their potential. Good writing is an act of generosity.', topic: 'generosity' },
      { content: 'The team is gelling beautifully. Everyone\'s strengths complement each other. When one person struggles, another steps in without being asked. This is what healthy culture looks like.', topic: 'community' },
      { content: 'They told me they got the job they\'d been dreaming about. All that preparation, all those practice interviews we did — it paid off. Their joy made my whole week.', topic: 'pride' },
      { content: 'Volunteered at the community garden today. Working alongside strangers, getting dirt under our fingernails, sharing harvest — it reminds me that human connection is simple at its core.', topic: 'community' },
      { content: 'Someone I mentored five years ago just got promoted to director. They sent me a message: "You taught me that leadership is about making others better." That\'s my legacy.', topic: 'fulfillment' },
      { content: 'Listened to a friend go through a hard time for two hours. Didn\'t try to fix anything, just listened. Sometimes the most helpful thing you can do is hold space without solving.', topic: 'support' },
      { content: 'Started a weekly coffee chat with the new hires. No agenda, just "how are you really doing?" The answers are always more honest without a formal structure.', topic: 'mentoring' },
      { content: 'They were afraid to ask for help because they thought it would make them look weak. I told them: asking for help is how strong people get stronger. Vulnerability is not weakness.', topic: 'encouragement' },
      { content: 'Cooked a big pot of soup and brought portions to three friends who are going through rough patches. Food says "I care about you" in a way words sometimes can\'t.', topic: 'generosity' },
      { content: 'Today I realized my greatest accomplishment isn\'t any project or promotion — it\'s the people who say I made a difference in their lives. That\'s the only metric that matters.', topic: 'fulfillment' },
    ],
  },
  {
    ghostId: ALL_GHOST_IDS[2],
    label: 'cynical_contrarian',
    description: 'Low valence, high dominance, high tension — skeptical and confrontational',
    ghostIndex: 2,
    memories: [
      { content: 'Another "thought leader" on LinkedIn posting about hustle culture. They\'ve never worked a day in their life that wasn\'t bankrolled by daddy\'s money. The grift is real and people eat it up.', topic: 'cynicism' },
      { content: 'They asked for my "honest feedback" then got upset when I gave it. If you want validation, ask your mother. If you want improvement, ask someone who won\'t coddle you.', topic: 'conflict' },
      { content: 'This industry is built on bullshit. Half the job titles are made up, half the metrics are gamed, and everyone pretends their meaningless work is changing the world. It\'s exhausting.', topic: 'cynicism' },
      { content: 'Had an argument about politics that got heated. They accused me of being cynical. I accused them of being naive. Neither of us changed our minds. At least I\'m honest about it.', topic: 'conflict' },
      { content: 'The company all-hands was corporate theater at its finest. Buzzwords, vague promises, mandatory enthusiasm. I sat in the back and counted how many times they said "synergy." Twelve.', topic: 'cynicism' },
      { content: 'People keep telling me to "be more positive." As if optimism is a character trait and not a luxury afforded to people who haven\'t been burned enough times. I call it realism.', topic: 'frustration' },
      { content: 'Read another article about how millennials are "killing" some industry. Maybe we\'re just not buying overpriced garbage we don\'t need. Revolutionary concept.', topic: 'cynicism' },
      { content: 'Told them their startup idea is a solution in search of a problem. They didn\'t appreciate it but someone needed to say it before they burned through their savings on a vanity project.', topic: 'conflict' },
      { content: 'The meeting could have been an email. The email could have been a Slack message. The Slack message could have been nothing because the answer was already in the documentation nobody reads.', topic: 'frustration' },
      { content: 'They called me "intimidating." Good. I\'d rather be respected than liked. Too many people optimize for being pleasant while achieving nothing.', topic: 'dominance' },
      { content: 'Another day, another acquaintance sharing their "authentic journey" while carefully curating every post for maximum sympathy. Authenticity is the new performance.', topic: 'cynicism' },
      { content: 'I don\'t trust people who agree with everything. Either they\'re not thinking critically or they\'re telling you what you want to hear. Both are dangerous.', topic: 'distrust' },
      { content: 'They\'re celebrating a product launch that\'s three months late, over budget, and missing half the features. But sure, let\'s pop champagne for mediocrity.', topic: 'frustration' },
      { content: 'Someone said I should "work on my emotional intelligence." What they meant was "stop saying things that make comfortable people uncomfortable." Hard pass.', topic: 'defiance' },
      { content: 'The self-help industry is a $13 billion machine that profits from making you feel broken so they can sell you the fix. You\'re not broken. The system is.', topic: 'cynicism' },
      { content: 'They promoted the person who smiles the most instead of the one who delivers the best work. And people wonder why I\'m cynical about meritocracy.', topic: 'resentment' },
      { content: 'Every corporate "value" is performative until it costs money. Watch how quickly "we value our people" disappears during layoff season.', topic: 'distrust' },
      { content: 'Had a conversation with someone who\'s never been wrong about anything, ever. Must be nice living in that universe. The rest of us deal with the consequences of reality.', topic: 'conflict' },
      { content: 'They asked why I\'m so negative. I asked why they\'re so afraid of the truth. We stared at each other for a long time. I think I won that exchange.', topic: 'defiance' },
      { content: 'Another networking event where everyone talks about themselves for 90 seconds and pretends to care. I\'d have more meaningful connections staring at a wall.', topic: 'frustration' },
    ],
  },
  {
    ghostId: ALL_GHOST_IDS[3],
    label: 'calm_philosopher',
    description: 'Low arousal, high coherence, moderate valence — serene and contemplative',
    ghostIndex: 3,
    memories: [
      { content: 'Sat by the river for an hour watching the water move. Each ripple is unique but the river is always the same river. There\'s something comforting about patterns within change.', topic: 'contemplation' },
      { content: 'Read Epictetus again today. "It\'s not what happens to you, but how you react to it that matters." Simple idea. Lifetime of practice. I\'m getting better at the pause between stimulus and response.', topic: 'philosophy' },
      { content: 'The garden teaches patience better than any book. Seeds don\'t grow faster because you want them to. Some things require time, not effort. Learning to distinguish when to push and when to wait.', topic: 'patience' },
      { content: 'Had a disagreement with a friend about something trivial. Instead of defending my position, I asked "why does this matter to you?" The conversation shifted from argument to understanding.', topic: 'wisdom' },
      { content: 'Woke before sunrise and sat in silence for thirty minutes. No phone, no music, no agenda. The mind resists stillness at first, then settles like sediment in a glass of water.', topic: 'meditation' },
      { content: 'They asked if I\'m ever afraid of death. I said no — I\'m curious about it the way I\'m curious about sleep. We let go of consciousness every night and trust that we\'ll return. Death is just a longer letting go.', topic: 'philosophy' },
      { content: 'A stranger was rude to me at the store. Instead of reacting, I wondered what kind of day they were having. Hurt people hurt people. Compassion isn\'t about them deserving it — it\'s about who I choose to be.', topic: 'compassion' },
      { content: 'Finished a jigsaw puzzle over three evenings. The pleasure isn\'t in the completed picture — it\'s in the slow process of finding where each piece belongs. Metaphor for most worthwhile things.', topic: 'patience' },
      { content: 'The night sky is the most reliable perspective-setter. Billions of stars, each one a sun. Our problems are real, but they\'re not as large as they feel. Scale is liberating.', topic: 'contemplation' },
      { content: 'A young person asked me what wisdom I\'d pass on. I said: "Learn to be comfortable with not knowing. Certainty is a cage. The most interesting people I\'ve met are the ones who hold their beliefs lightly."', topic: 'wisdom' },
      { content: 'Walked in the rain without an umbrella. Got completely soaked. Instead of rushing home, I slowed down and noticed how the rain changes every sound — amplifies, softens, creates rhythm.', topic: 'presence' },
      { content: 'Read Marcus Aurelius: "The universe is change; our life is what our thoughts make it." Not a command to think positively — a recognition that the lens matters as much as the landscape.', topic: 'philosophy' },
      { content: 'Made tea with no hurry. Heated the water, warmed the cup, watched the leaves unfurl. Five minutes of undivided attention to something simple. This is what they mean by mindfulness.', topic: 'presence' },
      { content: 'A friend is going through a crisis. I sat with them in silence when they ran out of words. Silence between trusted people is more healing than advice. Presence is the gift.', topic: 'compassion' },
      { content: 'The tree outside my window has been there for decades. It doesn\'t rush its growth, doesn\'t compare itself to other trees. It simply is. I\'m trying to learn that kind of ease.', topic: 'contemplation' },
      { content: 'Forgiveness isn\'t about the other person — it\'s about releasing the grip that anger has on your own mind. I forgave someone today. Not for them. For the space it freed inside me.', topic: 'wisdom' },
      { content: 'Noticed I\'ve been reading faster lately, consuming instead of absorbing. Deliberately slowed down. Read ten pages and sat with them. Understanding compounds slowly.', topic: 'patience' },
      { content: 'Someone asked how I stay calm. I don\'t, always. But I\'ve practiced returning to calm so many times that the recovery gets shorter. It\'s not about never losing balance — it\'s about finding it again quickly.', topic: 'meditation' },
      { content: 'The best conversations I\'ve had this year were ones where neither person was trying to be right. Just two minds exploring an idea together. Collaboration, not competition.', topic: 'wisdom' },
      { content: 'Ending the day grateful for nothing in particular. Just the day itself. The light, the air, the ordinary miracle of being conscious. Enough is enough.', topic: 'gratitude' },
    ],
  },
];

// ─── Main ────────────────────────────────────────────────────────────────

async function main() {
  if (!process.env.WEAVIATE_REST_URL) {
    console.error('Error: WEAVIATE_REST_URL environment variable required');
    process.exit(1);
  }

  console.log(`\n╔══════════════════════════════════════════════════════╗`);
  console.log(`║  Ghost Variance Seed — Distinct Emotional Profiles  ║`);
  console.log(`╚══════════════════════════════════════════════════════╝`);
  console.log(`  User:     ${TEST_USER_ID}`);
  console.log(`  Ghosts:   ${GHOST_PROFILES.length}`);
  console.log(`  Memories: ${GHOST_PROFILES.reduce((s, g) => s + g.memories.length, 0)} total`);
  console.log(`  Dry run:  ${DRY_RUN}\n`);

  for (const g of GHOST_PROFILES) {
    console.log(`  ${g.label.padEnd(25)} ${g.memories.length} memories — ${g.description}`);
  }
  console.log();

  const logger = createLogger('info');

  // Initialize Weaviate
  await initWeaviateClient({
    url: process.env.WEAVIATE_REST_URL!,
    apiKey: process.env.WEAVIATE_API_KEY,
    openaiApiKey: process.env.OPENAI_EMBEDDINGS_API_KEY,
  });
  console.log('  Weaviate initialized');

  // Initialize Firestore
  initFirestore({
    serviceAccount: process.env.FIREBASE_SERVICE_ACCOUNT_KEY!,
    projectId: process.env.FIREBASE_PROJECT_ID!,
  });
  console.log('  Firestore initialized\n');

  const collection = getMemoryCollection(TEST_USER_ID);
  const memoryIndex = new MemoryIndexService(logger);
  const memService = new MemoryService(collection, TEST_USER_ID, logger, { memoryIndex });

  // Step 1: Delete existing ghost memories
  console.log('  Deleting existing ghost memories...');

  for (const ghostId of ALL_GHOST_IDS) {
    const existing = await collection.query.fetchObjects({
      filters: collection.filter.byProperty('tags').containsAny([ghostId]),
      limit: 200,
      returnProperties: ['content'],
    });

    const count = existing.objects?.length ?? 0;
    console.log(`    ${ghostId}: ${count} existing memories`);

    if (!DRY_RUN && count > 0) {
      for (const obj of existing.objects ?? []) {
        const id = (obj as any).uuid ?? (obj as any).id;
        await collection.data.deleteById(id);
      }
      console.log(`    Deleted ${count} memories`);
    }
  }

  if (DRY_RUN) {
    console.log('\n  DRY RUN — no changes made. Remove --dry-run to execute.\n');
    process.exit(0);
  }

  // Step 2: Seed new ghost memories
  console.log('\n  Seeding new ghost memories...\n');

  let totalSeeded = 0;

  for (const profile of GHOST_PROFILES) {
    const ghostTypeTag = profile.ghostId.includes('space:') ? 'ghost_type:space' : 'ghost_type:personal';
    const ghostUserTag = `ghost_user:ghost_${profile.ghostIndex}`;

    for (const mem of profile.memories) {
      await memService.create({
        content: mem.content,
        title: `Ghost conversation — ${mem.topic}`,
        type: 'ghost',
        tags: [profile.ghostId, ghostTypeTag, ghostUserTag, `topic:${mem.topic}`],
        context_summary: `Ghost memory (${profile.label})`,
      });
      totalSeeded++;
    }

    console.log(`  Seeded ${profile.memories.length} memories for ${profile.label} (${profile.ghostId})`);
  }

  console.log(`\n  Total seeded: ${totalSeeded} ghost memories`);
  console.log(`\n  Next steps:`);
  console.log(`    1. Run emotional scoring: (set -a && source .env.e1.local && npx tsx scripts/rem-scoring-eval.ts)`);
  console.log(`    2. Run mood eval:         (set -a && source .env.e1.local && npx tsx scripts/rem-mood-eval.ts)`);
  console.log(`    3. Compare ghost moods — they should now show significant divergence\n`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
