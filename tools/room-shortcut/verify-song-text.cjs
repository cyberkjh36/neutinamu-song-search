const assert = require('node:assert/strict');

module.exports = async function verifySongText(page) {
  // The preceding voice-search flow has already selected a song from the catalog.
  const title = '가로수 그늘 아래 서면 (아주 긴 제목의 라이브 버전) ' + 'LongSongTitle'.repeat(4);
  const artist = '함께 부른 가수들과 ' + 'LongArtistName'.repeat(4);
  async function fits(selector, sample, minFont) {
    const size = await page.locator(selector).first().evaluate((el, text) => {
      const original = el.textContent;
      el.textContent = text;
      try {
        const s = getComputedStyle(el);
        const range = document.createRange();
        range.selectNodeContents(el);
        const host = el.closest('button, #hero, #nativeNowPlaying').getBoundingClientRect();
        const lines = [...range.getClientRects()];
        return {
          font:parseFloat(s.fontSize), wraps:el.offsetHeight > 1.75 * parseFloat(s.lineHeight),
          inside:lines.length > 0 && lines.every(r => r.left >= Math.max(0,host.left) - 1 &&
            r.right <= Math.min(document.documentElement.clientWidth,host.right) + 1),
          unclipped:el.scrollHeight <= el.clientHeight + 1 && el.scrollWidth <= el.clientWidth + 1
        };
      } finally { el.textContent = original; }
    }, sample);
    assert(size.font >= minFont && size.wraps && size.inside && size.unclipped,
      selector + ' at ' + page.viewportSize().width + 'px: ' + JSON.stringify(size));
  }
  for (const width of [320,390,430]) {
    await page.setViewportSize({width,height:800});
    await fits('#heroTitle',title,40);
    await fits('#heroArtist',artist,30);
    await fits('.result .songtitle',title,34);
    await fits('.result .songartist',artist,26);
    await page.locator('#favoriteShortcuts button[data-category="trot"]').click();
    await fits('.favorite-song-title',title,34);
    await fits('.favorite-song-artist',artist,26);
    await page.locator('#favoritesClose').click();
  }
  await page.setViewportSize({width:320,height:720});
  await page.locator('#nativeQueueNav').click();
  await fits('#nativeQueueList .queue-song strong',title,34);
  await fits('#nativeQueueList .queue-song > span',artist,26);
  await fits('#nativeNowTitle',title,40);
  await fits('#nativeNowArtist',artist,30);
  await page.locator('#nativeQueueClose').click();
};
