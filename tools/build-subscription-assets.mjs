import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputDirectory = path.join(projectRoot, 'assets', 'subscriptions');
const sourceDirectory = path.join(outputDirectory, 'source');

const skus = [
  {
    edition: 'universal',
    tier: 'core',
    tierNumber: 1,
    name: 'Luminox Universal Core',
    price: '€4.99 / month',
    description: 'Turn everyday Discord activity into visible progress with Loyalty, rankings and structured staff participation for growing gaming communities.',
    benefits: [
      ['✅', 'Everything in Universal Free', 'Private Support, general Events, Timezones, Moderation Log, Automod and Autodelete remain included.'],
      ['🏆', 'Loyalty & Rankings', 'Adds Leaderboards, Loyalty Points, Server Boost Loyalty and Streaming Loyalty.'],
      ['🗳️', 'Staff Workflows', 'Adds Public Staff Applications and Private Staff Voting.'],
      ['📊', 'Core Capacity', 'Up to 10 active events, 6 Support categories and 10 Automod channels.'],
      ['⚡', 'Faster Updates', '10-minute eligible external refresh policy and 3-minute cached panel refresh policy.'],
      ['🗄️', 'History & Support', 'Two years of useful history with Premium support.']
    ]
  },
  {
    edition: 'universal',
    tier: 'growth',
    tierNumber: 2,
    name: 'Luminox Universal Growth',
    price: '€9.99 / month',
    description: 'Give active communities more room to operate with higher capacity, quicker live information and longer retained history.',
    benefits: [
      ['✅', 'Everything in Universal Core', 'All Universal Core functions and workflows remain included.'],
      ['📊', 'Growth Capacity', 'Up to 30 active events, 15 Support categories and 30 Automod channels.'],
      ['⚡', 'Faster Updates', '5-minute eligible external refreshes and 2-minute cached panel refreshes.'],
      ['🗄️', 'Five-Year History', 'Retains useful operational history for up to five years.'],
      ['🧭', 'Priority Guidance', 'Includes priority configuration guidance for a smoother rollout.']
    ]
  },
  {
    edition: 'universal',
    tier: 'scale',
    tierNumber: 3,
    name: 'Luminox Universal Scale',
    price: '€19.99 / month',
    description: 'Run every public Universal feature at maximum capacity with the fastest updates, long-term history and priority rollout support.',
    benefits: [
      ['✅', 'Everything in Universal Growth', 'All Universal Growth functions, workflows and Premium access remain included.'],
      ['📊', 'Maximum Capacity', 'Up to 100 active events, 25 Support categories and 100 Automod channels.'],
      ['⚡', 'Fastest Updates', '2-minute eligible external refreshes and 1-minute cached panel refreshes.'],
      ['🗄️', 'Ten-Year History', 'Retains useful operational history for up to ten years.'],
      ['🛠️', 'Priority Setup Support', 'Includes priority setup support for large or established communities.']
    ]
  },
  {
    edition: 'community',
    tier: 'core',
    tierNumber: 1,
    name: 'Luminox Community Core',
    price: '€7.99 / month',
    description: 'Reward Tibia guild activity and strengthen world awareness with advanced events, Loyalty and live risk monitoring.',
    benefits: [
      ['✅', 'Everything in Community Free', 'Verified Tibia identity, Guild List, levels, deaths, Hunts, general Events, Support and moderation remain included.'],
      ['🏆', 'Loyalty & Staff Systems', 'Adds Leaderboards, Loyalty, Boost and Stream rewards, Staff Applications and Staff Voting.'],
      ['⚔️', 'Advanced Tibia Events', 'Adds dedicated Boss and Quest event boards.'],
      ['👁️', 'Risk Intelligence', 'Adds Tibia Watchlists, Blacklist and Enemies Online monitoring for the configured world.'],
      ['📊', 'Core Capacity', 'Up to 10 active events, 6 Support categories and 10 Automod channels.'],
      ['⚡', 'Refresh, History & Support', '10-minute external refreshes, 3-minute cached panels, two-year history and Premium support.']
    ]
  },
  {
    edition: 'community',
    tier: 'growth',
    tierNumber: 2,
    name: 'Luminox Community Growth',
    price: '€14.99 / month',
    description: 'Connect recruitment, enemy intelligence, guild economy, loot and housing in one complete Tibia guild workflow.',
    benefits: [
      ['✅', 'Everything in Community Core', 'All Community Core functions, Tibia systems and workflows remain included.'],
      ['🧭', 'Recruitment & Intelligence', 'Adds Recruitment, Identity Tracker and Finder.'],
      ['🛡️', 'Guards & Enemy Operations', 'Adds Guards and connected enemy-battle tracking workflows.'],
      ['💰', 'Guild Economy & Housing', 'Adds GuildBank, Loot Split and Guildhall room management.'],
      ['📊', 'Growth Capacity', 'Up to 30 active events, 15 Support categories and 30 Automod channels.'],
      ['⚡', 'Refresh, History & Guidance', '5-minute external refreshes, 2-minute cached panels, five-year history and priority configuration guidance.']
    ]
  },
  {
    edition: 'community',
    tier: 'scale',
    tierNumber: 3,
    name: 'Luminox Community Scale',
    price: '€29.99 / month',
    description: 'Operate every public Tibia guild feature at maximum capacity with the fastest updates, long-term history and priority rollout support.',
    benefits: [
      ['✅', 'Everything in Community Growth', 'Every public Community Growth function and connected Tibia workflow remains included.'],
      ['📊', 'Maximum Capacity', 'Up to 100 active events, 25 Support categories and 100 Automod channels.'],
      ['⚡', 'Fastest Updates', '2-minute eligible external refreshes and 1-minute cached panel refreshes.'],
      ['🗄️', 'Ten-Year History', 'Retains useful operational history for up to ten years.'],
      ['🛠️', 'Priority Setup Support', 'Includes priority setup support for large or established guilds.']
    ]
  }
];

function validateCatalog() {
  for (const sku of skus) {
    if (sku.name.length > 80) {
      throw new Error(`${sku.name}: SKU name exceeds 80 characters.`);
    }
    if (sku.description.length > 160) {
      throw new Error(`${sku.name}: description exceeds 160 characters (${sku.description.length}).`);
    }
    if (sku.benefits.length > 6) {
      throw new Error(`${sku.name}: more than 6 benefits.`);
    }
    for (const [, title, description] of sku.benefits) {
      if (title.length > 80) {
        throw new Error(`${sku.name}: benefit title exceeds 80 characters.`);
      }
      if (description.length > 160) {
        throw new Error(`${sku.name}: benefit description exceeds 160 characters.`);
      }
    }
  }
}

function markdownCatalog() {
  const lines = [
    '# Discord Subscription SKU Copy',
    '',
    'Use **Guild Subscription** for every paid SKU. Each subscription applies to one Discord server and renews monthly.',
    '',
    'Do not create a Free SKU. Free access is the default when a server has no active paid entitlement. Founder Edition is private and is not a public SKU.',
    '',
    'Discord limits used here: SKU name up to 80 characters, SKU description up to 160 characters, and up to 6 benefits with titles and descriptions up to 80 and 160 characters respectively.',
    ''
  ];

  for (const sku of skus) {
    const fileBase = `${sku.edition}-${sku.tier}`;
    lines.push(
      `## ${sku.name}`,
      '',
      `- **Subscription type:** Guild Subscription`,
      `- **Billing:** Monthly recurring`,
      `- **Price:** ${sku.price}`,
      `- **Image:** \`assets/subscriptions/${fileBase}.png\``,
      '',
      '**Description**',
      '',
      sku.description,
      '',
      '**Benefits**',
      ''
    );

    sku.benefits.forEach(([emoji, title, description], index) => {
      lines.push(
        `${index + 1}. **Emoji:** ${emoji}`,
        `   - **Benefit title:** ${title}`,
        `   - **Benefit description:** ${description}`
      );
    });

    lines.push('');
  }

  return `${lines.join('\n')}\n`;
}

validateCatalog();
await fs.mkdir(outputDirectory, { recursive: true });

for (const sku of skus) {
  const fileBase = `${sku.edition}-${sku.tier}`;
  const sourcePath = path.join(sourceDirectory, `${fileBase}.png`);
  const pngPath = path.join(outputDirectory, `${fileBase}.png`);
  const artworkSize = { core: 198, growth: 216, scale: 226 }[sku.tier];
  const canvasPadding = (250 - artworkSize) / 2;

  await fs.access(sourcePath);
  await sharp(sourcePath)
    .trim({ background: { r: 0, g: 0, b: 0, alpha: 0 }, threshold: 2 })
    .resize(artworkSize, artworkSize, {
      fit: 'contain',
      kernel: sharp.kernel.lanczos3,
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    })
    .extend({
      top: canvasPadding,
      bottom: canvasPadding,
      left: canvasPadding,
      right: canvasPadding,
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    })
    .png({ compressionLevel: 9, palette: false })
    .toFile(pngPath);
}

await fs.writeFile(
  path.join(outputDirectory, 'discord-sku-copy.md'),
  markdownCatalog(),
  'utf8'
);

console.log(`Built ${skus.length} Discord subscription images from approved source artwork and refreshed the SKU copy in ${outputDirectory}`);
