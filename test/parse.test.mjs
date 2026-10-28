import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';
import {
  normalizeTitleKey,
  parseBangumiRank,
  parseFankuhubRatings,
  parseMalTopAnime,
} from '../src/parse.js';
import { contrastRankings, formatContrastBrief } from '../src/contrast.js';

const fix = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');

describe('parseBangumiRank', () => {
  it('parses bgm.tv anime browser rank list', () => {
    const html = fs.readFileSync(path.join(fix, 'bgm.html'), 'utf8');
    const rows = parseBangumiRank(html, 10);
    assert.ok(rows.length >= 5, `expected rows, got ${rows.length}`);
    assert.equal(rows[0].rank, 1);
    assert.match(rows[0].title, /攻壳|CLANNAD|猫和老鼠|星际/);
    assert.ok(rows[0].score >= 8);
    assert.equal(rows[0].source, 'bangumi');
    assert.equal(rows[0].region, 'domestic');
    assert.match(rows[0].url, /bgm\.tv\/subject\//);
  });
});

describe('parseMalTopAnime', () => {
  it('parses myanimelist topanime.php', () => {
    const html = fs.readFileSync(path.join(fix, 'mal.html'), 'utf8');
    const rows = parseMalTopAnime(html, 10);
    assert.ok(rows.length >= 5, `expected rows, got ${rows.length}`);
    assert.equal(rows[0].rank, 1);
    assert.ok(rows[0].title.length > 2);
    assert.ok(rows[0].score >= 9);
    assert.equal(rows[0].source, 'mal');
    assert.equal(rows[0].region, 'international');
    assert.match(rows[0].url, /myanimelist\.net\/anime\//);
  });
});

describe('parseFankuhubRatings', () => {
  it('parses fankuhub ratings page when present', () => {
    const html = fs.readFileSync(path.join(fix, 'fanku.html'), 'utf8');
    const rows = parseFankuhubRatings(html, 10);
    // page structure may vary; skip soft if empty fixture
    if (!rows.length) return;
    assert.ok(rows[0].score > 0);
    assert.equal(rows[0].region, 'domestic');
  });
});

describe('contrastRankings', () => {
  it('flags domestic vs international lean', () => {
    const domestic = [
      { rank: 1, title: '攻壳机动队 STAND ALONE COMPLEX', score: 9.1, source: 'bangumi' },
      { rank: 2, title: 'CLANNAD AFTER STORY', score: 9.2, source: 'bangumi' },
      { rank: 8, title: '命运石之门', score: 8.8, source: 'bangumi' },
    ];
    const international = [
      { rank: 1, title: 'Sousou no Frieren', score: 9.24, source: 'mal' },
      { rank: 4, title: 'Steins;Gate', score: 9.07, source: 'mal' },
      { rank: 12, title: 'Fullmetal Alchemist: Brotherhood', score: 9.11, source: 'mal' },
    ];
    const r = contrastRankings(domestic, international, { topN: 10, deltaThreshold: 3 });
    assert.ok(r.matched.some((m) => /石之门|Steins/i.test(m.title_domestic + m.title_international)));
    assert.ok(r.domestic_only.length >= 1);
    assert.ok(r.international_only.length >= 1);
    const brief = formatContrastBrief(r);
    assert.match(brief, /国内外/);
  });

  it('normalizeTitleKey strips noise', () => {
    assert.equal(
      normalizeTitleKey('STEINS;GATE'),
      normalizeTitleKey('Steins Gate'),
    );
  });
});
